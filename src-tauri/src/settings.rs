//! Persisted application settings and the helpers that read/write them.
//!
//! Everything is stored as a single `settings.json` in the app config dir.
//! Helpers do read-modify-write so updating one section (e.g. mail) never
//! clobbers another (e.g. storage_dir).

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::error::Result;

/// Outgoing mail (SMTP) configuration.
#[derive(Serialize, Deserialize, Default, Clone)]
pub struct MailSettings {
    pub sender_name: String,
    pub sender_email: String,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub username: String,
    pub password: String, // stored as-is in settings.json (local desktop app)
    pub encryption: String, // "ssl" | "tls" | "starttls" | "none"
    pub reply_to: String,
}

/// The full persisted settings document.
#[derive(Serialize, Deserialize, Default)]
pub struct AppSettings {
    pub storage_dir: Option<String>,
    pub mail: Option<MailSettings>,
}

/// Absolute path to the `settings.json` file in the app config dir.
pub fn config_path(app: &tauri::AppHandle) -> Result<PathBuf> {
    Ok(app.path().app_config_dir()?.join("settings.json"))
}

/// Read the persisted settings, returning defaults when none exist yet.
pub fn load_settings(app: &tauri::AppHandle) -> AppSettings {
    if let Ok(path) = config_path(app) {
        if let Ok(contents) = std::fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str::<AppSettings>(&contents) {
                return settings;
            }
        }
    }
    AppSettings::default()
}

/// Persist the full settings object to disk, creating the config dir if needed.
pub fn save_settings(app: &tauri::AppHandle, settings: &AppSettings) -> Result<()> {
    let cfg = config_path(app)?;
    if let Some(parent) = cfg.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(settings)?;
    std::fs::write(&cfg, json)?;
    Ok(())
}
