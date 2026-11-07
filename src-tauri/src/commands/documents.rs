use super::dialog::{
    DialogGuard, IS_DIRECTORY_DIALOG_OPEN, IS_IMAGE_DIALOG_OPEN, IS_JSON_DIALOG_OPEN,
    IS_PDF_DIALOG_OPEN, IS_SAVE_JSON_DIALOG_OPEN, IS_SAVE_PDF_DIALOG_OPEN,
};
use crate::documents::{
    file_name, image_mime_type, log_error, read_file, save_to_selected_path, scan_directory,
    write_pdf, OpenFileResult, OpenImageResult, SaveResult, ScannedPdfResult,
};
use anyhow::Context;
use base64::Engine;
use std::{fs, path::Path};

#[tauri::command]
#[specta::specta]
pub fn open_pdf_dialog() -> Option<OpenFileResult> {
    let _guard = DialogGuard::try_acquire(&IS_PDF_DIALOG_OPEN)?;
    let file = rfd::FileDialog::new()
        .add_filter("PDF Document", &["pdf"])
        .set_title("Open PDF Document")
        .pick_file()?;
    read_file(&file).map_err(log_error).ok()
}

#[tauri::command]
#[specta::specta]
pub fn open_image_dialog() -> Option<OpenImageResult> {
    let _guard = DialogGuard::try_acquire(&IS_IMAGE_DIALOG_OPEN)?;
    let file = rfd::FileDialog::new()
        .add_filter(
            "Images",
            &["png", "jpg", "jpeg", "webp", "svg", "gif", "bmp"],
        )
        .set_title("Select Image to Attach")
        .pick_file()?;
    let bytes = fs::read(&file)
        .with_context(|| format!("failed to read image {}", file.display()))
        .map_err(log_error)
        .ok()?;
    let mime_type = image_mime_type(&file);
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);

    Some(OpenImageResult {
        file_name: file_name(&file, "image.png"),
        file_path: file.to_string_lossy().into_owned(),
        data_url: format!("data:{mime_type};base64,{encoded}"),
    })
}

#[tauri::command]
#[specta::specta]
pub fn save_pdf_dialog(data: Vec<u8>, default_name: Option<String>) -> SaveResult {
    let _guard = match DialogGuard::try_acquire(&IS_SAVE_PDF_DIALOG_OPEN) {
        Some(guard) => guard,
        None => return SaveResult::failed(),
    };
    let path = rfd::FileDialog::new()
        .add_filter("PDF Document", &["pdf"])
        .set_title("Save PDF Document")
        .set_file_name(default_name.as_deref().unwrap_or("annotated_document.pdf"))
        .save_file();
    save_to_selected_path(path, &data)
}

#[tauri::command]
#[specta::specta]
pub fn write_pdf_file(file_path: String, data: Vec<u8>) -> SaveResult {
    write_pdf(Path::new(&file_path), &data)
}

#[tauri::command]
#[specta::specta]
pub fn save_json_dialog(json_string: String, default_name: Option<String>) -> SaveResult {
    let _guard = match DialogGuard::try_acquire(&IS_SAVE_JSON_DIALOG_OPEN) {
        Some(guard) => guard,
        None => return SaveResult::failed(),
    };
    let path = rfd::FileDialog::new()
        .add_filter("Annotations", &["json"])
        .set_title("Save Annotations")
        .set_file_name(default_name.as_deref().unwrap_or("annotations.json"))
        .save_file();
    save_to_selected_path(path, json_string.as_bytes())
}

#[tauri::command]
#[specta::specta]
pub fn open_json_dialog() -> Option<OpenFileResult> {
    let _guard = DialogGuard::try_acquire(&IS_JSON_DIALOG_OPEN)?;
    let file = rfd::FileDialog::new()
        .add_filter("Annotations", &["json"])
        .set_title("Import Annotations")
        .pick_file()?;
    read_file(&file).map_err(log_error).ok()
}

#[tauri::command]
#[specta::specta]
pub fn read_file_from_path(file_path: String) -> Option<OpenFileResult> {
    read_file(Path::new(&file_path)).map_err(log_error).ok()
}

#[tauri::command]
#[specta::specta]
pub fn select_directory_dialog() -> Option<String> {
    let _guard = DialogGuard::try_acquire(&IS_DIRECTORY_DIALOG_OPEN)?;
    rfd::FileDialog::new()
        .set_title("Select Directory to Add to PDF Library")
        .pick_folder()
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
#[specta::specta]
pub async fn scan_directory_pdfs(directory_path: String) -> Vec<ScannedPdfResult> {
    match tauri::async_runtime::spawn_blocking(move || scan_directory(&directory_path)).await {
        Ok(results) => results,
        Err(error) => {
            log::error!("directory scan task failed: {error}");
            Vec::new()
        }
    }
}
