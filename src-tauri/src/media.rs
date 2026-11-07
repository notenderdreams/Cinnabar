//! Image encoding and resizing independent of Tauri.

use anyhow::{Context, Result};
use base64::Engine;
use std::io::Cursor;

/// Native image compression & downscaling
pub(crate) fn compress_image(data_url: &str, max_width: u32, quality: u8) -> Result<String> {
    let encoded = data_url
        .split_once(',')
        .map(|(_, data)| data)
        .unwrap_or(data_url);

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .context("Invalid base64")?;

    let dynamic_img = image::load_from_memory(&bytes).context("Failed to decode image")?;

    let (w, h) = (dynamic_img.width(), dynamic_img.height());
    let target_img = if max_width > 0 && w > max_width {
        let new_h = ((h as f64) * (max_width as f64 / w as f64)).round() as u32;
        dynamic_img.resize(max_width, new_h, image::imageops::FilterType::Triangle)
    } else {
        dynamic_img
    };

    let mut output = Vec::new();
    let q = if quality == 0 || quality > 100 {
        85
    } else {
        quality
    };

    // Save as JPEG if high compression is needed, else PNG
    if q < 90 {
        let mut cursor = Cursor::new(&mut output);
        let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, q);
        encoder
            .encode_image(&target_img)
            .context("JPEG encode failed")?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&output);
        Ok(format!("data:image/jpeg;base64,{b64}"))
    } else {
        let mut cursor = Cursor::new(&mut output);
        target_img
            .write_to(&mut cursor, image::ImageFormat::Png)
            .context("PNG encode failed")?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&output);
        Ok(format!("data:image/png;base64,{b64}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source_image() -> String {
        let image = image::RgbImage::from_pixel(8, 4, image::Rgb([20, 40, 60]));
        let mut bytes = Cursor::new(Vec::new());
        image.write_to(&mut bytes, image::ImageFormat::Png).unwrap();
        format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes.into_inner())
        )
    }

    #[test]
    fn compression_preserves_aspect_ratio_and_encoding_choices() {
        let source = source_image();
        for (quality, mime, format) in [
            (85, "jpeg", image::ImageFormat::Jpeg),
            (95, "png", image::ImageFormat::Png),
        ] {
            let compressed = compress_image(&source, 4, quality).unwrap();
            assert!(compressed.starts_with(&format!("data:image/{mime};base64,")));
            let (_, encoded) = compressed.split_once(',').unwrap();
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(encoded)
                .unwrap();
            assert_eq!(image::guess_format(&bytes).unwrap(), format);
            let decoded = image::load_from_memory(&bytes).unwrap();
            assert_eq!((decoded.width(), decoded.height()), (4, 2));
        }
    }

    #[test]
    fn invalid_images_return_contextual_errors() {
        assert!(compress_image("not base64!", 4, 85)
            .unwrap_err()
            .to_string()
            .contains("Invalid base64"));
        assert!(compress_image("bm90IGFuIGltYWdl", 4, 85)
            .unwrap_err()
            .to_string()
            .contains("Failed to decode image"));
    }
}
