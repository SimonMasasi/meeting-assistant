//! Commands for reading and configuring the attachment storage folder.

use std::path::PathBuf;

use tauri::Manager;

use crate::error::Result;
use crate::settings::{load_settings, save_settings};

/// The folder where attachments are stored: the user-configured directory,
/// falling back to the OS Downloads folder when none has been set.
pub fn resolve_storage_dir(app: &tauri::AppHandle) -> Result<PathBuf> {
    let settings = load_settings(app);
    if let Some(dir) = settings.storage_dir.filter(|d| !d.trim().is_empty()) {
        return Ok(PathBuf::from(dir));
    }
    Ok(app.path().download_dir()?)
}

/// Return the currently effective storage folder (configured or Downloads default).
#[tauri::command]
pub fn get_storage_dir(app: tauri::AppHandle) -> Result<String> {
    Ok(resolve_storage_dir(&app)?.to_string_lossy().to_string())
}

/// Persist the user's chosen storage folder.
#[tauri::command]
pub fn set_storage_dir(app: tauri::AppHandle, path: String) -> Result<()> {
    // Validate/create the chosen directory so later writes succeed.
    std::fs::create_dir_all(&path)?;

    // Read-modify-write so we don't clobber other settings (e.g. mail).
    let mut settings = load_settings(&app);
    settings.storage_dir = Some(path);
    save_settings(&app, &settings)
}
