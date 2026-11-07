use super::models::{OpenFileResult, SaveResult};
use anyhow::{Context, Result};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub(crate) fn write_pdf(path: &Path, data: &[u8]) -> SaveResult {
    let is_pdf = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"));
    if !is_pdf || !path.is_file() {
        return SaveResult::failed();
    }
    save_file(path, data)
}

pub(crate) fn read_file(path: &Path) -> Result<OpenFileResult> {
    Ok(OpenFileResult {
        file_name: file_name(path, "document.pdf"),
        file_path: path.to_string_lossy().into_owned(),
        data: fs::read(path).with_context(|| format!("failed to read PDF {}", path.display()))?,
    })
}

pub(crate) fn save_to_selected_path(path: Option<PathBuf>, data: &[u8]) -> SaveResult {
    let Some(path) = path else {
        return SaveResult::failed();
    };
    save_file(&path, data)
}

pub(crate) fn save_file(path: &Path, data: &[u8]) -> SaveResult {
    match fs::write(path, data).with_context(|| format!("failed to save {}", path.display())) {
        Ok(()) => SaveResult::saved(path),
        Err(error) => {
            log_error(error);
            SaveResult::failed()
        }
    }
}

pub(crate) fn log_error(error: anyhow::Error) {
    log::error!("{error:#}");
}

pub(crate) fn image_mime_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("svg") => "image/svg+xml",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("bmp") => "image/bmp",
        _ => "image/png",
    }
}

pub(crate) fn file_name(path: &Path, fallback: &str) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| fallback.to_string())
}
