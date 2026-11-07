use crate::commands::error::{command_error, CommandResult};
use crate::platform::home_directory;
use anyhow::{Context, Result};
use std::process::Command;

#[tauri::command]
#[specta::specta]
pub fn toggle_fullscreen_window(window: tauri::Window) -> CommandResult<bool> {
    let is_fullscreen = window
        .is_fullscreen()
        .map_err(|e| command_error(anyhow::anyhow!(e)))?;
    window
        .set_fullscreen(!is_fullscreen)
        .map_err(|e| command_error(anyhow::anyhow!(e)))?;
    Ok(!is_fullscreen)
}

#[tauri::command]
#[specta::specta]
pub fn exit_fullscreen_window(window: tauri::Window) -> CommandResult<bool> {
    let is_fullscreen = window
        .is_fullscreen()
        .map_err(|e| command_error(anyhow::anyhow!(e)))?;
    if is_fullscreen {
        window
            .set_fullscreen(false)
            .map_err(|e| command_error(anyhow::anyhow!(e)))?;
    }
    Ok(false)
}

#[tauri::command]
#[specta::specta]
pub fn get_default_directories() -> Vec<String> {
    let Some(home) = home_directory() else {
        return Vec::new();
    };
    [home.join("Documents"), home.join("Downloads")]
        .into_iter()
        .filter(|path| path.is_dir())
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

fn is_valid_external_url(url: &str) -> bool {
    let trimmed = url.trim();
    trimmed.starts_with("https://")
        || trimmed.starts_with("http://")
        || trimmed.starts_with("mailto:")
}

#[tauri::command]
#[specta::specta]
pub fn open_url(url: String) -> bool {
    if !is_valid_external_url(&url) {
        return false;
    }
    launch_url(url.trim())
        .map_err(|error| log::error!("{error:#}"))
        .is_ok()
}

fn launch_url(target: &str) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(target)
            .spawn()
            .context("failed to launch the system URL opener")?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", target])
            .spawn()
            .context("failed to launch the system URL opener")?;
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        Command::new("xdg-open")
            .arg(target)
            .spawn()
            .context("failed to launch the system URL opener")?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_valid_external_url;

    #[test]
    fn external_urls_are_limited_to_safe_schemes() {
        assert!(is_valid_external_url("https://example.com"));
        assert!(is_valid_external_url("mailto:hello@example.com"));
        assert!(!is_valid_external_url("javascript:alert(1)"));
        assert!(!is_valid_external_url("file:///etc/passwd"));
    }
}
