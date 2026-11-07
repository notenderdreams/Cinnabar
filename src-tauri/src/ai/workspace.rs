use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

pub(super) struct TempAiDirectory(pub(super) PathBuf);

impl Drop for TempAiDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

pub(super) fn create_workspace(request_id: &str) -> Result<TempAiDirectory> {
    let suffix: String = request_id
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || *character == '_' || *character == '-'
        })
        .take(80)
        .collect();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let directory = std::env::temp_dir().join(format!(
        "cinnabar-ai-{}-{}-{}",
        std::process::id(),
        timestamp,
        suffix
    ));
    fs::create_dir(&directory)
        .with_context(|| format!("failed to create AI workspace {}", directory.display()))?;
    Ok(TempAiDirectory(directory))
}
