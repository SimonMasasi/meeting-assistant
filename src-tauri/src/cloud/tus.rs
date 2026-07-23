//! The tus 1.0.0 resumable-upload protocol against the backend's `/uploads/tus`.
//!
//! This module is the wire layer only — one function per verb, each a single
//! round-trip that returns either a parsed outcome or a [`TusError`] the caller
//! can branch on. The retry/seek/resume policy lives in
//! [`crate::commands::tus_upload`], which drives these.
//!
//! Two things make tus awkward for [`super::client`] and are why this file
//! exists separately:
//!
//! - **The protocol lives in headers.** `Location`, `Upload-Offset` and
//!   `Tus-Max-Size` carry the state, and `client`'s `HttpResult` keeps only the
//!   status and the JSON body.
//! - **Status codes are meaningful.** `409` means "your offset is stale, ask me
//!   again", not "failed" — so they're mapped to a typed error rather than
//!   flattened into a message.
//!
//! Bodies are handed in as an already-bounded chunk (8 MB); nothing here ever
//! sees the whole file.

use std::time::Duration;

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::cloud::{base_url, client, load_session};
use crate::error::{Error, Result};

/// Every request except `OPTIONS` must carry this or the server answers `412`.
const TUS_VERSION: &str = "1.0.0";

/// The tus collection endpoint, joined onto the configured base URL.
const TUS_PATH: &str = "/uploads/tus";

/// Per-request timeout. A chunk is 8 MB, so this is generous even on a slow link
/// while still failing fast enough for the retry loop to be useful.
const TIMEOUT: Duration = Duration::from_secs(120);

/// A failure from one tus round-trip. The driver branches on these: some are
/// recoverable in place (`OffsetMismatch`), some mean "start over"
/// (`Gone`/`NotFound`/`Forbidden`), and some are outright bugs (`Precondition`).
#[derive(Debug)]
pub enum TusError {
    /// `409` — the offset we sent isn't the server's. HEAD and continue from
    /// the true offset. **Never a reason to restart from zero.**
    OffsetMismatch,
    /// `410` — the upload expired (24 h) or is already finalized.
    Gone,
    /// `404` — unknown upload key.
    NotFound,
    /// `403` — the upload belongs to a different user (stale row after an
    /// account switch).
    Forbidden,
    /// `413` — larger than `Tus-Max-Size`, or this chunk overruns the declared
    /// `Upload-Length`.
    TooLarge(String),
    /// `412` — missing or bad `Tus-Resumable`. A client bug.
    Precondition,
    /// `415` — wrong `Content-Type` on PATCH. A client bug.
    UnsupportedMedia,
    /// `401` — the access token expired mid-upload; refresh and retry.
    Unauthorized,
    /// The connection dropped, timed out, or the server said something
    /// unexpected. Retryable.
    Transport(String),
}

impl std::fmt::Display for TusError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::OffsetMismatch => write!(f, "upload offset mismatch"),
            Self::Gone => write!(f, "the upload expired or was already completed"),
            Self::NotFound => write!(f, "the upload is no longer on the server"),
            Self::Forbidden => write!(f, "the upload belongs to another account"),
            Self::TooLarge(m) => write!(f, "{m}"),
            Self::Precondition => write!(f, "the server rejected the tus protocol version"),
            Self::UnsupportedMedia => write!(f, "the server rejected the chunk content type"),
            Self::Unauthorized => write!(f, "the session expired during the upload"),
            Self::Transport(m) => write!(f, "{m}"),
        }
    }
}

impl From<TusError> for Error {
    fn from(e: TusError) -> Self {
        Error::Message(e.to_string())
    }
}

type TusResult<T> = std::result::Result<T, TusError>;

/// What the server advertises at `OPTIONS /uploads/tus`.
///
/// Only `Tus-Max-Size` is modelled: it's the one capability the client acts on
/// (fail an oversized file before transferring anything). The server also sends
/// `Tus-Version` and `Tus-Extension`, but this client speaks exactly 1.0.0 and
/// uses only creation + termination, so there is nothing to negotiate.
#[derive(Debug, Default)]
pub struct TusCaps {
    /// Largest upload the server will accept, when it declares one.
    pub max_size: Option<u64>,
}

/// The backend's `UploadedFile`, returned in the body of the **final** PATCH.
///
/// `id` is a **`String`**: ids are 64-bit and would lose precision as a JS
/// number. It must stay a string all the way to the frontend — never parsed.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadedFile {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub filename: String,
    #[serde(default)]
    pub content_type: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub file_path: String,
    #[serde(default)]
    pub file_type: String,
    #[serde(default)]
    pub file_hash: Option<String>,
    #[serde(default)]
    pub mimetype: Option<String>,
}

/// The result of appending one chunk.
#[derive(Debug)]
pub enum PatchOutcome {
    /// `204` — accepted, here is the new offset. More chunks to send.
    Continued(u64),
    /// `200` — that was the last chunk; the server finalized and returned the
    /// file record in the body. There is no extra call to make.
    ///
    /// Note this also covers the dedup case: an identical file (matched by
    /// SHA-256 server-side) comes back with "File already exists, returning
    /// existing file metadata" and the *existing* record. That is success.
    Finished(Box<UploadedFile>),
}

/// One completed round-trip: status plus the handful of headers tus uses.
struct TusResponse {
    status: u16,
    location: Option<String>,
    upload_offset: Option<u64>,
    upload_length: Option<u64>,
    max_size: Option<u64>,
    body: Value,
}

/// Map a non-2xx status onto the typed error the driver branches on.
fn status_error(status: u16, body: &Value) -> TusError {
    let detail = body
        .get("detail")
        .and_then(Value::as_str)
        .map(String::from)
        .unwrap_or_else(|| format!("the server returned {status}"));
    match status {
        401 => TusError::Unauthorized,
        403 => TusError::Forbidden,
        404 => TusError::NotFound,
        409 => TusError::OffsetMismatch,
        410 => TusError::Gone,
        412 => TusError::Precondition,
        413 => TusError::TooLarge(detail),
        415 => TusError::UnsupportedMedia,
        _ => TusError::Transport(detail),
    }
}

/// Read the tus headers off a `ureq` response.
fn read_response(resp: ureq::Response) -> TusResponse {
    let header_u64 = |name: &str| resp.header(name).and_then(|v| v.trim().parse::<u64>().ok());
    let status = resp.status();
    let location = resp.header("location").map(str::to_string);
    let upload_offset = header_u64("upload-offset");
    let upload_length = header_u64("upload-length");
    let max_size = header_u64("tus-max-size");

    // `into_string` consumes the response, so every header must be read first.
    // A 204 has no body at all; only the final PATCH's 200 carries JSON.
    let text = resp.into_string().unwrap_or_default();
    let body = if text.trim().is_empty() {
        Value::Null
    } else {
        serde_json::from_str(&text).unwrap_or(Value::Null)
    };

    TusResponse {
        status,
        location,
        upload_offset,
        upload_length,
        max_size,
        body,
    }
}

/// One blocking tus round-trip. `extra` are additional headers; `body` is the
/// raw request body (only PATCH has one).
fn call(
    method: &str,
    url: &str,
    bearer: Option<&str>,
    extra: &[(&str, String)],
    body: Option<Vec<u8>>,
) -> TusResult<TusResponse> {
    let mut req = ureq::request(method, url).timeout(TIMEOUT);
    // OPTIONS is the discovery request and is deliberately unauthenticated and
    // version-less; everything else carries both.
    if method != "OPTIONS" {
        req = req.set("tus-resumable", TUS_VERSION);
        if let Some(token) = bearer.filter(|t| !t.is_empty()) {
            req = req.set("authorization", &format!("Bearer {token}"));
        }
    }
    for (name, value) in extra {
        req = req.set(name, value);
    }

    let outcome = match body {
        Some(bytes) => req.send_bytes(&bytes),
        None => req.call(),
    };

    match outcome {
        Ok(resp) => Ok(read_response(resp)),
        // ureq treats any 4xx/5xx as an error; tus encodes meaning in those, so
        // unwrap it back into a normal response and let the caller classify.
        Err(ureq::Error::Status(_, resp)) => Ok(read_response(resp)),
        Err(e) => Err(TusError::Transport(format!(
            "could not reach {url}: {e}"
        ))),
    }
}

/// Run one blocking round-trip on a blocking thread, mirroring `client::run_call`.
async fn run(
    method: &'static str,
    url: String,
    bearer: Option<String>,
    extra: Vec<(&'static str, String)>,
    body: Option<Vec<u8>>,
) -> TusResult<TusResponse> {
    tauri::async_runtime::spawn_blocking(move || {
        call(method, &url, bearer.as_deref(), &extra, body)
    })
    .await
    .map_err(|e| TusError::Transport(format!("upload task failed: {e}")))?
}

/// The stored access token, or an error telling the user to sign in.
async fn token(app: &tauri::AppHandle) -> Result<String> {
    Ok(load_session(app)
        .await?
        .ok_or_else(|| Error::Message("Not signed in to the cloud.".into()))?
        .access_token)
}

/// The tus collection URL for the configured backend. Never hardcoded — it
/// resolves through [`crate::cloud::base_url`], which is user-configurable.
pub async fn collection_url(app: &tauri::AppHandle) -> Result<String> {
    Ok(client::join(&base_url(app).await?, TUS_PATH))
}

/// `OPTIONS /uploads/tus` — discover the server's limits. Unauthenticated.
pub async fn options(app: &tauri::AppHandle) -> Result<TusCaps> {
    let url = collection_url(app).await?;
    let res = run("OPTIONS", url, None, vec![], None).await?;
    // 204 is the spec'd answer; some proxies answer 200. Anything else and we
    // simply learn nothing — an absent Tus-Max-Size is already "no known limit".
    Ok(TusCaps { max_size: res.max_size })
}

/// Encode one `Upload-Metadata` pair as `key <base64value>`.
fn meta_pair(key: &str, value: &str) -> String {
    format!(
        "{key} {}",
        base64::engine::general_purpose::STANDARD.encode(value)
    )
}

/// `POST /uploads/tus` — create the upload and return its absolute URL.
///
/// The returned `Location` is used **verbatim** by every later request; it is
/// never rebuilt from the base URL, since the server is free to point elsewhere.
pub async fn create(
    app: &tauri::AppHandle,
    file_name: &str,
    content_type: &str,
    size: u64,
) -> Result<String> {
    let url = collection_url(app).await?;
    // `filename` is required by the server; `filetype` is sent alongside it.
    let metadata = format!(
        "{},{}",
        meta_pair("filename", file_name),
        meta_pair("filetype", content_type)
    );
    let res = run(
        "POST",
        url.clone(),
        Some(token(app).await?),
        vec![
            ("upload-length", size.to_string()),
            ("upload-metadata", metadata),
            ("content-length", "0".to_string()),
        ],
        None,
    )
    .await?;

    if res.status != 201 {
        return Err(status_error(res.status, &res.body).into());
    }
    res.location
        .filter(|l| !l.trim().is_empty())
        .ok_or_else(|| Error::Message("the server created the upload but returned no Location".into()))
}

/// `HEAD {uploadUrl}` — ask the server where it actually is.
///
/// This is the source of truth for resuming: its answer always wins over any
/// locally remembered offset.
pub async fn head(app: &tauri::AppHandle, upload_url: &str) -> TusResult<(u64, Option<u64>)> {
    let bearer = token(app)
        .await
        .map_err(|e| TusError::Transport(e.to_string()))?;
    let res = run("HEAD", upload_url.to_string(), Some(bearer), vec![], None).await?;
    if res.status != 204 && res.status != 200 {
        return Err(status_error(res.status, &res.body));
    }
    let offset = res.upload_offset.ok_or_else(|| {
        TusError::Transport("the server did not report an Upload-Offset".into())
    })?;
    Ok((offset, res.upload_length))
}

/// `PATCH {uploadUrl}` — append one chunk at `offset`.
///
/// `chunk` is already bounded by the caller (8 MB); this function never reads
/// from disk and never holds more than that chunk.
pub async fn patch(
    app: &tauri::AppHandle,
    upload_url: &str,
    offset: u64,
    chunk: Vec<u8>,
) -> TusResult<PatchOutcome> {
    let bearer = token(app)
        .await
        .map_err(|e| TusError::Transport(e.to_string()))?;
    let res = run(
        "PATCH",
        upload_url.to_string(),
        Some(bearer),
        vec![
            ("content-type", "application/offset+octet-stream".to_string()),
            ("upload-offset", offset.to_string()),
        ],
        Some(chunk),
    )
    .await?;

    match res.status {
        // Chunk accepted, more to come.
        204 => res
            .upload_offset
            .map(PatchOutcome::Continued)
            .ok_or_else(|| {
                TusError::Transport("the server accepted the chunk but reported no offset".into())
            }),
        // Last chunk: the server finalized and returned the file record inline.
        200 => {
            let data = client::unwrap_envelope_parts(res.status, res.body, upload_url)
                .map_err(|e| TusError::Transport(e.to_string()))?;
            let file: UploadedFile = serde_json::from_value(data).map_err(|e| {
                TusError::Transport(format!("could not read the upload result: {e}"))
            })?;
            if file.id.is_empty() {
                return Err(TusError::Transport(
                    "the upload finished but the server returned no file id".into(),
                ));
            }
            Ok(PatchOutcome::Finished(Box::new(file)))
        }
        _ => Err(status_error(res.status, &res.body)),
    }
}

/// `DELETE {uploadUrl}` — abandon the upload server-side (cancel).
pub async fn delete(app: &tauri::AppHandle, upload_url: &str) -> TusResult<()> {
    let bearer = token(app)
        .await
        .map_err(|e| TusError::Transport(e.to_string()))?;
    let res = run("DELETE", upload_url.to_string(), Some(bearer), vec![], None).await?;
    match res.status {
        // Already gone is a fine outcome for "make this not exist".
        204 | 404 | 410 => Ok(()),
        _ => Err(status_error(res.status, &res.body)),
    }
}
