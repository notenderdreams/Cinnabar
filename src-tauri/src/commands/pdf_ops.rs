use crate::commands::error::CommandResult;
use lopdf::{dictionary, Document, Object, ObjectId};
use std::collections::BTreeMap;

/// Delete a page from PDF bytes using native lopdf parser and serializer
#[tauri::command]
#[specta::specta]
pub fn delete_pdf_page_native(pdf_bytes: Vec<u8>, page_number: u32) -> CommandResult<Vec<u8>> {
    let mut doc =
        Document::load_mem(&pdf_bytes).map_err(|e| format!("Failed to parse PDF: {e}"))?;
    let pages = doc.get_pages();
    let page_count = pages.len();
    if page_count <= 1 {
        return Err("A PDF must keep at least one page.".to_string());
    }
    if page_number < 1 || page_number > page_count as u32 {
        return Err(format!("Page {page_number} does not exist."));
    }

    doc.delete_pages(&[page_number]);

    let mut output = Vec::new();
    doc.save_to(&mut output)
        .map_err(|e| format!("Failed to save PDF: {e}"))?;
    Ok(output)
}

/// Insert a blank page after the target page with identical dimensions and rotation
#[tauri::command]
#[specta::specta]
pub fn add_blank_page_below_native(pdf_bytes: Vec<u8>, page_number: u32) -> CommandResult<Vec<u8>> {
    let mut doc =
        Document::load_mem(&pdf_bytes).map_err(|e| format!("Failed to parse PDF: {e}"))?;
    let pages: BTreeMap<u32, ObjectId> = doc.get_pages();
    let page_count = pages.len();
    if page_number < 1 || page_number > page_count as u32 {
        return Err(format!("Page {page_number} does not exist."));
    }

    let target_page_id = *pages
        .get(&page_number)
        .ok_or_else(|| format!("Page {page_number} not found"))?;

    let (parent_id, media_box, crop_box, rotate) = {
        let page_obj = doc
            .objects
            .get(&target_page_id)
            .ok_or_else(|| "Target page object missing".to_string())?;
        let page_dict = page_obj
            .as_dict()
            .map_err(|_| "Target page is not a dictionary".to_string())?;

        let parent = page_dict
            .get(b"Parent")
            .and_then(Object::as_reference)
            .map_err(|_| "Target page missing Parent reference".to_string())?;

        let media = page_dict
            .get(b"MediaBox")
            .cloned()
            .unwrap_or_else(|_| Object::Array(vec![0.into(), 0.into(), 595.into(), 842.into()]));

        let crop = page_dict.get(b"CropBox").cloned().ok();
        let rot = page_dict.get(b"Rotate").cloned().ok();

        (parent, media, crop, rot)
    };

    let new_page_id = doc.new_object_id();
    let mut new_page_dict = dictionary! {
        "Type" => "Page",
        "Parent" => parent_id,
        "MediaBox" => media_box,
        "Resources" => dictionary! {},
    };

    if let Some(crop) = crop_box {
        new_page_dict.set("CropBox", crop);
    }
    if let Some(rot) = rotate {
        new_page_dict.set("Rotate", rot);
    }

    doc.objects
        .insert(new_page_id, Object::Dictionary(new_page_dict));

    // Insert new page into Parent Kids array after target_page_id
    let mut current_parent_ref = Ok(parent_id);
    let mut is_direct_parent = true;

    while let Ok(current_id) = current_parent_ref {
        if let Some(page_tree) = doc
            .objects
            .get_mut(&current_id)
            .and_then(|pt| pt.as_dict_mut().ok())
        {
            if is_direct_parent {
                if let Ok(kids) = page_tree.get_mut(b"Kids").and_then(Object::as_array_mut) {
                    let insert_pos = kids
                        .iter()
                        .position(|k| match k {
                            Object::Reference(id) => *id == target_page_id,
                            _ => false,
                        })
                        .map(|pos| pos + 1)
                        .unwrap_or(kids.len());

                    kids.insert(insert_pos, Object::Reference(new_page_id));
                }
                is_direct_parent = false;
            }

            if let Ok(count) = page_tree.get(b"Count").and_then(Object::as_i64) {
                page_tree.set("Count", count + 1);
            }

            current_parent_ref = page_tree.get(b"Parent").and_then(Object::as_reference);
        } else {
            break;
        }
    }

    let mut output = Vec::new();
    doc.save_to(&mut output)
        .map_err(|e| format!("Failed to save PDF: {e}"))?;
    Ok(output)
}

/// Fast native SHA-256 fingerprint of PDF document bytes
#[tauri::command]
#[specta::specta]
pub fn compute_pdf_fingerprint(pdf_bytes: Vec<u8>) -> CommandResult<String> {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(&pdf_bytes);
    let result = hasher.finalize();
    Ok(format!("{:x}", result))
}

/// Native image compression & downscaling
#[tauri::command]
#[specta::specta]
pub fn compress_image_native(
    data_url: String,
    max_width: u32,
    quality: u8,
) -> CommandResult<String> {
    use base64::Engine;
    use std::io::Cursor;

    let encoded = data_url
        .split_once(',')
        .map(|(_, data)| data)
        .unwrap_or(&data_url);

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| format!("Invalid base64: {e}"))?;

    let dynamic_img =
        image::load_from_memory(&bytes).map_err(|e| format!("Failed to decode image: {e}"))?;

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
            .map_err(|e| format!("JPEG encode failed: {e}"))?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&output);
        Ok(format!("data:image/jpeg;base64,{b64}"))
    } else {
        let mut cursor = Cursor::new(&mut output);
        target_img
            .write_to(&mut cursor, image::ImageFormat::Png)
            .map_err(|e| format!("PNG encode failed: {e}"))?;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&output);
        Ok(format!("data:image/png;base64,{b64}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_pdf(pages_count: usize) -> Vec<u8> {
        let mut document = Document::with_version("1.5");
        let pages_id = document.new_object_id();
        let page_ids = (0..pages_count)
            .map(|i| {
                document.add_object(dictionary! {
                    "Type" => "Page",
                    "Parent" => pages_id,
                    "MediaBox" => vec![0.into(), 0.into(), ((i + 1) as i64 * 100).into(), 200.into()],
                })
            })
            .collect::<Vec<_>>();
        document.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages",
                "Kids" => page_ids.iter().copied().map(Object::Reference).collect::<Vec<_>>(),
                "Count" => pages_count as i64,
            }),
        );
        let catalog_id = document.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        });
        document.trailer.set("Root", catalog_id);
        let mut buf = Vec::new();
        document.save_to(&mut buf).unwrap();
        buf
    }

    #[test]
    fn test_native_page_deletion() {
        let pdf = create_test_pdf(3);
        let updated = delete_pdf_page_native(pdf, 2).unwrap();
        let reloaded = Document::load_mem(&updated).unwrap();
        assert_eq!(reloaded.get_pages().len(), 2);
    }

    #[test]
    fn test_native_page_deletion_single_page_fails() {
        let pdf = create_test_pdf(1);
        let result = delete_pdf_page_native(pdf, 1);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "A PDF must keep at least one page.");
    }

    #[test]
    fn test_native_page_insertion() {
        let pdf = create_test_pdf(2);
        let updated = add_blank_page_below_native(pdf, 1).unwrap();
        let reloaded = Document::load_mem(&updated).unwrap();
        assert_eq!(reloaded.get_pages().len(), 3);
    }

    #[test]
    fn test_compute_pdf_fingerprint() {
        let pdf = create_test_pdf(1);
        let hash = compute_pdf_fingerprint(pdf).unwrap();
        assert_eq!(hash.len(), 64);
    }
}
