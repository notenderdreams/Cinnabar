//! File data, persistence, and bounded PDF directory scans.

mod files;
mod models;
mod scanner;

pub(crate) use files::{
    file_name, image_mime_type, log_error, read_file, save_to_selected_path, write_pdf,
};
pub(crate) use models::{OpenFileResult, OpenImageResult, SaveResult, ScannedPdfResult};
pub(crate) use scanner::scan_directory;

#[cfg(test)]
mod tests;
