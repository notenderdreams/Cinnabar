use crate::commands::error::{command_error, CommandResult};
use crate::shortcuts::{ShortcutBinding, ShortcutManager};

#[tauri::command]
#[specta::specta]
pub fn get_registered_shortcuts() -> Vec<ShortcutBinding> {
    ShortcutManager::default_bindings()
}

#[tauri::command]
#[specta::specta]
pub fn trigger_shortcut_action(app: tauri::AppHandle, id: String) -> CommandResult<()> {
    ShortcutManager::dispatch(&app, &id).map_err(|e| command_error(anyhow::anyhow!(e)))
}
