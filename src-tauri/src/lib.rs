//! Application library entrypoint.
//!
//! `main.rs` is a thin shim that calls [`run`]. Keeping the builder here (rather
//! than in `main.rs`) lets the same logic drive both desktop and mobile targets.

mod commands;
mod db;
mod diarize;
mod error;
mod settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(db::DB_URL, db::migrations())
                .build(),
        )
        .manage(commands::microphone::RecordingState::default())
        .invoke_handler(tauri::generate_handler![
            commands::greet::greet,
            commands::attachments::save_meeting_attachment,
            commands::storage::get_storage_dir,
            commands::storage::set_storage_dir,
            commands::mail::get_mail_settings,
            commands::mail::set_mail_settings,
            commands::ai::get_ai_settings,
            commands::ai::set_ai_settings,
            commands::models::list_local_models,
            commands::microphone::list_microphones,
            commands::microphone::start_recording,
            commands::microphone::stop_recording,
            commands::microphone::is_recording,
            commands::recordings::list_meeting_recordings,
            commands::recordings::delete_recording,
            commands::recordings::merge_recordings,
            commands::mic_permission::check_microphone_permission,
            commands::mic_permission::request_microphone_permission,
            commands::transcription::transcription_models_ready,
            commands::transcription::ensure_transcription_models,
            commands::transcription::get_transcript,
            commands::transcription::rename_speaker,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
