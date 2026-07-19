//! Settings domain types and the keys under which scalar settings are stored.
//!
//! Persistence lives in the SQLite database (see [`crate::db`]); the `mail`
//! settings get their own table while simple scalars (e.g. the storage folder)
//! are key/value rows in the `settings` table.

use serde::{Deserialize, Serialize};

/// `settings.key` under which the chosen attachment storage folder is stored.
pub const STORAGE_DIR_KEY: &str = "storage_dir";

/// `settings.key` for the active app mode ("local" | "cloud"). Mirrors the
/// frontend `appModeAtom` so Rust commands can route local-vs-cloud. Absent or
/// any non-"cloud" value is treated as local.
pub const APP_MODE_KEY: &str = "app_mode";
/// `settings.key` for the cloud backend base URL used in cloud mode. Blank/unset
/// falls back to [`crate::cloud::DEFAULT_BASE_URL`].
pub const CLOUD_BASE_URL_KEY: &str = "cloud_base_url";
/// `settings.key` for the Google OAuth **desktop** client ID used by
/// "Continue with Google". Public value (not a secret). Blank/unset falls back to
/// the `GOOGLE_CLIENT_ID` environment variable (loaded from `.env`), then empty.
/// See [`crate::cloud::google_client_id`].
pub const GOOGLE_CLIENT_ID_KEY: &str = "google_client_id";
/// `settings.key` for the Google OAuth **desktop** client secret. Google requires
/// it in the authorization-code exchange even for installed/desktop clients (where
/// it is not treated as truly confidential). Blank/unset falls back to the
/// `GOOGLE_CLIENT_SECRET` environment variable (loaded from `.env`), then empty.
/// See [`crate::cloud::google_client_secret`].
pub const GOOGLE_CLIENT_SECRET_KEY: &str = "google_client_secret";

/// `settings.key` for the on-device Whisper model size ("tiny" | "base" | "small").
pub const TRANSCRIPTION_MODEL_SIZE_KEY: &str = "transcription_model_size";
/// `settings.key` for the transcription language code (e.g. "en", "es", "fr").
pub const TRANSCRIPTION_LANGUAGE_KEY: &str = "transcription_language";

/// Outgoing mail (SMTP) configuration. Persisted as the single row in the
/// `mail_settings` table.
#[derive(Serialize, Deserialize, Default, Clone)]
pub struct MailSettings {
    pub sender_name: String,
    pub sender_email: String,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub username: String,
    pub password: String, // stored as-is (local desktop app)
    pub encryption: String, // "ssl" | "tls" | "starttls" | "none"
    pub reply_to: String,
}

/// Per-role AI model provider configuration. Each role (speech-to-text,
/// chat/LLM) names a `provider`, an `api_key`, a `model` and a `base_url`. Blank
/// fields are treated as "use the application default" by the callers that
/// consume these settings.
///
/// Persisted as the single row (`id = 1`) of the `ai_settings` table. The table
/// still carries legacy `tts_*` columns (kept as harmless `NOT NULL DEFAULT ''`
/// storage); they are intentionally no longer modelled here.
#[derive(Serialize, Deserialize, Default, Clone)]
pub struct AiSettings {
    // Speech-to-text (transcription)
    pub stt_provider: String,
    pub stt_api_key: String,
    pub stt_model: String,
    pub stt_base_url: String,

    // Chat / summarization (LLM)
    pub chat_provider: String,
    pub chat_api_key: String,
    pub chat_model: String,
    pub chat_base_url: String,
}
