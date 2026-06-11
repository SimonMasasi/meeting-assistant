//! Settings domain types and the keys under which scalar settings are stored.
//!
//! Persistence lives in the SQLite database (see [`crate::db`]); the `mail`
//! settings get their own table while simple scalars (e.g. the storage folder)
//! are key/value rows in the `settings` table.

use serde::{Deserialize, Serialize};

/// `settings.key` under which the chosen attachment storage folder is stored.
pub const STORAGE_DIR_KEY: &str = "storage_dir";

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
/// text-to-speech, chat/LLM) names a `provider`, an `api_key`, a `model` and a
/// `base_url`. Blank fields are treated as "use the application default" by the
/// callers that consume these settings.
///
/// Persisted as the single row (`id = 1`) of the `ai_settings` table.
#[derive(Serialize, Deserialize, Default, Clone)]
pub struct AiSettings {
    // Speech-to-text (transcription)
    pub stt_provider: String,
    pub stt_api_key: String,
    pub stt_model: String,
    pub stt_base_url: String,

    // Text-to-speech
    pub tts_provider: String,
    pub tts_api_key: String,
    pub tts_model: String,
    pub tts_base_url: String,

    // Chat / summarization (LLM)
    pub chat_provider: String,
    pub chat_api_key: String,
    pub chat_model: String,
    pub chat_base_url: String,
}
