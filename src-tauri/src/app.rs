mod menu;

use crate::ai::AiRunnerState;
use crate::commands;
use crate::library::LibraryState;
use anyhow::{Context, Result};
use menu::create_app_menu;
#[cfg(any(debug_assertions, test))]
use std::path::PathBuf;
use tauri::Manager;

#[cfg(any(debug_assertions, test))]
fn bindings_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/lib/bindings.ts")
}

#[cfg(any(debug_assertions, test))]
fn export_bindings(builder: &tauri_specta::Builder<tauri::Wry>) -> Result<()> {
    let path = bindings_path();
    let directory = path
        .parent()
        .context("generated bindings path has no parent directory")?;
    std::fs::create_dir_all(directory).with_context(|| {
        format!(
            "failed to create bindings directory {}",
            directory.display()
        )
    })?;
    builder
        .export(specta_typescript::Typescript::default(), &path)
        .with_context(|| format!("failed to export Tauri bindings to {}", path.display()))?;
    Ok(())
}

pub fn run() -> Result<()> {
    let specta = commands::specta_builder();
    #[cfg(debug_assertions)]
    export_bindings(&specta)?;

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AiRunnerState::default())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .or_else(|_| app.path().app_local_data_dir())
                .or_else(|_| app.path().data_dir().map(|d| d.join("cinnabar")))
                .context("failed to resolve application data directory")?;
            let database_path = data_dir.join("library.sqlite3");
            app.manage(LibraryState::open(&database_path)?);

            let menu = create_app_menu(app)?;
            app.set_menu(menu)?;

            app.on_menu_event(|app_handle, event| {
                let id = event.id().as_ref();
                let _ = crate::shortcuts::ShortcutManager::dispatch(app_handle, id);
                // Dispatches native-menu-action to frontend
            });

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        // lopdf repairs stale trailer sizes while loading common PDFs.
                        .level_for("lopdf", log::LevelFilter::Error)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(specta.invoke_handler())
        .run(tauri::generate_context!())
        .context("failed to run the Tauri application")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exports_typescript_bindings() {
        export_bindings(&commands::specta_builder()).unwrap();
        assert!(bindings_path().is_file());
    }
}
