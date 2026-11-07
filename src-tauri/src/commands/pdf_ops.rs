use super::error::{command_error, CommandResult};
use crate::{media, pdf};

#[tauri::command]
#[specta::specta]
pub fn delete_pdf_page_native(pdf_bytes: Vec<u8>, page_number: u32) -> CommandResult<Vec<u8>> {
    pdf::delete_page(&pdf_bytes, page_number).map_err(command_error)
}

#[tauri::command]
#[specta::specta]
pub fn add_blank_page_below_native(pdf_bytes: Vec<u8>, page_number: u32) -> CommandResult<Vec<u8>> {
    pdf::insert_blank_page_after(&pdf_bytes, page_number).map_err(command_error)
}

#[tauri::command]
#[specta::specta]
pub fn compute_pdf_fingerprint(pdf_bytes: Vec<u8>) -> CommandResult<String> {
    Ok(pdf::fingerprint(&pdf_bytes))
}

#[tauri::command]
#[specta::specta]
pub fn compress_image_native(
    data_url: String,
    max_width: u32,
    quality: u8,
) -> CommandResult<String> {
    media::compress_image(&data_url, max_width, quality).map_err(command_error)
}
