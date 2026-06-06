//! Commands for reading and configuring the attachment storage folder.
//!
//! The chosen folder is persisted as a key/value row in the `settings` table.

use std::path::PathBuf;

use sqlx::Row;
use tauri::Manager;

use crate::db::pool;
use crate::error::Result;
use crate::settings::STORAGE_DIR_KEY;

/// Read the configured storage folder from the database, if any was set.
async fn stored_storage_dir(app: &tauri::AppHandle) -> Result<Option<String>> {
    let pool = pool(app).await?;
    let row = sqlx::query("SELECT value FROM settings WHERE key = $1")
        .bind(STORAGE_DIR_KEY)
        .fetch_optional(&pool)
        .await?;
    Ok(row.map(|r| r.get::<String, _>("value")))
}

/// The folder where attachments are stored: the user-configured directory,
/// falling back to the OS Downloads folder when none has been set.
pub async fn resolve_storage_dir(app: &tauri::AppHandle) -> Result<PathBuf> {
    if let Some(dir) = stored_storage_dir(app)
        .await?
        .filter(|d| !d.trim().is_empty())
    {
        return Ok(PathBuf::from(dir));
    }
    Ok(app.path().download_dir()?)
}

/// Return the currently effective storage folder (configured or Downloads default).
#[tauri::command]
pub async fn get_storage_dir(app: tauri::AppHandle) -> Result<String> {
    Ok(resolve_storage_dir(&app).await?.to_string_lossy().to_string())
}

/// Persist the user's chosen storage folder.
#[tauri::command]
pub async fn set_storage_dir(app: tauri::AppHandle, path: String) -> Result<()> {
    // Validate/create the chosen directory so later writes succeed.
    std::fs::create_dir_all(&path)?;

    let pool = pool(&app).await?;
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(STORAGE_DIR_KEY)
    .bind(path)
    .execute(&pool)
    .await?;
    Ok(())
}
