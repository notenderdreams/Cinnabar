use anyhow::Result;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

pub(super) fn create_app_menu(app: &tauri::App) -> Result<Menu<tauri::Wry>> {
    let handle = app.handle();

    // macOS App Submenu
    let app_submenu = Submenu::with_items(
        handle,
        "Cinnabar",
        true,
        &[
            &PredefinedMenuItem::about(handle, Some("Cinnabar"), None)?,
            &PredefinedMenuItem::separator(handle)?,
            &MenuItem::with_id(
                handle,
                "settings",
                "Preferences...",
                true,
                Some("CmdOrCtrl+,"),
            )?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::services(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::hide(handle, None)?,
            &PredefinedMenuItem::hide_others(handle, None)?,
            &PredefinedMenuItem::show_all(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::quit(handle, None)?,
        ],
    )?;

    // File Submenu
    let file_submenu = Submenu::with_items(
        handle,
        "File",
        true,
        &[
            &MenuItem::with_id(handle, "open_pdf", "Open PDF...", true, Some("CmdOrCtrl+O"))?,
            &PredefinedMenuItem::separator(handle)?,
            &MenuItem::with_id(
                handle,
                "import_annotations",
                "Import Annotations...",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                handle,
                "export_annotations",
                "Export Annotations...",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(
                handle,
                "open_transfer_modal",
                "Import & Export Annotations...",
                true,
                Some("CmdOrCtrl+S"),
            )?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::close_window(handle, None)?,
        ],
    )?;

    // Edit Submenu
    let edit_submenu = Submenu::with_items(
        handle,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(handle, None)?,
            &PredefinedMenuItem::redo(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::cut(handle, None)?,
            &PredefinedMenuItem::copy(handle, None)?,
            &PredefinedMenuItem::paste(handle, None)?,
            &PredefinedMenuItem::select_all(handle, None)?,
        ],
    )?;

    // View Submenu
    let view_submenu = Submenu::with_items(
        handle,
        "View",
        true,
        &[
            &MenuItem::with_id(
                handle,
                "toggle_theme",
                "Toggle Light / Dark Mode",
                true,
                Some("CmdOrCtrl+Shift+L"),
            )?,
            &MenuItem::with_id(
                handle,
                "toggle_invert",
                "Invert PDF Colors",
                true,
                Some("CmdOrCtrl+I"),
            )?,
            &PredefinedMenuItem::separator(handle)?,
            &MenuItem::with_id(
                handle,
                "view_continuous",
                "Continuous Scroll",
                true,
                Some("CmdOrCtrl+Shift+3"),
            )?,
            &MenuItem::with_id(
                handle,
                "view_single",
                "Single Page",
                true,
                Some("CmdOrCtrl+Shift+1"),
            )?,
            &MenuItem::with_id(
                handle,
                "view_spread",
                "Side by Side",
                true,
                Some("CmdOrCtrl+Shift+2"),
            )?,
            &PredefinedMenuItem::separator(handle)?,
            &MenuItem::with_id(handle, "zoom_in", "Zoom In", true, Some("CmdOrCtrl+="))?,
            &MenuItem::with_id(handle, "zoom_out", "Zoom Out", true, Some("CmdOrCtrl+-"))?,
            &MenuItem::with_id(
                handle,
                "zoom_reset",
                "Actual Size (100%)",
                true,
                Some("CmdOrCtrl+0"),
            )?,
            &PredefinedMenuItem::separator(handle)?,
            &MenuItem::with_id(
                handle,
                "toggle_sidebar",
                "Toggle Sidebar",
                true,
                Some("CmdOrCtrl+B"),
            )?,
            &MenuItem::with_id(
                handle,
                "toggle_zen",
                "Toggle Zen Focus Mode",
                true,
                Some("F"),
            )?,
            &PredefinedMenuItem::fullscreen(handle, None)?,
        ],
    )?;

    // Window Submenu
    let window_submenu = Submenu::with_items(
        handle,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::bring_all_to_front(handle, None)?,
        ],
    )?;

    // Help Submenu
    let help_submenu = Submenu::with_items(
        handle,
        "Help",
        true,
        &[&MenuItem::with_id(
            handle,
            "keyboard_shortcuts",
            "Keyboard Shortcuts",
            true,
            Some("?"),
        )?],
    )?;

    let menu = Menu::with_items(
        handle,
        &[
            &app_submenu,
            &file_submenu,
            &edit_submenu,
            &view_submenu,
            &window_submenu,
            &help_submenu,
        ],
    )?;

    Ok(menu)
}
