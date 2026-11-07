use super::models::{LibraryAvailability, LibrarySource};
use super::*;

#[test]
fn imported_documents_survive_missing_files_and_folder_refresh() {
    let root = std::env::temp_dir().join(format!("cinnabar-library-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    let database = root.join("library.sqlite3");
    let folder = root.join("pdfs");
    fs::create_dir(&folder).unwrap();
    let pdf = folder.join("book.pdf");
    let mut document = lopdf::Document::with_version("1.5");
    let pages_id = document.new_object_id();
    document.objects.insert(pages_id, lopdf::dictionary! { "Type" => "Pages", "Kids" => Vec::<lopdf::Object>::new(), "Count" => 0 }.into());
    let catalog_id =
        document.add_object(lopdf::dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    document.trailer.set("Root", catalog_id);
    document.save(&pdf).unwrap();

    let state = LibraryState::open(&database).unwrap();
    let imported = state.import_folder(&root).unwrap();
    assert_eq!(imported.documents.len(), 1);
    let stable_id = imported.documents[0].id.clone();
    let imported = state.import_folder(&folder).unwrap();
    assert_eq!(imported.documents[0].id, stable_id);
    assert_eq!(imported.documents[0].folder_ids.len(), 2);
    fs::remove_file(&pdf).unwrap();
    let refreshed = state.refresh().unwrap();
    assert_eq!(refreshed.documents[0].id, stable_id);
    assert!(matches!(
        refreshed.documents[0].availability,
        LibraryAvailability::Missing
    ));

    state.set_favorite(&stable_id, true).unwrap();
    state.update_document_state(&stable_id, 7, 3).unwrap();
    let first_folder_id = refreshed.folders[0].id.clone();
    let partially_detached = state.remove_folder(&first_folder_id, true).unwrap();
    assert!(matches!(
        partially_detached.documents[0].source_type,
        LibrarySource::Folder
    ));
    let second_folder_id = partially_detached.folders[0].id.clone();
    let detached = state.remove_folder(&second_folder_id, true).unwrap();
    assert!(detached.folders.is_empty());
    assert_eq!(detached.documents[0].id, stable_id);
    assert!(matches!(
        detached.documents[0].source_type,
        LibrarySource::File
    ));
    assert!(detached.documents[0].favorite);
    assert_eq!(detached.documents[0].last_read_page, Some(7));
    assert_eq!(detached.documents[0].annotation_count, Some(3));
    let _ = fs::remove_dir_all(root);
}

#[test]
fn deleting_folder_can_remove_contained_documents() {
    let root = std::env::temp_dir().join(format!("cinnabar-library-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    let database = root.join("library.sqlite3");
    let folder = root.join("pdfs");
    fs::create_dir(&folder).unwrap();
    let pdf = folder.join("sample.pdf");
    let mut document = lopdf::Document::with_version("1.5");
    let pages_id = document.new_object_id();
    document.objects.insert(
        pages_id,
        lopdf::dictionary! { "Type" => "Pages", "Kids" => Vec::<lopdf::Object>::new(), "Count" => 0 }.into(),
    );
    let catalog_id =
        document.add_object(lopdf::dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    document.trailer.set("Root", catalog_id);
    document.save(&pdf).unwrap();

    let state = LibraryState::open(&database).unwrap();
    let imported = state.import_folder(&folder).unwrap();
    assert_eq!(imported.folders.len(), 1);
    assert_eq!(imported.documents.len(), 1);

    let folder_id = imported.folders[0].id.clone();
    let remaining = state.remove_folder(&folder_id, false).unwrap();
    assert!(remaining.folders.is_empty());
    assert!(remaining.documents.is_empty());
    let _ = fs::remove_dir_all(root);
}

#[test]
fn version_mismatch_preserves_existing_database() {
    let root = std::env::temp_dir().join(format!("cinnabar-library-{}", Uuid::new_v4()));
    fs::create_dir_all(&root).unwrap();
    let database = root.join("library.sqlite3");

    // Seed a database with a future user_version (e.g. version 99)
    {
        let connection = Connection::open(&database).unwrap();
        connection.execute_batch("CREATE TABLE preserved_data (value TEXT); INSERT INTO preserved_data VALUES ('important');").unwrap();
        connection.pragma_update(None, "user_version", 99).unwrap();
    }

    assert!(LibraryState::open(&database).is_err());
    let connection = Connection::open(&database).unwrap();
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, 99);
    let value: String = connection
        .query_row("SELECT value FROM preserved_data", [], |row| row.get(0))
        .unwrap();
    assert_eq!(value, "important");
    drop(connection);
    let _ = fs::remove_dir_all(root);
}
