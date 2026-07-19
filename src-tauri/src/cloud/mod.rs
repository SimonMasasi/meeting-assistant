//! Cloud mode: talking to the FastAPI backend.
//!
//! In cloud mode the desktop app is a thin client — auth, data and (later)
//! inference run on the backend. All HTTP lives here (reusing the blocking-`ureq`
//! pattern from [`crate::commands::summary`]) so the frontend keeps calling the
//! same Tauri commands regardless of mode, and the JWT never leaves Rust.
//!
//! - [`client`] — the HTTP layer (envelope unwrapping + refresh-on-401).
//! - [`auth`]   — sign in / up / out / me commands.
//! - [`config`] — app-mode and base-URL commands.
//! - [`dto`]    — the backend's JSON shapes.

pub mod auth;
pub mod client;
pub mod config;
pub mod dto;
pub mod google;
pub mod meetings;
pub mod summary;
pub mod transcription;

use std::time::{SystemTime, UNIX_EPOCH};

use sqlx::Row;

use crate::db::pool;
use crate::error::Result;
use crate::settings::{
    APP_MODE_KEY, CLOUD_BASE_URL_KEY, GOOGLE_CLIENT_ID_KEY, GOOGLE_CLIENT_SECRET_KEY,
};
use self::dto::LoginData;

/// Base URL used when the user hasn't configured one. The backend defaults to
/// `:8000` (see the backend `config.py`).
pub const DEFAULT_BASE_URL: &str = "http://localhost:8000";

/// Which backend a command should talk to. Mirrors the frontend `appModeAtom`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum AppMode {
    Local,
    Cloud,
}

/// The persisted cloud session (the single `cloud_session` row), once signed in.
pub struct SessionRow {
    pub access_token: String,
    pub refresh_token: String,
}

/// Read a scalar value from the key/value `settings` table.
async fn read_setting(app: &tauri::AppHandle, key: &str) -> Result<Option<String>> {
    let pool = pool(app).await?;
    let row = sqlx::query("SELECT value FROM settings WHERE key = $1")
        .bind(key)
        .fetch_optional(&pool)
        .await?;
    Ok(row.map(|r| r.get::<String, _>("value")))
}

/// Upsert a scalar value into the key/value `settings` table.
async fn write_setting(app: &tauri::AppHandle, key: &str, value: &str) -> Result<()> {
    let pool = pool(app).await?;
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(key)
    .bind(value)
    .execute(&pool)
    .await?;
    Ok(())
}

/// The active app mode (defaults to local when unset or unrecognized).
pub async fn current_mode(app: &tauri::AppHandle) -> Result<AppMode> {
    Ok(match read_setting(app, APP_MODE_KEY).await?.as_deref() {
        Some("cloud") => AppMode::Cloud,
        _ => AppMode::Local,
    })
}

/// Persist the active app mode ("cloud" → cloud, anything else → local).
pub async fn set_mode(app: &tauri::AppHandle, mode: &str) -> Result<()> {
    let normalized = if mode == "cloud" { "cloud" } else { "local" };
    write_setting(app, APP_MODE_KEY, normalized).await
}

/// The configured cloud base URL, or [`DEFAULT_BASE_URL`] when blank/unset.
pub async fn base_url(app: &tauri::AppHandle) -> Result<String> {
    Ok(read_setting(app, CLOUD_BASE_URL_KEY)
        .await?
        .filter(|v| !v.trim().is_empty())
        .map(|v| v.trim().to_string())
        .unwrap_or_else(|| DEFAULT_BASE_URL.to_string()))
}

/// Persist the cloud base URL (trimmed; trailing slash dropped at call sites).
pub async fn set_base_url(app: &tauri::AppHandle, url: &str) -> Result<()> {
    write_setting(app, CLOUD_BASE_URL_KEY, url.trim()).await
}

/// The Google OAuth **desktop** client ID for "Continue with Google". Resolution
/// order: the stored `settings` value → the `GOOGLE_CLIENT_ID` environment
/// variable (loaded from `.env` at startup) → empty. The client ID is public
/// (safe to ship); the PKCE desktop flow uses no confidential secret.
pub async fn google_client_id(app: &tauri::AppHandle) -> Result<String> {
    if let Some(v) = read_setting(app, GOOGLE_CLIENT_ID_KEY)
        .await?
        .filter(|v| !v.trim().is_empty())
    {
        return Ok(v.trim().to_string());
    }
    Ok(std::env::var("GOOGLE_CLIENT_ID")
        .unwrap_or_default()
        .trim()
        .to_string())
}

/// Persist the Google OAuth desktop client ID.
pub async fn set_google_client_id(app: &tauri::AppHandle, id: &str) -> Result<()> {
    write_setting(app, GOOGLE_CLIENT_ID_KEY, id.trim()).await
}

/// The Google OAuth desktop client **secret**, required by Google's token
/// endpoint in the code exchange. Resolution: stored `settings` value → the
/// `GOOGLE_CLIENT_SECRET` env (loaded from `.env`) → empty. May be empty for a
/// truly public client, in which case it is simply omitted from the exchange.
pub async fn google_client_secret(app: &tauri::AppHandle) -> Result<String> {
    if let Some(v) = read_setting(app, GOOGLE_CLIENT_SECRET_KEY)
        .await?
        .filter(|v| !v.trim().is_empty())
    {
        return Ok(v.trim().to_string());
    }
    Ok(std::env::var("GOOGLE_CLIENT_SECRET")
        .unwrap_or_default()
        .trim()
        .to_string())
}

/// Persist the Google OAuth desktop client secret.
pub async fn set_google_client_secret(app: &tauri::AppHandle, secret: &str) -> Result<()> {
    write_setting(app, GOOGLE_CLIENT_SECRET_KEY, secret.trim()).await
}

/// Load the signed-in cloud session, or `None` when signed out (no row / blank
/// token).
pub async fn load_session(app: &tauri::AppHandle) -> Result<Option<SessionRow>> {
    let pool = pool(app).await?;
    let row = sqlx::query(
        "SELECT access_token, refresh_token FROM cloud_session WHERE id = 1",
    )
    .fetch_optional(&pool)
    .await?;
    Ok(row
        .map(|r| SessionRow {
            access_token: r.get("access_token"),
            refresh_token: r.get("refresh_token"),
        })
        .filter(|s| !s.access_token.is_empty()))
}

/// Persist (upsert) the session from a login/refresh response.
pub async fn save_session(app: &tauri::AppHandle, login: &LoginData) -> Result<()> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let expires_at = now + login.expires_in.max(0);
    let user = login.user.clone().unwrap_or_default();

    let pool = pool(app).await?;
    sqlx::query(
        "INSERT INTO cloud_session
             (id, access_token, refresh_token, expires_at, user_id, username, email)
         VALUES (1, $1, $2, $3, $4, $5, $6)
         ON CONFLICT(id) DO UPDATE SET
             access_token  = excluded.access_token,
             refresh_token = excluded.refresh_token,
             expires_at    = excluded.expires_at,
             user_id       = excluded.user_id,
             username      = excluded.username,
             email         = excluded.email",
    )
    .bind(&login.access_token)
    .bind(&login.refresh_token)
    .bind(expires_at)
    .bind(&user.id)
    .bind(&user.username)
    .bind(&user.email)
    .execute(&pool)
    .await?;
    Ok(())
}

/// Clear the persisted session (sign out).
pub async fn clear_session(app: &tauri::AppHandle) -> Result<()> {
    let pool = pool(app).await?;
    sqlx::query("DELETE FROM cloud_session WHERE id = 1")
        .execute(&pool)
        .await?;
    Ok(())
}
