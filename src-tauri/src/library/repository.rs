use super::models::{
    LibraryAvailability, LibraryDocument, LibraryFolder, LibrarySnapshot, LibrarySource,
};
use super::scanner::{pdf_metadata, scan_pdfs, PdfMetadata};
use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use std::path::Path;
use uuid::Uuid;

pub(super) fn reconcile_folder(
    transaction: &Transaction<'_>,
    folder_id: &str,
    root: &Path,
    now: u64,
) -> Result<()> {
    let mut files = Vec::new();
    scan_pdfs(root, &mut files, 0);
    for path in files {
        if let Ok(metadata) = pdf_metadata(&path) {
            upsert_document(transaction, &metadata, Some(folder_id), now)?;
        }
    }
    Ok(())
}

pub(super) fn upsert_document(
    connection: &Connection,
    pdf: &PdfMetadata,
    folder_id: Option<&str>,
    now: u64,
) -> Result<()> {
    let id = Uuid::new_v4().to_string();
    connection.execute(
        "INSERT INTO library_documents
         (id, file_path, file_name, file_size, modified_at, imported_at, num_pages, availability, source_type, folder_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'available', ?8, ?9)
         ON CONFLICT(file_path) DO UPDATE SET
           file_name = excluded.file_name, file_size = excluded.file_size,
           modified_at = excluded.modified_at, num_pages = COALESCE(excluded.num_pages, library_documents.num_pages),
           availability = CASE
             WHEN library_documents.file_size != excluded.file_size OR library_documents.modified_at != excluded.modified_at THEN 'changed'
             ELSE 'available'
           END,
           source_type = CASE WHEN excluded.folder_id IS NULL THEN library_documents.source_type ELSE 'folder' END,
           folder_id = COALESCE(excluded.folder_id, library_documents.folder_id)",
        params![id, pdf.path, pdf.name, pdf.size, pdf.modified, now, pdf.pages, if folder_id.is_some() { "folder" } else { "file" }, folder_id],
    )?;
    if let Some(folder_id) = folder_id {
        connection.execute(
            "INSERT OR IGNORE INTO library_document_folders (document_id, folder_id)
             SELECT id, ?1 FROM library_documents WHERE file_path = ?2",
            params![folder_id, pdf.path],
        )?;
    }
    Ok(())
}

pub(super) fn snapshot(connection: &Connection) -> Result<LibrarySnapshot> {
    let documents = {
        let mut statement = connection.prepare(
            "SELECT d.id, d.file_path, d.file_name, d.file_size, d.modified_at, d.imported_at,
                    d.last_opened_at, d.last_read_page, d.annotation_count, d.num_pages, d.favorite,
                    d.availability, d.source_type, d.folder_id,
                    GROUP_CONCAT(s.folder_id, char(31))
             FROM library_documents d
             LEFT JOIN library_document_folders s ON s.document_id = d.id
             GROUP BY d.id ORDER BY d.imported_at DESC",
        )?;
        let rows = statement
            .query_map([], document_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        rows
    };
    let folders = {
        let mut statement = connection.prepare(
            "SELECT f.id, f.path, f.name, f.imported_at, f.last_scanned_at, COUNT(d.id)
             FROM library_folders f LEFT JOIN library_document_folders s ON s.folder_id = f.id
             LEFT JOIN library_documents d ON d.id = s.document_id
             GROUP BY f.id ORDER BY f.imported_at",
        )?;
        let rows = statement
            .query_map([], |row| {
                Ok(LibraryFolder {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    name: row.get(2)?,
                    imported_at: row.get(3)?,
                    last_scanned_at: row.get(4)?,
                    pdf_count: row.get(5)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        rows
    };
    Ok(LibrarySnapshot { folders, documents })
}

pub(super) fn document_by_path(
    connection: &Connection,
    path: &str,
) -> Result<Option<LibraryDocument>> {
    connection
        .query_row(
            "SELECT d.id, d.file_path, d.file_name, d.file_size, d.modified_at, d.imported_at,
                d.last_opened_at, d.last_read_page, d.annotation_count, d.num_pages, d.favorite,
                d.availability, d.source_type, d.folder_id, GROUP_CONCAT(s.folder_id, char(31))
             FROM library_documents d LEFT JOIN library_document_folders s ON s.document_id = d.id
             WHERE d.file_path = ?1 GROUP BY d.id",
            [path],
            document_from_row,
        )
        .optional()
        .map_err(Into::into)
}

fn document_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LibraryDocument> {
    Ok(LibraryDocument {
        id: row.get(0)?,
        file_path: row.get(1)?,
        file_name: row.get(2)?,
        file_size: row.get(3)?,
        modified_at: row.get(4)?,
        imported_at: row.get(5)?,
        last_opened_at: row.get(6)?,
        last_read_page: row.get(7)?,
        annotation_count: row.get(8)?,
        num_pages: row.get(9)?,
        favorite: row.get(10)?,
        availability: match row.get::<_, String>(11)?.as_str() {
            "missing" => LibraryAvailability::Missing,
            "changed" => LibraryAvailability::Changed,
            _ => LibraryAvailability::Available,
        },
        source_type: match row.get::<_, String>(12)?.as_str() {
            "folder" => LibrarySource::Folder,
            _ => LibrarySource::File,
        },
        folder_id: row.get(13)?,
        folder_ids: row
            .get::<_, Option<String>>(14)?
            .map(|value| value.split('\u{1f}').map(str::to_owned).collect())
            .unwrap_or_default(),
    })
}
