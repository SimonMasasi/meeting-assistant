//! Application library entrypoint.
//!
//! `main.rs` is a thin shim that calls [`run`]. Keeping the builder here (rather
//! than in `main.rs`) lets the same logic drive both desktop and mobile targets.

mod commands;
mod error;
mod settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::greet::greet,
            commands::attachments::save_meeting_attachment,
            commands::storage::get_storage_dir,
            commands::storage::set_storage_dir,
            commands::mail::get_mail_settings,
            commands::mail::set_mail_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
