use anyhow::{Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use uuid::Uuid;

mod database;
mod migrations;
mod models;
mod repository;
mod scanner;
#[cfg(test)]
mod tests;
pub use models::{LibraryDocument, LibrarySnapshot};
use repository::{document_by_path, reconcile_folder, snapshot, upsert_document};
use scanner::{canonical_path, file_name, modified_ms, now_ms, pdf_metadata};

#[derive(Clone)]
pub struct LibraryState(Arc<Mutex<Connection>>);

impl LibraryState {
    pub fn open(path: &Path) -> Result<Self> {
        Ok(Self(Arc::new(Mutex::new(database::open(path)?))))
    }

    fn connection(&self) -> Result<std::sync::MutexGuard<'_, Connection>> {
        self.0
            .lock()
            .map_err(|_| anyhow::anyhow!("library database lock was poisoned"))
    }

    pub fn snapshot(&self) -> Result<LibrarySnapshot> {
        let connection = self.connection()?;
        snapshot(&connection)
    }

    pub fn import_file(&self, path: &Path) -> Result<LibraryDocument> {
        let metadata = pdf_metadata(path)?;
        let now = now_ms();
        let connection = self.connection()?;
        upsert_document(&connection, &metadata, None, now)?;
        document_by_path(&connection, &metadata.path)?.context("imported PDF was not found")
    }

    pub fn import_folder(&self, path: &Path) -> Result<LibrarySnapshot> {
        let canonical = canonical_path(path)?;
        if !canonical.is_dir() {
            anyhow::bail!("selected folder is not available");
        }
        let folder_path = canonical.to_string_lossy().into_owned();
        let folder_name = file_name(&canonical, "Folder");
        let now = now_ms();
        let mut connection = self.connection()?;
        let transaction = connection.transaction()?;
        let folder_id: String = transaction
            .query_row(
                "SELECT id FROM library_folders WHERE path = ?1",
                [&folder_path],
                |row| row.get(0),
            )
            .optional()?
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        transaction.execute(
            "INSERT INTO library_folders (id, path, name, imported_at, last_scanned_at)
             VALUES (?1, ?2, ?3, ?4, ?4)
             ON CONFLICT(path) DO UPDATE SET name = excluded.name, last_scanned_at = excluded.last_scanned_at",
            params![folder_id, folder_path, folder_name, now],
        )?;
        reconcile_folder(&transaction, &folder_id, &canonical, now)?;
        transaction.commit()?;
        snapshot(&connection)
    }

    pub fn refresh(&self) -> Result<LibrarySnapshot> {
        let mut connection = self.connection()?;
        let folders = {
            let mut statement = connection.prepare("SELECT id, path FROM library_folders")?;
            let rows = statement
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };
        let now = now_ms();
        let transaction = connection.transaction()?;
        transaction.execute(
            "UPDATE library_documents SET availability = 'missing'
             WHERE id IN (SELECT document_id FROM library_document_folders)",
            [],
        )?;
        for (id, path) in folders {
            let root = PathBuf::from(path);
            if root.is_dir() {
                reconcile_folder(&transaction, &id, &root, now)?;
                transaction.execute(
                    "UPDATE library_folders SET last_scanned_at = ?1 WHERE id = ?2",
                    params![now, id],
                )?;
            }
        }
        // Standalone documents need an explicit filesystem check.
        let standalone = {
            let mut statement = transaction.prepare(
                "SELECT id, file_path, file_size, modified_at FROM library_documents WHERE source_type = 'file'",
            )?;
            let rows = statement
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, u64>(2)?,
                        row.get::<_, u64>(3)?,
                    ))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };
        for (id, path, old_size, old_modified) in standalone {
            let availability = match fs::metadata(&path) {
                Ok(metadata) => {
                    let size = metadata.len();
                    let modified = modified_ms(&metadata);
                    if size != old_size || modified != old_modified {
                        "changed"
                    } else {
                        "available"
                    }
                }
                Err(_) => "missing",
            };
            transaction.execute(
                "UPDATE library_documents SET availability = ?1 WHERE id = ?2",
                params![availability, id],
            )?;
        }
        transaction.commit()?;
        snapshot(&connection)
    }

    pub fn remove_folder(&self, folder_id: &str, keep_documents: bool) -> Result<LibrarySnapshot> {
        let mut connection = self.connection()?;
        let transaction = connection.transaction()?;
        if !keep_documents {
            transaction.execute(
                "DELETE FROM library_documents
                 WHERE id IN (SELECT document_id FROM library_document_folders WHERE folder_id = ?1)
                   AND id NOT IN (SELECT document_id FROM library_document_folders WHERE folder_id != ?1)",
                [folder_id],
            )?;
        }
        transaction.execute("DELETE FROM library_folders WHERE id = ?1", [folder_id])?;
        transaction.execute(
            "UPDATE library_documents SET source_type = 'file', folder_id = NULL
             WHERE id NOT IN (SELECT document_id FROM library_document_folders)",
            [],
        )?;
        transaction.execute(
            "UPDATE library_documents SET folder_id = (
                SELECT folder_id FROM library_document_folders WHERE document_id = library_documents.id LIMIT 1
             ) WHERE id IN (SELECT document_id FROM library_document_folders)",
            [],
        )?;
        transaction.commit()?;
        snapshot(&connection)
    }

    pub fn remove_document(&self, document_id: &str) -> Result<()> {
        self.connection()?
            .execute("DELETE FROM library_documents WHERE id = ?1", [document_id])?;
        Ok(())
    }

    pub fn relink_document(&self, document_id: &str, path: &Path) -> Result<LibraryDocument> {
        let metadata = pdf_metadata(path)?;
        let mut connection = self.connection()?;
        let transaction = connection.transaction()?;
        let conflicting_id: Option<String> = transaction
            .query_row(
                "SELECT id FROM library_documents WHERE file_path = ?1 AND id != ?2",
                params![metadata.path, document_id],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(conflicting_id) = conflicting_id {
            anyhow::bail!("that PDF is already tracked as document {conflicting_id}");
        }
        let changed = transaction.execute(
            "UPDATE library_documents SET file_path = ?1, file_name = ?2, file_size = ?3,
                    modified_at = ?4, num_pages = ?5, availability = 'available'
             WHERE id = ?6",
            params![
                metadata.path,
                metadata.name,
                metadata.size,
                metadata.modified,
                metadata.pages,
                document_id
            ],
        )?;
        if changed == 0 {
            anyhow::bail!("library document no longer exists");
        }
        transaction.commit()?;
        document_by_path(&connection, &metadata.path)?.context("relinked PDF was not found")
    }

    pub fn set_favorite(&self, document_id: &str, favorite: bool) -> Result<()> {
        self.connection()?.execute(
            "UPDATE library_documents SET favorite = ?1 WHERE id = ?2",
            params![favorite, document_id],
        )?;
        Ok(())
    }

    pub fn touch_document(
        &self,
        document_id: &str,
        last_read_page: Option<u32>,
        annotation_count: Option<u32>,
    ) -> Result<()> {
        self.connection()?.execute(
            "UPDATE library_documents SET last_opened_at = ?1,
                last_read_page = COALESCE(?2, last_read_page),
                annotation_count = COALESCE(?3, annotation_count)
             WHERE id = ?4",
            params![now_ms(), last_read_page, annotation_count, document_id],
        )?;
        Ok(())
    }

    pub fn update_document_state(
        &self,
        document_id: &str,
        last_read_page: u32,
        annotation_count: u32,
    ) -> Result<()> {
        self.connection()?.execute(
            "UPDATE library_documents SET last_read_page = ?1, annotation_count = ?2 WHERE id = ?3",
            params![last_read_page, annotation_count, document_id],
        )?;
        Ok(())
    }
}
