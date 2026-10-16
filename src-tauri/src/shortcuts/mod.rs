use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ShortcutBinding {
    pub id: String,
    pub label: String,
    pub default_accelerator: Option<String>,
    pub category: String,
    pub description: String,
}

pub struct ShortcutManager;

impl ShortcutManager {
    /// Canonical list of all desktop shortcut bindings and accelerators
    pub fn default_bindings() -> Vec<ShortcutBinding> {
        vec![
            // File
            ShortcutBinding {
                id: "open_pdf".to_string(),
                label: "Open PDF...".to_string(),
                default_accelerator: Some("CmdOrCtrl+O".to_string()),
                category: "File".to_string(),
                description: "Open PDF document from disk".to_string(),
            },
            ShortcutBinding {
                id: "import_annotations".to_string(),
                label: "Import Annotations...".to_string(),
                default_accelerator: None,
                category: "File".to_string(),
                description: "Import annotation markers from JSON file".to_string(),
            },
            ShortcutBinding {
                id: "export_annotations".to_string(),
                label: "Export Annotations...".to_string(),
                default_accelerator: None,
                category: "File".to_string(),
                description: "Export current annotations to JSON file".to_string(),
            },
            ShortcutBinding {
                id: "open_transfer_modal".to_string(),
                label: "Import & Export Annotations...".to_string(),
                default_accelerator: Some("CmdOrCtrl+S".to_string()),
                category: "File".to_string(),
                description: "Open the unified transfer and export modal".to_string(),
            },
            // View & Theme
            ShortcutBinding {
                id: "toggle_theme".to_string(),
                label: "Toggle Light / Dark Mode".to_string(),
                default_accelerator: Some("CmdOrCtrl+Shift+L".to_string()),
                category: "View".to_string(),
                description: "Switch application theme between light and dark".to_string(),
            },
            ShortcutBinding {
                id: "toggle_invert".to_string(),
                label: "Invert PDF Colors".to_string(),
                default_accelerator: Some("CmdOrCtrl+I".to_string()),
                category: "View".to_string(),
                description: "Smart chromatic inversion for night reading".to_string(),
            },
            ShortcutBinding {
                id: "view_continuous".to_string(),
                label: "Continuous Scroll".to_string(),
                default_accelerator: Some("CmdOrCtrl+Shift+3".to_string()),
                category: "Layout".to_string(),
                description: "Read pages in a vertical continuous scroll view".to_string(),
            },
            ShortcutBinding {
                id: "view_single".to_string(),
                label: "Single Page".to_string(),
                default_accelerator: Some("CmdOrCtrl+Shift+1".to_string()),
                category: "Layout".to_string(),
                description: "Read one focused page at a time".to_string(),
            },
            ShortcutBinding {
                id: "view_spread".to_string(),
                label: "Side by Side".to_string(),
                default_accelerator: Some("CmdOrCtrl+Shift+2".to_string()),
                category: "Layout".to_string(),
                description: "Read two facing pages side by side".to_string(),
            },
            // Zoom
            ShortcutBinding {
                id: "zoom_in".to_string(),
                label: "Zoom In".to_string(),
                default_accelerator: Some("CmdOrCtrl+=".to_string()),
                category: "Navigation".to_string(),
                description: "Enlarge document magnification".to_string(),
            },
            ShortcutBinding {
                id: "zoom_out".to_string(),
                label: "Zoom Out".to_string(),
                default_accelerator: Some("CmdOrCtrl+-".to_string()),
                category: "Navigation".to_string(),
                description: "Reduce document magnification".to_string(),
            },
            ShortcutBinding {
                id: "zoom_reset".to_string(),
                label: "Actual Size (100%)".to_string(),
                default_accelerator: Some("CmdOrCtrl+0".to_string()),
                category: "Navigation".to_string(),
                description: "Reset zoom to default scale".to_string(),
            },
            // Workspace
            ShortcutBinding {
                id: "toggle_sidebar".to_string(),
                label: "Toggle Sidebar".to_string(),
                default_accelerator: Some("CmdOrCtrl+B".to_string()),
                category: "Workspace".to_string(),
                description: "Open or close navigation and thumbnail sidebar".to_string(),
            },
            ShortcutBinding {
                id: "toggle_zen".to_string(),
                label: "Toggle Zen Focus Mode".to_string(),
                default_accelerator: Some("F".to_string()),
                category: "Workspace".to_string(),
                description: "Hide toolbars and sidebar for distraction-free reading".to_string(),
            },
            ShortcutBinding {
                id: "settings".to_string(),
                label: "Preferences...".to_string(),
                default_accelerator: Some("CmdOrCtrl+,".to_string()),
                category: "App".to_string(),
                description: "Open settings dialog".to_string(),
            },
            ShortcutBinding {
                id: "keyboard_shortcuts".to_string(),
                label: "Keyboard Shortcuts".to_string(),
                default_accelerator: Some("?".to_string()),
                category: "Help".to_string(),
                description: "Show keyboard shortcut overview".to_string(),
            },
        ]
    }

    /// Dispatch a shortcut action to the webview via native-menu-action event
    pub fn dispatch(app: &AppHandle, action_id: &str) -> anyhow::Result<()> {
        app.emit("native-menu-action", action_id)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_bindings_include_required_menu_actions() {
        let bindings = ShortcutManager::default_bindings();
        let ids: Vec<&str> = bindings.iter().map(|b| b.id.as_str()).collect();

        assert!(ids.contains(&"import_annotations"));
        assert!(ids.contains(&"export_annotations"));
        assert!(ids.contains(&"open_transfer_modal"));
        assert!(ids.contains(&"open_pdf"));
        assert!(ids.contains(&"toggle_theme"));
        assert!(ids.contains(&"toggle_invert"));
        assert!(ids.contains(&"view_continuous"));
        assert!(ids.contains(&"view_single"));
        assert!(ids.contains(&"view_spread"));
        assert!(ids.contains(&"settings"));
    }
}
