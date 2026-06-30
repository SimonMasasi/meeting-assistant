//! Serde shapes for the FastAPI backend's JSON contract.
//!
//! Every backend response is wrapped in a `{ "response": {...}, "data": ... }`
//! envelope (see [`Envelope`]); success/failure is carried by `response.status`,
//! not the HTTP status. Payloads are camelCase and entity ids are serialized as
//! strings, so these structs use `rename_all = "camelCase"` and `String` ids.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The standard response envelope shared by every endpoint.
#[derive(Deserialize)]
pub struct Envelope {
    pub response: ResponseMeta,
    #[serde(default)]
    pub data: Option<Value>,
}

/// The `response` block of an [`Envelope`]. `status == false` means the request
/// failed at the application level (even with HTTP 200); `message` is the
/// user-facing reason.
#[derive(Deserialize)]
pub struct ResponseMeta {
    #[serde(default)]
    pub status: Option<bool>,
    #[serde(default)]
    pub message: Option<String>,
}

/// The `data` of a successful `/auth/login` or `/auth/refresh-token` response.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginData {
    pub access_token: String,
    pub refresh_token: String,
    /// Access-token lifetime in seconds; used to stamp `cloud_session.expires_at`.
    #[serde(default)]
    pub expires_in: i64,
    #[serde(default)]
    pub user: Option<BackendUser>,
}

/// The subset of the backend `User` we surface to the frontend. Unknown fields
/// (userType, createdAt, …) are ignored.
#[derive(Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct BackendUser {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub full_name: String,
}
