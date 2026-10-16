mod ai;
mod clipboard;
mod documents;
mod error;
mod library;
mod pdf_ops;
mod platform;
mod shortcuts;

pub use ai::AiRunnerState;

/// Builds the complete native command interface shared by Tauri and Specta.
pub fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new().commands(tauri_specta::collect_commands![
        documents::open_pdf_dialog,
        documents::open_image_dialog,
        documents::open_json_dialog,
        documents::save_pdf_dialog,
        documents::write_pdf_file,
        documents::save_json_dialog,
        documents::read_file_from_path,
        documents::select_directory_dialog,
        documents::scan_directory_pdfs,
        library::list_library,
        library::import_library_pdf_dialog,
        library::import_library_folder_dialog,
        library::refresh_library,
        library::remove_library_folder,
        library::remove_library_document,
        library::set_library_favorite,
        library::touch_library_document,
        library::update_library_document_state,
        library::relink_library_document,
        platform::get_default_directories,
        clipboard::copy_image_to_clipboard,
        clipboard::copy_text_to_clipboard,
        ai::get_ai_provider_status,
        ai::set_ai_provider_executable,
        ai::set_ai_provider_preference,
        ai::run_ai_explanation,
        ai::cancel_ai_explanation,
        platform::open_url,
        platform::toggle_fullscreen_window,
        platform::exit_fullscreen_window,
        shortcuts::get_registered_shortcuts,
        shortcuts::trigger_shortcut_action,
        pdf_ops::delete_pdf_page_native,
        pdf_ops::add_blank_page_below_native,
        pdf_ops::compute_pdf_fingerprint,
        pdf_ops::compress_image_native,
    ])
}
