//! Cloud configuration commands: the active app mode and the backend base URL.
//!
//! The frontend owns the `appModeAtom` for routing/UI; these commands mirror it
//! into the database so Rust commands can route local-vs-cloud (see
//! [`crate::cloud::current_mode`]).

use crate::cloud;
use crate::error::Result;

/// Mirror the frontend app mode ("local" | "cloud") into the database.
#[tauri::command]
pub async fn set_app_mode(app: tauri::AppHandle, mode: String) -> Result<()> {
    cloud::set_mode(&app, &mode).await
}

/// The configured cloud base URL (or the default when unset).
#[tauri::command]
pub async fn get_cloud_base_url(app: tauri::AppHandle) -> Result<String> {
    cloud::base_url(&app).await
}

/// Persist the cloud base URL.
#[tauri::command]
pub async fn set_cloud_base_url(app: tauri::AppHandle, url: String) -> Result<()> {
    cloud::set_base_url(&app, &url).await
}

/// The configured Google OAuth desktop client ID (or "" when unset).
#[tauri::command]
pub async fn get_google_client_id(app: tauri::AppHandle) -> Result<String> {
    cloud::google_client_id(&app).await
}

/// Persist the Google OAuth desktop client ID.
#[tauri::command]
pub async fn set_google_client_id(app: tauri::AppHandle, id: String) -> Result<()> {
    cloud::set_google_client_id(&app, &id).await
}

/// Persist the Google OAuth desktop client secret. There is deliberately no
/// getter — the secret must never be handed back to the webview.
#[tauri::command]
pub async fn set_google_client_secret(app: tauri::AppHandle, secret: String) -> Result<()> {
    cloud::set_google_client_secret(&app, &secret).await
}
