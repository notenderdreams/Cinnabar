use super::files::file_name;
use super::models::ScannedPdfResult;
use std::{fs, path::Path, time::UNIX_EPOCH};

const MAX_SCAN_DEPTH: usize = 4;

fn pdf_page_count(path: &Path) -> Option<u32> {
    lopdf::Document::load_metadata(path)
        .ok()
        .map(|metadata| metadata.page_count)
}

pub(crate) fn scan_directory(directory_path: &str) -> Vec<ScannedPdfResult> {
    let root = Path::new(directory_path);
    if !root.is_dir() {
        return Vec::new();
    }
    let mut results = Vec::new();
    scan_directory_at(root, directory_path, &mut results, 0);
    results
}

fn scan_directory_at(
    directory: &Path,
    base_directory: &str,
    results: &mut Vec<ScannedPdfResult>,
    depth: usize,
) {
    if depth > MAX_SCAN_DEPTH {
        return;
    }
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = file_name(&path, "");
            if !name.starts_with('.') && name != "node_modules" && name != "target" {
                scan_directory_at(&path, base_directory, results, depth + 1);
            }
            continue;
        }
        if !is_pdf(&path) {
            continue;
        }

        let metadata = entry.metadata().ok();
        let file_size = metadata.as_ref().map(|value| value.len()).unwrap_or(0);
        let modified_timestamp = metadata
            .and_then(|value| value.modified().ok())
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map(|value| value.as_millis() as u64)
            .unwrap_or(0);
        results.push(ScannedPdfResult {
            file_name: file_name(&path, "document.pdf"),
            file_path: path.to_string_lossy().into_owned(),
            file_size,
            modified_timestamp,
            directory_path: base_directory.to_string(),
            num_pages: pdf_page_count(&path),
        });
    }
}

fn is_pdf(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
}
