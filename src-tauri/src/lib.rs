//! Application library entrypoint.
//!
//! `main.rs` is a thin shim that calls [`run`]. Keeping the builder here (rather
//! than in `main.rs`) lets the same logic drive both desktop and mobile targets.

mod cloud;
mod commands;
mod db;
mod diarize;
mod error;
mod settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load `.env` (searched from the working dir upward — the repo root in dev)
    // into the process environment before anything reads config. Missing file is
    // fine; env vars set by the OS still win.
    let _ = dotenvy::dotenv();

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
            commands::meetings::list_meetings,
            commands::meetings::get_meeting,
            commands::meetings::create_meeting,
            commands::meetings::update_meeting,
            commands::meetings::delete_meeting,
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
            commands::transcription::get_transcription_settings,
            commands::transcription::set_transcription_settings,
            commands::transcription::get_transcript,
            commands::transcription::clear_transcript,
            commands::transcription::rename_speaker,
            commands::transcription::transcribe_recording,
            commands::summary::get_meeting_summary,
            commands::summary::generate_meeting_summary,
            commands::dashboard::get_dashboard_stats,
            cloud::auth::cloud_sign_in,
            cloud::auth::cloud_sign_up,
            cloud::auth::cloud_sign_out,
            cloud::auth::cloud_me,
            cloud::auth::cloud_health,
            cloud::google::cloud_sign_in_google,
            cloud::config::set_app_mode,
            cloud::config::get_cloud_base_url,
            cloud::config::set_cloud_base_url,
            cloud::config::get_google_client_id,
            cloud::config::set_google_client_id,
            cloud::config::set_google_client_secret,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
