use super::migrations::migrations;
use anyhow::{Context, Result};
use rusqlite::Connection;
use std::{fs, path::Path};

pub(super) fn open(path: &Path) -> Result<Connection> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create library directory {}", parent.display()))?;
    }
    let mut connection = Connection::open(path)
        .with_context(|| format!("failed to open library database {}", path.display()))?;
    connection.busy_timeout(std::time::Duration::from_secs(5))?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.pragma_update(None, "journal_mode", "WAL")?;
    // A failed migration may indicate a newer schema or an unavailable database.
    // Keep the original data intact so it can be opened by a compatible version.
    migrations().to_latest(&mut connection).with_context(|| {
        format!(
            "failed to migrate library database {}; existing data was preserved",
            path.display()
        )
    })?;
    Ok(connection)
}
