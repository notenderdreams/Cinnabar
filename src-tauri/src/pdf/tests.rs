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
    let updated = delete_page(&pdf, 2).unwrap();
    let reloaded = Document::load_mem(&updated).unwrap();
    assert_eq!(reloaded.get_pages().len(), 2);
}

#[test]
fn test_native_page_deletion_single_page_fails() {
    let pdf = create_test_pdf(1);
    let result = delete_page(&pdf, 1);
    assert!(result.is_err());
    assert_eq!(
        result.unwrap_err().to_string(),
        "A PDF must keep at least one page."
    );
}

#[test]
fn test_native_page_insertion() {
    let pdf = create_test_pdf(2);
    let updated = insert_blank_page_after(&pdf, 1).unwrap();
    let reloaded = Document::load_mem(&updated).unwrap();
    assert_eq!(reloaded.get_pages().len(), 3);
    let pages = reloaded.get_pages();
    let first = reloaded.get_dictionary(pages[&1]).unwrap();
    let inserted = reloaded.get_dictionary(pages[&2]).unwrap();
    let last = reloaded.get_dictionary(pages[&3]).unwrap();
    assert_eq!(
        first.get(b"MediaBox").unwrap(),
        inserted.get(b"MediaBox").unwrap()
    );
    assert_ne!(
        inserted.get(b"MediaBox").unwrap(),
        last.get(b"MediaBox").unwrap()
    );
}

#[test]
fn invalid_page_edits_are_rejected() {
    let pdf = create_test_pdf(2);
    for page in [0, 3] {
        assert!(delete_page(&pdf, page).is_err());
        assert!(insert_blank_page_after(&pdf, page).is_err());
    }
    assert!(delete_page(b"not a PDF", 1).is_err());
    assert!(insert_blank_page_after(b"not a PDF", 1).is_err());
}

#[test]
fn test_compute_pdf_fingerprint() {
    let pdf = create_test_pdf(1);
    let hash = fingerprint(&pdf);
    assert_eq!(hash.len(), 64);
}
