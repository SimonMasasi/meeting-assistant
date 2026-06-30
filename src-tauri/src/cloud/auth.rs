//! Cloud authentication commands.
//!
//! These wrap the backend `/auth/*` endpoints. On success the JWTs are stored in
//! the `cloud_session` table (Rust side); only a small [`CloudUser`] crosses back
//! to the frontend for display. Login is by **username** (the backend matches
//! `User.username`), not email.

use serde::Serialize;
use serde_json::json;

use crate::cloud::dto::{BackendUser, LoginData};
use crate::cloud::{self, client};
use crate::error::{Error, Result};

/// A signed-in cloud user surfaced to the frontend. The access/refresh tokens
/// stay in Rust and are intentionally not included here.
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CloudUser {
    pub id: String,
    pub username: String,
    pub email: String,
    pub full_name: String,
}

impl From<BackendUser> for CloudUser {
    fn from(u: BackendUser) -> Self {
        CloudUser {
            id: u.id,
            username: u.username,
            email: u.email,
            full_name: u.full_name,
        }
    }
}

/// Sign in with username + password, persist the session, and return the user.
#[tauri::command]
pub async fn cloud_sign_in(
    app: tauri::AppHandle,
    username: String,
    password: String,
) -> Result<CloudUser> {
    let body = json!({ "username": username, "password": password });
    let data = client::public_request(&app, "POST", "/auth/login", Some(body)).await?;
    let login: LoginData = serde_json::from_value(data)
        .map_err(|e| Error::Message(format!("Unexpected login response: {e}")))?;
    cloud::save_session(&app, &login).await?;
    Ok(login.user.unwrap_or_default().into())
}

/// Register a new account. Does not sign in (the backend returns the created user
/// without tokens); the frontend follows this with [`cloud_sign_in`].
#[tauri::command]
pub async fn cloud_sign_up(
    app: tauri::AppHandle,
    username: String,
    email: String,
    password: String,
    first_name: Option<String>,
    last_name: Option<String>,
) -> Result<()> {
    let body = json!({
        "username": username,
        "email": email,
        "password": password,
        "firstName": first_name,
        "lastName": last_name,
    });
    client::public_request(&app, "POST", "/auth/register", Some(body)).await?;
    Ok(())
}

/// Sign out — clear the persisted session.
#[tauri::command]
pub async fn cloud_sign_out(app: tauri::AppHandle) -> Result<()> {
    cloud::clear_session(&app).await
}

/// Fetch the current user from `/auth/me` (validates the stored token, refreshing
/// it if needed).
#[tauri::command]
pub async fn cloud_me(app: tauri::AppHandle) -> Result<CloudUser> {
    let data = client::authed_request(&app, "GET", "/auth/me", None).await?;
    let user: BackendUser = serde_json::from_value(data)
        .map_err(|e| Error::Message(format!("Unexpected profile response: {e}")))?;
    Ok(user.into())
}

/// Whether the configured backend is reachable (drives the connectivity badge).
#[tauri::command]
pub async fn cloud_health(app: tauri::AppHandle) -> Result<bool> {
    client::ping(&app).await
}
