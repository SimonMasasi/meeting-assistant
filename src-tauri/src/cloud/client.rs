//! HTTP layer for the cloud backend.
//!
//! `ureq` is blocking, so each round-trip runs on a blocking thread (the same
//! `spawn_blocking` pattern as [`crate::commands::summary`]). Callers get the
//! unwrapped `data` payload back; the response envelope and a one-shot
//! token-refresh on `401` are handled here.

use std::time::Duration;

use serde_json::Value;

use crate::cloud::dto::{Envelope, LoginData};
use crate::cloud::{base_url, load_session, save_session};
use crate::error::{Error, Result};

// Generous: cloud transcription + LLM summarization can take well over a minute.
// Live per-utterance transcription passes its own, much shorter timeout instead —
// it sits on the critical path of a recording and must not stall the pipeline.
const TIMEOUT: Duration = Duration::from_secs(180);

/// A completed HTTP response: the status code and parsed JSON body. Non-2xx
/// responses are returned here too (not as errors) so callers can branch on the
/// status — only transport failures (backend unreachable) error out.
struct HttpResult {
    status: u16,
    body: Value,
}

/// Join a base URL and a path into a full URL (`/auth/me` → `…:8000/auth/me`).
fn join(base: &str, path: &str) -> String {
    format!("{}/{}", base.trim_end_matches('/'), path.trim_start_matches('/'))
}

/// One blocking HTTP round-trip. Runs inside `spawn_blocking`.
fn http_call(
    method: String,
    url: String,
    bearer: Option<String>,
    body: Option<Value>,
    timeout: Duration,
) -> Result<HttpResult> {
    let mut req = ureq::request(&method, &url)
        .timeout(timeout)
        .set("content-type", "application/json");
    if let Some(token) = bearer.as_deref().filter(|t| !t.is_empty()) {
        req = req.set("authorization", &format!("Bearer {token}"));
    }

    let outcome = match &body {
        Some(b) => req.send_bytes(serde_json::to_string(b)?.as_bytes()),
        None => req.call(),
    };

    match outcome {
        Ok(resp) => Ok(HttpResult {
            status: resp.status(),
            body: parse_body(resp),
        }),
        // A non-2xx with a response body (e.g. 401 + `{"detail": …}`): keep it so
        // the orchestrator can refresh on 401 or surface the message.
        Err(ureq::Error::Status(code, resp)) => Ok(HttpResult {
            status: code,
            body: parse_body(resp),
        }),
        Err(e) => Err(Error::Message(format!(
            "Cannot reach the cloud backend at {url}: {e}"
        ))),
    }
}

/// Read a response body to a JSON `Value`, tolerating empty/non-JSON bodies.
fn parse_body(resp: ureq::Response) -> Value {
    let text = resp.into_string().unwrap_or_default();
    if text.trim().is_empty() {
        Value::Null
    } else {
        serde_json::from_str(&text).unwrap_or(Value::Null)
    }
}

/// Run one blocking call on a blocking thread, off the async runtime workers.
async fn run_call(
    method: &str,
    url: &str,
    bearer: Option<String>,
    body: Option<Value>,
    timeout: Duration,
) -> Result<HttpResult> {
    let (method, url) = (method.to_string(), url.to_string());
    tauri::async_runtime::spawn_blocking(move || http_call(method, url, bearer, body, timeout))
        .await
        .map_err(|e| Error::Message(format!("cloud request task failed: {e}")))?
}

/// Validate the response envelope and return its `data`. `response.status == false`
/// (or an HTTP error with a `detail`) becomes a readable [`Error::Message`].
fn unwrap_envelope(res: HttpResult, url: &str) -> Result<Value> {
    if let Ok(env) = serde_json::from_value::<Envelope>(res.body.clone()) {
        let ok = env.response.status.unwrap_or(res.status < 400);
        if !ok {
            return Err(Error::Message(env.response.message.unwrap_or_else(|| {
                format!("Cloud request to {url} failed")
            })));
        }
        return Ok(env.data.unwrap_or(Value::Null));
    }
    if res.status >= 400 {
        let detail = res
            .body
            .get("detail")
            .and_then(Value::as_str)
            .map(String::from)
            .unwrap_or_else(|| format!("Cloud request to {url} failed ({})", res.status));
        return Err(Error::Message(detail));
    }
    Ok(res.body)
}

/// Call an endpoint that needs no auth (login, register, refresh). Returns the
/// unwrapped `data` payload.
pub async fn public_request(
    app: &tauri::AppHandle,
    method: &str,
    path: &str,
    body: Option<Value>,
) -> Result<Value> {
    let url = join(&base_url(app).await?, path);
    let res = run_call(method, &url, None, body, TIMEOUT).await?;
    unwrap_envelope(res, &url)
}

/// Call a protected endpoint with the stored access token, transparently
/// refreshing once on `401` and retrying. Returns the unwrapped `data` payload.
pub async fn authed_request(
    app: &tauri::AppHandle,
    method: &str,
    path: &str,
    body: Option<Value>,
) -> Result<Value> {
    let session = load_session(app)
        .await?
        .ok_or_else(|| Error::Message("Not signed in to the cloud.".into()))?;
    let url = join(&base_url(app).await?, path);

    let first = run_call(method, &url, Some(session.access_token), body.clone(), TIMEOUT).await?;
    let res = if first.status == 401 {
        // Access tokens live only ~5 min — refresh once, then retry.
        let access = refresh(app).await?;
        run_call(method, &url, Some(access), body, TIMEOUT).await?
    } else {
        first
    };
    unwrap_envelope(res, &url)
}

/// Exchange the stored refresh token for a fresh access token, persist the new
/// session, and return the new access token. Maps any failure to a "sign in
/// again" message so the UI can prompt re-auth.
async fn refresh(app: &tauri::AppHandle) -> Result<String> {
    let session = load_session(app)
        .await?
        .filter(|s| !s.refresh_token.is_empty())
        .ok_or_else(|| Error::Message("Session expired. Please sign in again.".into()))?;

    // The backend takes the refresh token as a query parameter. JWTs are
    // URL-safe (base64url + '.'), so no escaping is needed.
    let path = format!("/auth/refresh-token?refresh_token={}", session.refresh_token);
    let data = public_request(app, "POST", &path, None)
        .await
        .map_err(|_| Error::Message("Session expired. Please sign in again.".into()))?;

    let login: LoginData = serde_json::from_value(data)
        .map_err(|_| Error::Message("Session expired. Please sign in again.".into()))?;
    save_session(app, &login).await?;
    Ok(login.access_token)
}

/// POST a single file to `path` as multipart/form-data with the stored access
/// token, refreshing once on 401. Returns the unwrapped `data` payload.
pub async fn authed_multipart(
    app: &tauri::AppHandle,
    path: &str,
    filename: &str,
    bytes: Vec<u8>,
    timeout: Duration,
) -> Result<Value> {
    let session = load_session(app)
        .await?
        .ok_or_else(|| Error::Message("Not signed in to the cloud.".into()))?;
    let url = join(&base_url(app).await?, path);
    let boundary = "----meetingAssistantBoundary8f2b9c1d".to_string();
    let content_type = format!("multipart/form-data; boundary={boundary}");
    let body = multipart_body(&boundary, filename, &bytes);

    let first = run_upload(
        &url,
        Some(session.access_token),
        &content_type,
        body.clone(),
        timeout,
    )
    .await?;
    let res = if first.status == 401 {
        let access = refresh(app).await?;
        run_upload(&url, Some(access), &content_type, body, timeout).await?
    } else {
        first
    };
    unwrap_envelope(res, &url)
}

/// Upload a file to `/uploads/upload-file` as multipart/form-data, returning the
/// new file's id. Refreshes the access token once on 401.
pub async fn upload_file(app: &tauri::AppHandle, filename: &str, bytes: Vec<u8>) -> Result<String> {
    let data = authed_multipart(app, "/uploads/upload-file", filename, bytes, TIMEOUT).await?;
    data.get("id")
        .and_then(Value::as_str)
        .map(String::from)
        .ok_or_else(|| Error::Message("upload response was missing a file id".into()))
}

/// Assemble a single-file multipart/form-data body for the `file` field.
fn multipart_body(boundary: &str, filename: &str, bytes: &[u8]) -> Vec<u8> {
    let mut body = Vec::with_capacity(bytes.len() + 256);
    body.extend_from_slice(
        format!(
            "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\nContent-Type: application/octet-stream\r\n\r\n"
        )
        .as_bytes(),
    );
    body.extend_from_slice(bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    body
}

/// Blocking multipart upload (raw body + custom content-type). Mirrors [`http_call`].
fn http_upload(
    url: String,
    bearer: Option<String>,
    content_type: String,
    body: Vec<u8>,
    timeout: Duration,
) -> Result<HttpResult> {
    let mut req = ureq::post(&url).timeout(timeout).set("content-type", &content_type);
    if let Some(token) = bearer.as_deref().filter(|t| !t.is_empty()) {
        req = req.set("authorization", &format!("Bearer {token}"));
    }
    match req.send_bytes(&body) {
        Ok(resp) => Ok(HttpResult { status: resp.status(), body: parse_body(resp) }),
        Err(ureq::Error::Status(code, resp)) => {
            Ok(HttpResult { status: code, body: parse_body(resp) })
        }
        Err(e) => Err(Error::Message(format!(
            "Cannot reach the cloud backend at {url}: {e}"
        ))),
    }
}

async fn run_upload(
    url: &str,
    bearer: Option<String>,
    content_type: &str,
    body: Vec<u8>,
    timeout: Duration,
) -> Result<HttpResult> {
    let (url, content_type) = (url.to_string(), content_type.to_string());
    tauri::async_runtime::spawn_blocking(move || {
        http_upload(url, bearer, content_type, body, timeout)
    })
    .await
    .map_err(|e| Error::Message(format!("cloud upload task failed: {e}")))?
}

/// Best-effort reachability check of the configured backend (used by the cloud
/// connectivity indicator). Any HTTP response counts as reachable; only a
/// transport failure is `false`.
pub async fn ping(app: &tauri::AppHandle) -> Result<bool> {
    let url = join(&base_url(app).await?, "/openapi.json");
    match run_call("GET", &url, None, None, TIMEOUT).await {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}
