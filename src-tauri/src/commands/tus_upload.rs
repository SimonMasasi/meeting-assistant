//! Resumable upload driver: turns a **file path** into an uploaded backend file.
//!
//! This lives in Rust rather than the webview for three reasons, in order:
//!
//! 1. Tauri's dialog plugin hands back a path string, not a `File`. The only way
//!    to get bytes from a path in JS is `fs.readFile`, which returns the whole
//!    thing — a 2 GB allocation that takes the webview down. Here we `seek` and
//!    read one 8 MB chunk at a time.
//! 2. Requests issued from Rust aren't subject to the webview's CORS and
//!    body-size rules.
//! 3. Resuming after a restart needs the upload URL persisted, and Rust already
//!    owns the database.
//!
//! Memory ceiling for an upload of any size: one open file handle, one reused
//! 8 MB read buffer, and the copy of the current chunk that is in flight as the
//! request body — roughly 16 MB at the high-water mark, whether the file is
//! 50 MB or 2 GB. Nothing accumulates across chunks.
//!
//! The wire protocol is [`crate::cloud::tus`]; the policy — retry, backoff,
//! resume, pause, cancel — is here.

use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sqlx::Row;
use tauri::{Emitter, Manager, State};

use crate::cloud::tus::{self, PatchOutcome, TusError, UploadedFile};
use crate::cloud::{client, load_session};
use crate::db::pool;
use crate::error::{Error, Result};

/// Bytes per PATCH. Large enough that per-request overhead is noise on a 2 GB
/// file (256 requests), small enough that a dropped connection costs little and
/// progress stays responsive.
const CHUNK: usize = 8 * 1024 * 1024;

/// Attempts per chunk before the error is surfaced, and the backoff between them.
const MAX_ATTEMPTS: u32 = 3;
const BACKOFF_BASE: Duration = Duration::from_millis(500);

/// Progress events are throttled to this interval (~4/sec) so a fast link
/// doesn't flood the webview with IPC.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);

/// The backend expires an upload after 24 h; older rows are dead on arrival.
const UPLOAD_TTL_SECS: i64 = 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Control state
// ---------------------------------------------------------------------------

/// Pause/cancel flags for one in-flight upload. Set from a command thread, read
/// by the driver between chunks.
#[derive(Default)]
pub struct Control {
    pause: AtomicBool,
    cancel: AtomicBool,
}

/// Live uploads, keyed by upload id. Registered with the Tauri builder via
/// `.manage(UploadState::default())`, like `RecordingState`.
#[derive(Default)]
pub struct UploadState(Mutex<HashMap<String, Arc<Control>>>);

impl UploadState {
    /// Register an upload and hand back its flags, or `None` if one is already
    /// running under this id.
    ///
    /// The guard matters: two loops PATCHing the same tus URL would each be told
    /// its offset is stale, and they'd trade 409s indefinitely. Since the id is
    /// derived from the path, this also makes double-clicking resume harmless.
    fn begin(&self, upload_id: &str) -> Option<Arc<Control>> {
        let mut map = self.0.lock().ok()?;
        if map.contains_key(upload_id) {
            return None;
        }
        let control = Arc::new(Control::default());
        map.insert(upload_id.to_string(), control.clone());
        Some(control)
    }

    fn end(&self, upload_id: &str) {
        if let Ok(mut map) = self.0.lock() {
            map.remove(upload_id);
        }
    }

    fn get(&self, upload_id: &str) -> Option<Arc<Control>> {
        self.0.lock().ok()?.get(upload_id).cloned()
    }
}

// ---------------------------------------------------------------------------
// Payloads crossing the IPC boundary
// ---------------------------------------------------------------------------

/// Emitted on `upload-progress` as chunks land.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadProgress {
    pub upload_id: String,
    pub bytes_sent: u64,
    pub total_bytes: u64,
    pub bytes_per_second: f64,
    pub eta_seconds: f64,
    /// True on the first event of a run that started from a non-zero offset, so
    /// the UI can say "Resuming at 42%" rather than flashing 0%.
    pub resumed: bool,
}

/// How an upload run ended. A pause is not a failure — the server already has
/// every byte we sent, so resuming is just calling start again.
#[derive(Clone, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum UploadOutcome {
    Completed {
        upload_id: String,
        file: UploadedFile,
    },
    Paused {
        upload_id: String,
        bytes_sent: u64,
        total_bytes: u64,
    },
    Cancelled {
        upload_id: String,
    },
}

/// Where the upload → transcribe pipeline currently is, emitted on
/// `transcribe-stage`.
///
/// Getting a file transcribed in cloud mode is two long operations back to back
/// — sending the bytes, then waiting on the server — and from the outside they
/// look identical: nothing happens for minutes. Without this the UI can only say
/// "Transcribing…", which is actively wrong for the whole first half. Progress
/// *within* the upload already streams on `upload-progress`; this says which
/// half we're in.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeStage {
    /// One of the [`stage`] constants below.
    pub stage: &'static str,
    /// Set while uploading: the id to match against `upload-progress.uploadId`,
    /// and to pass to `cancel_file_upload`.
    pub upload_id: Option<String>,
    /// Set when the pipeline started from a saved recording row. The file-picker
    /// path has no recording, and correlates on `upload_id` instead.
    pub recording_id: Option<String>,
    pub file_name: String,
    /// The backend file id, once known. A `String` — never parsed as a number.
    pub file_id: Option<String>,
    /// Why it failed, on `failed`.
    pub message: Option<String>,
}

/// The `stage` values a [`TranscribeStage`] can carry. String-typed rather than
/// an enum because the frontend switches on them directly.
pub mod stage {
    /// Resolving the recording and deciding whether an upload is even needed.
    pub const PREPARING: &str = "preparing";
    /// Sending bytes. `upload-progress` carries percent/speed/ETA meanwhile.
    pub const UPLOADING: &str = "uploading";
    /// All bytes are on the server and it returned a file id.
    pub const UPLOADED: &str = "uploaded";
    /// The server is transcribing. No progress endpoint exists, so this one is
    /// necessarily indeterminate — say so rather than fake a bar.
    pub const TRANSCRIBING: &str = "transcribing";
    /// Transcript stored; local bookkeeping (provisional lines, recording row).
    pub const FINALIZING: &str = "finalizing";
    pub const DONE: &str = "done";
    /// The user cancelled the upload. Not an error.
    pub const CANCELLED: &str = "cancelled";
    /// Stopped after the in-flight chunk; the server keeps the offset, so this is
    /// resumable. Only the file-picker path offers pausing.
    pub const PAUSED: &str = "paused";
    pub const FAILED: &str = "failed";
}

/// Emit one pipeline stage. Best-effort: a dropped status event must never fail
/// the transcription it is merely narrating.
pub fn emit_stage(
    app: &tauri::AppHandle,
    stage: &'static str,
    recording_id: Option<&str>,
    file_name: &str,
    upload_id: Option<String>,
    file_id: Option<String>,
    message: Option<String>,
) {
    let _ = app.emit(
        "transcribe-stage",
        TranscribeStage {
            stage,
            upload_id,
            recording_id: recording_id.map(String::from),
            file_name: file_name.to_string(),
            file_id,
            message,
        },
    );
}

/// A stored, still-resumable upload, for the "resume after restart" UI.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumableUpload {
    pub upload_id: String,
    pub local_path: String,
    pub file_name: String,
    pub total_size: u64,
    pub created_at: i64,
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/// Deterministic upload id for a path, so a resume after restart addresses the
/// same upload the UI was watching before. (Wall-clock/randomness would break
/// exactly the case this exists for.)
fn upload_id_for(local_path: &str) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(local_path.as_bytes());
    format!("up_{}", hex16(&digest))
}

/// First 8 bytes of a digest as lowercase hex — plenty to key a local map.
fn hex16(bytes: &[u8]) -> String {
    bytes.iter().take(8).map(|b| format!("{b:02x}")).collect()
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// The remembered upload URL for a path, if there is a live one for the current
/// user and this file.
///
/// A row is dropped rather than returned when it can't apply:
/// - past the server's 24 h expiry, or created by a different account — both
///   would only earn a `410`/`403` on the next request;
/// - recorded against a different file length. The path is the key, so a file
///   replaced at the same path would otherwise resume mid-way into unrelated
///   bytes and silently produce a corrupt upload. `expected_size` is `None` when
///   the caller only wants teardown (cancel) and doesn't care.
async fn stored_url(
    app: &tauri::AppHandle,
    local_path: &str,
    expected_size: Option<u64>,
) -> Result<Option<String>> {
    let pool = pool(app).await?;
    let row = sqlx::query(
        "SELECT upload_url, total_size, created_at, user_id FROM tus_uploads WHERE local_path = $1",
    )
    .bind(local_path)
    .fetch_optional(&pool)
    .await?;

    let Some(row) = row else { return Ok(None) };
    let created_at: i64 = row.get("created_at");
    let stored_user: Option<String> = row.get("user_id");
    let stored_size = row.get::<i64, _>("total_size") as u64;
    let current_user = current_user_id(app).await;

    let expired = now_secs() - created_at > UPLOAD_TTL_SECS;
    let other_user = stored_user.is_some() && current_user.is_some() && stored_user != current_user;
    let other_file = expected_size.is_some_and(|size| size != stored_size);
    if expired || other_user || other_file {
        forget(app, local_path).await?;
        return Ok(None);
    }
    Ok(Some(row.get("upload_url")))
}

/// The signed-in user's id, used to spot rows left behind by another account.
async fn current_user_id(app: &tauri::AppHandle) -> Option<String> {
    let pool = pool(app).await.ok()?;
    let row = sqlx::query("SELECT user_id FROM cloud_session WHERE id = 1")
        .fetch_optional(&pool)
        .await
        .ok()??;
    row.get::<Option<String>, _>("user_id")
}

async fn remember(
    app: &tauri::AppHandle,
    local_path: &str,
    upload_url: &str,
    total_size: u64,
    file_name: &str,
    content_type: &str,
) -> Result<()> {
    let pool = pool(app).await?;
    sqlx::query(
        "INSERT INTO tus_uploads
             (local_path, upload_url, total_size, file_name, content_type, user_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT(local_path) DO UPDATE SET
             upload_url   = excluded.upload_url,
             total_size   = excluded.total_size,
             file_name    = excluded.file_name,
             content_type = excluded.content_type,
             user_id      = excluded.user_id,
             created_at   = excluded.created_at",
    )
    .bind(local_path)
    .bind(upload_url)
    .bind(total_size as i64)
    .bind(file_name)
    .bind(content_type)
    .bind(current_user_id(app).await)
    .bind(now_secs())
    .execute(&pool)
    .await?;
    Ok(())
}

/// Drop the stored state for a path (finished, cancelled, or server-side gone).
async fn forget(app: &tauri::AppHandle, local_path: &str) -> Result<()> {
    let pool = pool(app).await?;
    sqlx::query("DELETE FROM tus_uploads WHERE local_path = $1")
        .bind(local_path)
        .execute(&pool)
        .await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// The driver
// ---------------------------------------------------------------------------

/// Where a run should pick up, and whether that counts as a resume.
struct Start {
    upload_url: String,
    offset: u64,
    resumed: bool,
}

/// Establish the upload: reuse the stored one when the server still has it,
/// otherwise create a fresh one.
///
/// The server's `HEAD` answer is authoritative. Whatever we think the offset is
/// locally is irrelevant — it can only be stale.
async fn establish(
    app: &tauri::AppHandle,
    local_path: &str,
    file_name: &str,
    content_type: &str,
    total: u64,
) -> Result<Start> {
    if let Some(url) = stored_url(app, local_path, Some(total)).await? {
        match tus::head(app, &url).await {
            Ok((offset, _)) => {
                return Ok(Start {
                    upload_url: url,
                    offset,
                    resumed: offset > 0,
                })
            }
            // The upload is gone as far as the server is concerned. Drop the row
            // and fall through to creating a new one.
            Err(TusError::NotFound) | Err(TusError::Gone) | Err(TusError::Forbidden) => {
                forget(app, local_path).await?;
            }
            // A refreshable token failure or a flaky link shouldn't force a
            // 2 GB do-over — retry the HEAD once after refreshing.
            Err(TusError::Unauthorized) => {
                client::refresh(app).await?;
                if let Ok((offset, _)) = tus::head(app, &url).await {
                    return Ok(Start {
                        upload_url: url,
                        offset,
                        resumed: offset > 0,
                    });
                }
                forget(app, local_path).await?;
            }
            Err(e) => return Err(e.into()),
        }
    }

    let url = tus::create(app, file_name, content_type, total).await?;
    remember(app, local_path, &url, total, file_name, content_type).await?;
    Ok(Start {
        upload_url: url,
        offset: 0,
        resumed: false,
    })
}

/// Throttles progress events to ~4/sec and derives speed/ETA from the interval.
struct Progress {
    upload_id: String,
    total: u64,
    last_emit: Instant,
    last_bytes: u64,
    rate: f64,
}

impl Progress {
    fn new(upload_id: &str, total: u64, sent: u64) -> Self {
        Self {
            upload_id: upload_id.to_string(),
            total,
            last_emit: Instant::now(),
            last_bytes: sent,
            rate: 0.0,
        }
    }

    /// Emit unless we emitted very recently. `force` bypasses the throttle — used
    /// for the first, resumed, and final events, which must always be delivered.
    fn emit(&mut self, app: &tauri::AppHandle, sent: u64, resumed: bool, force: bool) {
        let elapsed = self.last_emit.elapsed();
        if !force && elapsed < PROGRESS_INTERVAL {
            return;
        }
        // Smooth the instantaneous rate a little so the ETA doesn't jitter with
        // every chunk. Chunk-boundary sampling is coarse by nature.
        let secs = elapsed.as_secs_f64();
        if secs > 0.0 && sent > self.last_bytes {
            let instant = (sent - self.last_bytes) as f64 / secs;
            self.rate = if self.rate == 0.0 {
                instant
            } else {
                self.rate * 0.7 + instant * 0.3
            };
        }
        let remaining = self.total.saturating_sub(sent) as f64;
        let eta = if self.rate > 0.0 { remaining / self.rate } else { 0.0 };

        let _ = app.emit(
            "upload-progress",
            UploadProgress {
                upload_id: self.upload_id.clone(),
                bytes_sent: sent,
                total_bytes: self.total,
                bytes_per_second: self.rate,
                eta_seconds: eta,
                resumed,
            },
        );
        self.last_emit = Instant::now();
        self.last_bytes = sent;
    }
}

/// Guess a content type from the extension. The server has the file's real bytes
/// and dedups by hash, so this only needs to be reasonable, not authoritative.
fn content_type_for(file_name: &str) -> &'static str {
    match file_name.rsplit('.').next().map(str::to_ascii_lowercase).as_deref() {
        Some("wav") => "audio/wav",
        Some("mp3") => "audio/mpeg",
        Some("m4a") | Some("mp4") => "audio/mp4",
        Some("aac") => "audio/aac",
        Some("ogg") | Some("oga") => "audio/ogg",
        Some("flac") => "audio/flac",
        Some("webm") => "audio/webm",
        _ => "application/octet-stream",
    }
}

/// Sleep without pulling in a runtime timer dependency directly.
async fn backoff(attempt: u32) {
    let delay = BACKOFF_BASE * 2u32.pow(attempt);
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(delay)).await;
}

/// Upload `local_path` to the backend over tus, resuming if there's anything to
/// resume, and return how the run ended.
///
/// This is the single code path for every upload in the app — both the
/// file-picker command and the recording→transcribe flow go through it.
///
/// If the server reports the upload gone mid-transfer (410/404/403), the stored
/// state is discarded and one — and only one — fresh attempt is made from zero.
pub async fn upload_path(
    app: &tauri::AppHandle,
    local_path: &str,
    control: Arc<Control>,
) -> Result<UploadOutcome> {
    match run_once(app, local_path, control.clone()).await {
        Err(Error::UploadRestartNeeded) => run_once(app, local_path, control).await,
        other => other,
    }
}

/// One full attempt: establish the upload, then stream chunks until it finishes,
/// pauses, or is cancelled.
async fn run_once(
    app: &tauri::AppHandle,
    local_path: &str,
    control: Arc<Control>,
) -> Result<UploadOutcome> {
    let upload_id = upload_id_for(local_path);
    let path = std::path::Path::new(local_path);
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("recording.wav")
        .to_string();
    let content_type = content_type_for(&file_name);

    // The size comes from the filesystem metadata — the file is never read to
    // measure it.
    let total = std::fs::metadata(path)?.len();
    if total == 0 {
        return Err(Error::Message(format!("{file_name} is empty.")));
    }

    // Check the server's ceiling before a single byte moves, so an oversized
    // file fails with a clear message instead of a 413 partway through.
    if let Ok(caps) = tus::options(app).await {
        if let Some(max) = caps.max_size {
            if total > max {
                return Err(Error::Message(format!(
                    "{file_name} is {} but the server accepts at most {}.",
                    human_size(total),
                    human_size(max)
                )));
            }
        }
    }

    let start = establish(app, local_path, &file_name, content_type, total).await?;
    let upload_url = start.upload_url;
    let mut offset = start.offset;

    let mut progress = Progress::new(&upload_id, total, offset);
    progress.emit(app, offset, start.resumed, true);

    let mut file = std::fs::File::open(path)?;
    // Allocated once and reused for every chunk, never grown. Each PATCH copies
    // its slice out of it (the request body is moved onto a blocking thread), so
    // the high-water mark for an upload of *any* size is two chunks — ~16 MB —
    // plus the open file handle. Nothing accumulates across iterations.
    let mut buf = vec![0u8; CHUNK];

    while offset < total {
        if control.cancel.load(Ordering::Relaxed) {
            let _ = tus::delete(app, &upload_url).await;
            forget(app, local_path).await?;
            let _ = app.emit("upload-cancelled", upload_id.clone());
            return Ok(UploadOutcome::Cancelled { upload_id });
        }
        if control.pause.load(Ordering::Relaxed) {
            // Every byte we sent is already durable server-side and the stored
            // row survives, so resuming is just running this function again.
            return Ok(UploadOutcome::Paused {
                upload_id,
                bytes_sent: offset,
                total_bytes: total,
            });
        }

        // Read exactly this chunk, from exactly this offset. `seek` every
        // iteration because a 409/transport recovery may have moved us.
        let len = std::cmp::min(CHUNK as u64, total - offset) as usize;
        file.seek(SeekFrom::Start(offset))?;
        file.read_exact(&mut buf[..len])?;

        let mut attempt = 0u32;
        loop {
            match tus::patch(app, &upload_url, offset, buf[..len].to_vec()).await {
                Ok(PatchOutcome::Continued(next)) => {
                    offset = next;
                    progress.emit(app, offset, false, false);
                    break;
                }
                Ok(PatchOutcome::Finished(file_record)) => {
                    forget(app, local_path).await?;
                    progress.emit(app, total, false, true);
                    let file_record = *file_record;
                    let _ = app.emit("upload-complete", file_record.clone());
                    return Ok(UploadOutcome::Completed {
                        upload_id,
                        file: file_record,
                    });
                }

                // The offset we sent was stale. Ask the server where it really
                // is and continue from there — restarting at 0 is precisely the
                // bug tus exists to prevent.
                Err(TusError::OffsetMismatch) => {
                    let (server_offset, _) = tus::head(app, &upload_url).await?;
                    // Only a *different* offset is progress. If the server insists
                    // on the one we just sent, re-sending would 409 again forever,
                    // so this counts against the attempt budget like any failure.
                    if server_offset != offset {
                        offset = server_offset;
                        break;
                    }
                    if attempt + 1 >= MAX_ATTEMPTS {
                        return Err(Error::Message(format!(
                            "Upload failed: the server rejected offset {offset} but reports no other position."
                        )));
                    }
                    attempt += 1;
                    backoff(attempt).await;
                }

                // A dropped connection mid-chunk is normal: the server may have
                // taken all, some, or none of it. Back off, ask where it got to,
                // and carry on from there.
                Err(TusError::Transport(msg)) => {
                    if attempt + 1 >= MAX_ATTEMPTS {
                        return Err(Error::Message(format!("Upload failed: {msg}")));
                    }
                    backoff(attempt).await;
                    attempt += 1;
                    // Same rule as above: re-enter the outer loop only when the
                    // offset actually moved, otherwise retry this chunk under the
                    // attempt budget rather than looping without bound.
                    if let Ok((server_offset, _)) = tus::head(app, &upload_url).await {
                        if server_offset != offset {
                            offset = server_offset;
                            break;
                        }
                    }
                    // Server took none of it (or is still unreachable) — retry.
                }

                // The token expired during a long transfer. Refresh and retry the
                // same chunk; the offset hasn't moved.
                Err(TusError::Unauthorized) => {
                    if attempt + 1 >= MAX_ATTEMPTS {
                        return Err(Error::Message(
                            "Session expired. Please sign in again.".into(),
                        ));
                    }
                    attempt += 1;
                    client::refresh(app).await?;
                }

                // The server no longer has this upload. Discard the stored state
                // and signal `upload_path` to make one fresh attempt from zero.
                Err(TusError::Gone | TusError::NotFound | TusError::Forbidden) => {
                    forget(app, local_path).await?;
                    return Err(Error::UploadRestartNeeded);
                }

                // Client bugs and hard limits: no amount of retrying helps.
                Err(e) => return Err(e.into()),
            }
        }
    }

    // The loop only exits without returning when `HEAD` already reported the
    // full length — every byte is on the server, so the finalizing `200` (and
    // with it the file id) went to whichever earlier run sent the last chunk.
    // There is no tus call that re-fetches it, so drop the stale row and let the
    // next attempt create a clean upload; the server's SHA-256 dedup means that
    // second pass returns the existing record rather than storing a duplicate.
    forget(app, local_path).await?;
    Err(Error::UploadRestartNeeded)
}

/// "1.9 GB" style size for user-facing messages.
fn human_size(bytes: u64) -> String {
    const UNITS: [&str; 4] = ["B", "KB", "MB", "GB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} {}", UNITS[0])
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}

/// The id an upload of `local_path` will run under. Handed to the UI up front so
/// it can follow that upload's `upload-progress` stream and cancel it.
pub fn upload_id_of(local_path: &str) -> String {
    upload_id_for(local_path)
}

/// Upload a file for the recording→transcribe pipeline.
///
/// Registers with the shared [`UploadState`] so `cancel_file_upload` reaches it:
/// a 2 GB upload started by mistake has to be stoppable without killing the app.
/// The outcome is returned rather than flattened to an error, because a
/// deliberate cancel is not a failure and must not surface as one.
pub async fn upload_for_transcribe(
    app: &tauri::AppHandle,
    local_path: &str,
) -> Result<UploadOutcome> {
    let upload_id = upload_id_of(local_path);
    let state = app.state::<UploadState>();
    let Some(control) = state.begin(&upload_id) else {
        return Err(Error::Message("That file is already uploading.".into()));
    };
    let result = upload_path(app, local_path, control).await;
    state.end(&upload_id);
    result
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Start (or resume) uploading the file at `local_path`.
///
/// Takes a **path**, never bytes: the frontend gets this straight from the
/// dialog plugin and must never read the file itself.
#[tauri::command]
pub async fn start_file_upload(
    app: tauri::AppHandle,
    state: State<'_, UploadState>,
    local_path: String,
) -> Result<UploadOutcome> {
    if load_session(&app).await?.is_none() {
        return Err(Error::Message("Sign in to upload to the cloud.".into()));
    }
    let upload_id = upload_id_for(&local_path);
    let Some(control) = state.begin(&upload_id) else {
        return Err(Error::Message(
            "That file is already uploading.".into(),
        ));
    };

    // Narrate on the same channel the recording→transcribe path uses, so both
    // entry points drive one shared status UI.
    let file_name = std::path::Path::new(&local_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("recording.wav")
        .to_string();
    let emit = |s: &'static str, msg: Option<String>| {
        emit_stage(&app, s, None, &file_name, Some(upload_id.clone()), None, msg);
    };
    emit(stage::UPLOADING, None);

    let result = upload_path(&app, &local_path, control).await;
    state.end(&upload_id);

    match &result {
        Ok(UploadOutcome::Completed { .. }) => emit(stage::UPLOADED, None),
        Ok(UploadOutcome::Paused { .. }) => emit(stage::PAUSED, None),
        Ok(UploadOutcome::Cancelled { .. }) => emit(stage::CANCELLED, None),
        Err(e) => emit(stage::FAILED, Some(e.to_string())),
    }
    result
}

/// Ask the running upload to stop after the chunk currently in flight.
#[tauri::command]
pub fn pause_file_upload(state: State<'_, UploadState>, upload_id: String) -> Result<()> {
    if let Some(control) = state.get(&upload_id) {
        control.pause.store(true, Ordering::Relaxed);
    }
    Ok(())
}

/// Resume a paused or restart-interrupted upload. Identical to
/// [`start_file_upload`] — the stored row plus a `HEAD` do all the work.
#[tauri::command]
pub async fn resume_file_upload(
    app: tauri::AppHandle,
    state: State<'_, UploadState>,
    local_path: String,
) -> Result<UploadOutcome> {
    start_file_upload(app, state, local_path).await
}

/// Abandon an upload: the driver issues `DELETE` and clears the stored state.
///
/// Also clears state for an upload that isn't currently running (e.g. one left
/// over from a previous launch), so the row can't linger.
#[tauri::command]
pub async fn cancel_file_upload(
    app: tauri::AppHandle,
    state: State<'_, UploadState>,
    upload_id: String,
    local_path: Option<String>,
) -> Result<()> {
    if let Some(control) = state.get(&upload_id) {
        control.cancel.store(true, Ordering::Relaxed);
        return Ok(());
    }
    // Not running: tear it down here instead.
    if let Some(path) = local_path {
        if let Some(url) = stored_url(&app, &path, None).await? {
            let _ = tus::delete(&app, &url).await;
        }
        forget(&app, &path).await?;
    }
    Ok(())
}

/// Transcribe a file that has already been uploaded, by its backend id.
///
/// This is the hand-off from [`start_file_upload`]: the id from the completed
/// upload goes straight into `/inference/transcribe/{meetingId}`. It is
/// long-running (minutes for a large recording), so the frontend should keep its
/// UI responsive and simply await this.
///
/// `file_id` is a `String` throughout — backend ids are 64-bit and must never be
/// parsed as numbers.
#[tauri::command]
pub async fn transcribe_uploaded_file(
    app: tauri::AppHandle,
    meeting_id: String,
    file_id: String,
    file_name: Option<String>,
) -> Result<()> {
    let name = file_name.unwrap_or_default();
    emit_stage(&app, stage::TRANSCRIBING, None, &name, None, Some(file_id.clone()), None);

    if let Err(e) = crate::cloud::transcription::transcribe(&app, &meeting_id, &file_id).await {
        emit_stage(&app, stage::FAILED, None, &name, None, None, Some(e.to_string()));
        return Err(e);
    }

    emit_stage(&app, stage::FINALIZING, None, &name, None, None, None);
    // A fresh transcript un-hides one the user had previously cleared, so the
    // new result actually shows. Best-effort: the transcript is already saved.
    let _ = crate::cloud::transcription::set_cleared(&app, &meeting_id, false).await;

    emit_stage(&app, stage::DONE, None, &name, None, Some(file_id), None);
    Ok(())
}

/// Uploads that can still be resumed, so the UI can offer to continue one after
/// the app was killed mid-transfer. Rows past the server's 24 h expiry are swept
/// rather than listed.
#[tauri::command]
pub async fn list_resumable_uploads(app: tauri::AppHandle) -> Result<Vec<ResumableUpload>> {
    let pool = pool(&app).await?;
    sqlx::query("DELETE FROM tus_uploads WHERE created_at < $1")
        .bind(now_secs() - UPLOAD_TTL_SECS)
        .execute(&pool)
        .await?;

    let rows = sqlx::query(
        "SELECT local_path, file_name, total_size, created_at
         FROM tus_uploads ORDER BY created_at DESC",
    )
    .fetch_all(&pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let local_path: String = r.get("local_path");
            ResumableUpload {
                upload_id: upload_id_for(&local_path),
                local_path,
                file_name: r.get("file_name"),
                total_size: r.get::<i64, _>("total_size") as u64,
                created_at: r.get("created_at"),
            }
        })
        .collect())
}
