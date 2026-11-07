use super::*;
use lopdf::{dictionary, Document, Object};
use std::time::{SystemTime, UNIX_EPOCH};
use std::{fs, path::PathBuf};

fn temporary_path(name: &str, extension: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "cinnabar-{name}-{}-{}.{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
        extension
    ))
}

#[test]
fn page_changes_are_written_to_the_source_file() {
    let path = temporary_path("page-persistence-test", "pdf");
    fs::write(&path, b"original pdf bytes").unwrap();

    let result = write_pdf(&path, b"pdf bytes after page deletion");

    assert!(result.success);
    assert_eq!(fs::read(&path).unwrap(), b"pdf bytes after page deletion");
    let _ = fs::remove_file(path);
}

#[test]
fn pdf_writes_reject_missing_paths_and_non_pdf_files() {
    let missing = temporary_path("missing", "pdf");
    assert!(!write_pdf(&missing, b"bytes").success);
    assert!(!missing.exists());

    let text = temporary_path("protected", "txt");
    fs::write(&text, b"original").unwrap();
    assert!(!write_pdf(&text, b"replacement").success);
    assert_eq!(fs::read(&text).unwrap(), b"original");
    fs::remove_file(text).unwrap();
}

#[test]
fn page_count_comes_from_pdf_metadata() {
    let directory = temporary_path("metadata-test", "dir");
    fs::create_dir(&directory).unwrap();
    let path = directory.join("book.pdf");
    let mut document = Document::with_version("1.5");
    let pages_id = document.new_object_id();
    let page_ids = (0..3)
        .map(|_| {
            document.add_object(dictionary! {
                "Type" => "Page",
                "Parent" => pages_id,
                "MediaBox" => vec![0.into(), 0.into(), 100.into(), 100.into()],
            })
        })
        .collect::<Vec<_>>();
    document.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => page_ids.iter().copied().map(Object::Reference).collect::<Vec<_>>(),
            "Count" => 3,
        }),
    );
    let catalog_id = document.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    document.trailer.set("Root", catalog_id);
    document.save(&path).unwrap();

    let scanned = scan_directory(&directory.to_string_lossy());
    assert_eq!(scanned.len(), 1);
    assert_eq!(scanned[0].num_pages, Some(3));
    let _ = fs::remove_dir_all(directory);
}

#[test]
fn scanner_skips_non_pdf_files() {
    let directory = temporary_path("scan-test", "dir");
    fs::create_dir(&directory).unwrap();
    fs::write(directory.join("notes.txt"), b"not a pdf").unwrap();

    assert!(scan_directory(&directory.to_string_lossy()).is_empty());
    let _ = fs::remove_dir_all(directory);
}
