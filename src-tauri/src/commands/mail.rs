//! Commands for reading and persisting outgoing mail settings.

use crate::error::Result;
use crate::settings::{load_settings, save_settings, MailSettings};

/// Return the saved outgoing mail settings, or defaults when none are set.
#[tauri::command]
pub fn get_mail_settings(app: tauri::AppHandle) -> Result<MailSettings> {
    Ok(load_settings(&app).mail.unwrap_or_default())
}

/// Persist the outgoing mail settings.
#[tauri::command]
pub fn set_mail_settings(app: tauri::AppHandle, settings: MailSettings) -> Result<()> {
    // Read-modify-write so we don't clobber other settings (e.g. storage_dir).
    let mut current = load_settings(&app);
    current.mail = Some(settings);
    save_settings(&app, &current)
}
