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
