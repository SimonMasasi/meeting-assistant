//! HTTP layer for the cloud backend.
//!
//! `ureq` is blocking, so each round-trip runs on a blocking thread (the same
//! `spawn_blocking` pattern as [`crate::commands::summary`]). Callers get the
//! unwrapped `data` payload back; the response envelope and a one-shot
//! token-refresh on `401` are handled here.

use std::io::{BufRead, BufReader};
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
pub(crate) fn join(base: &str, path: &str) -> String {
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
    unwrap_envelope_parts(res.status, res.body, url)
}

/// [`unwrap_envelope`] over a raw (status, body) pair, for callers that read the
/// response themselves. The tus layer needs the response *headers*, so it can't
/// hand over an [`HttpResult`] — it shares the envelope rules through here.
pub(crate) fn unwrap_envelope_parts(status: u16, body: Value, url: &str) -> Result<Value> {
    if let Ok(env) = serde_json::from_value::<Envelope>(body.clone()) {
        let ok = env.response.status.unwrap_or(status < 400);
        if !ok {
            return Err(Error::Message(env.response.message.unwrap_or_else(|| {
                format!("Cloud request to {url} failed")
            })));
        }
        return Ok(env.data.unwrap_or(Value::Null));
    }
    if status >= 400 {
        let detail = body
            .get("detail")
            .and_then(Value::as_str)
            .map(String::from)
            .unwrap_or_else(|| format!("Cloud request to {url} failed ({status})"));
        return Err(Error::Message(detail));
    }
    Ok(body)
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
    authed_request_with_timeout(app, method, path, body, TIMEOUT).await
}

/// [`authed_request`] with an explicit timeout, for endpoints whose work scales
/// with the input rather than being a quick lookup — transcribing a multi-hour,
/// multi-gigabyte recording runs far past the default three minutes.
pub async fn authed_request_with_timeout(
    app: &tauri::AppHandle,
    method: &str,
    path: &str,
    body: Option<Value>,
    timeout: Duration,
) -> Result<Value> {
    let session = load_session(app)
        .await?
        .ok_or_else(|| Error::Message("Not signed in to the cloud.".into()))?;
    let url = join(&base_url(app).await?, path);

    let first = run_call(method, &url, Some(session.access_token), body.clone(), timeout).await?;
    let res = if first.status == 401 {
        // Access tokens live only ~5 min — refresh once, then retry.
        let access = refresh(app).await?;
        run_call(method, &url, Some(access), body, timeout).await?
    } else {
        first
    };
    unwrap_envelope(res, &url)
}

/// How a streaming call ended. `Unauthorized` is separated out because the retry
/// needs a fresh token, which only the async side can obtain.
enum SseFail {
    Unauthorized,
    Failed(Error),
}

/// Parse one server-sent event frame — the lines between two blank lines — into
/// its event name and JSON payload.
///
/// Returns `None` for anything that isn't a complete named JSON event: comment
/// lines (`: keep-alive`), frames with no `data:`, and unparseable payloads are
/// all skipped rather than failing the stream.
fn parse_sse_frame(frame: &str) -> Option<(String, Value)> {
    let mut name: Option<String> = None;
    let mut data = String::new();
    for line in frame.lines() {
        if let Some(value) = line.strip_prefix("event:") {
            name = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("data:") {
            // Multi-line payloads concatenate with newlines, per the SSE spec.
            if !data.is_empty() {
                data.push('\n');
            }
            data.push_str(value.strip_prefix(' ').unwrap_or(value));
        }
    }
    Some((name?, serde_json::from_str(&data).ok()?))
}

/// One blocking SSE round-trip: POST, then read the response body as it arrives,
/// handing each complete event to `on_event`. Runs inside `spawn_blocking`.
///
/// Unlike [`http_call`] the body is never buffered — `into_reader` streams, so
/// events surface as the server produces them, which is the entire point.
fn sse_call(
    url: &str,
    bearer: Option<String>,
    body: Option<Value>,
    timeout: Duration,
    on_event: &mut dyn FnMut(&str, Value) -> Result<()>,
) -> std::result::Result<(), SseFail> {
    let mut req = ureq::post(url)
        .timeout(timeout)
        .set("content-type", "application/json")
        .set("accept", "text/event-stream");
    if let Some(token) = bearer.as_deref().filter(|t| !t.is_empty()) {
        req = req.set("authorization", &format!("Bearer {token}"));
    }
    let payload = match &body {
        Some(b) => serde_json::to_vec(b).map_err(|e| SseFail::Failed(e.into()))?,
        None => Vec::new(),
    };

    let resp = match req.send_bytes(&payload) {
        Ok(resp) => resp,
        Err(ureq::Error::Status(401, _)) => return Err(SseFail::Unauthorized),
        // The backend predates the streaming endpoint; the caller falls back.
        Err(ureq::Error::Status(404, _)) => return Err(SseFail::Failed(Error::EndpointUnsupported)),
        Err(ureq::Error::Status(code, resp)) => {
            let body = parse_body(resp);
            let err = unwrap_envelope_parts(code, body, url)
                .err()
                .unwrap_or_else(|| Error::Message(format!("Cloud request to {url} failed ({code})")));
            return Err(SseFail::Failed(err));
        }
        Err(e) => {
            return Err(SseFail::Failed(Error::Message(format!(
                "Cannot reach the cloud backend at {url}: {e}"
            ))))
        }
    };

    let mut reader = BufReader::new(resp.into_reader());
    let mut frame = String::new();
    let mut line = String::new();
    loop {
        line.clear();
        let read = reader
            .read_line(&mut line)
            .map_err(|e| SseFail::Failed(e.into()))?;
        // A blank line terminates a frame; EOF flushes whatever is pending.
        if read == 0 || line.trim().is_empty() {
            if let Some((name, data)) = parse_sse_frame(&frame) {
                on_event(&name, data).map_err(SseFail::Failed)?;
            }
            frame.clear();
            if read == 0 {
                return Ok(());
            }
            continue;
        }
        frame.push_str(&line);
    }
}

/// Run one streaming call on a blocking thread. The callback is handed back so a
/// `401` retry can reuse it — it owns state (emitted counts, throttles) that must
/// survive the second attempt.
async fn run_sse<F>(
    url: &str,
    bearer: Option<String>,
    body: Option<Value>,
    timeout: Duration,
    mut on_event: F,
) -> Result<(F, std::result::Result<(), SseFail>)>
where
    F: FnMut(&str, Value) -> Result<()> + Send + 'static,
{
    let url = url.to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let outcome = sse_call(&url, bearer, body, timeout, &mut on_event);
        (on_event, outcome)
    })
    .await
    .map_err(|e| Error::Message(format!("cloud stream task failed: {e}")))
}

/// Call a protected endpoint that responds with `text/event-stream`, invoking
/// `on_event` for each event as it arrives. Refreshes once on `401` and retries,
/// like [`authed_request`].
///
/// The callback's error ends the stream and is returned — that is how a terminal
/// `error` event from the server becomes this call's failure. Note that an
/// endpoint which has already sent its headers cannot report a failure with a
/// status code, so callers must treat a stream that ends without its own
/// completion event as failed.
pub async fn authed_sse<F>(
    app: &tauri::AppHandle,
    path: &str,
    body: Option<Value>,
    timeout: Duration,
    on_event: F,
) -> Result<()>
where
    F: FnMut(&str, Value) -> Result<()> + Send + 'static,
{
    let session = load_session(app)
        .await?
        .ok_or_else(|| Error::Message("Not signed in to the cloud.".into()))?;
    let url = join(&base_url(app).await?, path);

    let (on_event, first) = run_sse(
        &url,
        Some(session.access_token),
        body.clone(),
        timeout,
        on_event,
    )
    .await?;
    let outcome = match first {
        Err(SseFail::Unauthorized) => {
            let access = refresh(app).await?;
            run_sse(&url, Some(access), body, timeout, on_event).await?.1
        }
        other => other,
    };
    match outcome {
        Ok(()) => Ok(()),
        Err(SseFail::Failed(e)) => Err(e),
        Err(SseFail::Unauthorized) => Err(Error::Message(
            "Session expired. Please sign in again.".into(),
        )),
    }
}

/// Exchange the stored refresh token for a fresh access token, persist the new
/// session, and return the new access token. Maps any failure to a "sign in
/// again" message so the UI can prompt re-auth.
///
/// `pub(crate)` because a long tus upload can outlive an access token and must
/// refresh mid-transfer, between chunks (see [`crate::commands::tus_upload`]).
pub(crate) async fn refresh(app: &tauri::AppHandle) -> Result<String> {
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
///
/// **Small payloads only.** The body is buffered whole (twice: `bytes`, then the
/// assembled multipart `Vec`), so this is for the few-second audio clips live
/// per-utterance transcription sends. Saved recordings — which can reach
/// gigabytes — go through the chunked, resumable
/// [`crate::commands::tus_upload`] path instead.
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

#[cfg(test)]
mod tests {
    use super::parse_sse_frame;

    #[test]
    fn frame_yields_name_and_payload() {
        let (name, data) =
            parse_sse_frame("event: segment\ndata: {\"index\":0,\"text\":\"Hello.\"}\n").unwrap();
        assert_eq!(name, "segment");
        assert_eq!(data["index"], 0);
        assert_eq!(data["text"], "Hello.");
    }

    #[test]
    fn field_value_space_is_optional() {
        let with = parse_sse_frame("event: done\ndata: {\"segmentCount\":2}\n").unwrap();
        let without = parse_sse_frame("event:done\ndata:{\"segmentCount\":2}\n").unwrap();
        assert_eq!(with.0, without.0);
        assert_eq!(with.1, without.1);
    }

    #[test]
    fn incomplete_or_unnamed_frames_are_skipped() {
        // Keep-alive comment, a bare payload with no event name, a named frame
        // with no data, and an unparseable payload.
        assert!(parse_sse_frame(": keep-alive\n").is_none());
        assert!(parse_sse_frame("data: {\"a\":1}\n").is_none());
        assert!(parse_sse_frame("event: progress\n").is_none());
        assert!(parse_sse_frame("event: progress\ndata: not json\n").is_none());
    }

    #[test]
    fn multi_line_data_is_joined_with_newlines() {
        let (_, data) = parse_sse_frame("event: error\ndata: {\"message\":\n\ndata: \"boom\"}\n")
            .unwrap();
        assert_eq!(data["message"], "boom");
    }
}
