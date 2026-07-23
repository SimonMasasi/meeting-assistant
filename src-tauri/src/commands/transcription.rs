//! Commands for the on-device live transcription / speaker-detection feature.
//!
//! The capture pipeline itself is driven from [`crate::commands::microphone`]
//! (it tees audio off the recording thread). These commands cover everything
//! around it: making sure the ONNX models are downloaded, reading back a saved
//! transcript, and renaming the anonymous "Speaker N" clusters.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use sqlx::{Pool, Row, Sqlite};
use tauri::{Emitter, State};

use crate::cloud::{self, AppMode};
use crate::commands::microphone::RecordingState;
use crate::commands::tus_upload::{self, emit_stage, stage, UploadOutcome};
use crate::commands::recordings::{parse_stamp, wav_duration_secs};
use crate::db::pool;
use crate::diarize::models::{self, ModelPaths};
use crate::diarize::pipeline::{self, TranscriptSegment};
use crate::diarize::transcriber::TranscribeBackend;
use crate::error::{Error, Result};
use crate::settings::{TRANSCRIPTION_LANGUAGE_KEY, TRANSCRIPTION_MODEL_SIZE_KEY};

/// Default transcription language (multilingual Whisper falls back to English).
pub const DEFAULT_LANGUAGE: &str = "en";

/// User-chosen on-device transcription options: the Whisper model size and the
/// spoken language. Persisted as key/value rows in the `settings` table.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionSettings {
    /// "tiny" | "base" | "small" (see [`crate::diarize::models::WHISPER_SIZES`]).
    pub model_size: String,
    /// Language code, e.g. "en", "es", "fr".
    pub language: String,
}

/// Read one `settings` scalar, or a default when unset/blank.
async fn read_setting(pool: &Pool<Sqlite>, key: &str, default: &str) -> Result<String> {
    let row = sqlx::query("SELECT value FROM settings WHERE key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await?;
    let value = row.map(|r| r.get::<String, _>("value")).unwrap_or_default();
    Ok(if value.trim().is_empty() {
        default.to_string()
    } else {
        value
    })
}

/// Load the saved transcription settings, applying defaults (tiny / English) and
/// normalizing the size to a supported value. Shared by the commands below and by
/// the recorder when it spawns the pipeline.
pub async fn fetch_transcription_settings(pool: &Pool<Sqlite>) -> Result<TranscriptionSettings> {
    let model_size = read_setting(pool, TRANSCRIPTION_MODEL_SIZE_KEY, "tiny").await?;
    let language = read_setting(pool, TRANSCRIPTION_LANGUAGE_KEY, DEFAULT_LANGUAGE).await?;
    Ok(TranscriptionSettings {
        model_size: models::normalize_size(&model_size).to_string(),
        language,
    })
}

/// Return the saved transcription settings (model size + language).
#[tauri::command]
pub async fn get_transcription_settings(app: tauri::AppHandle) -> Result<TranscriptionSettings> {
    let pool = pool(&app).await?;
    fetch_transcription_settings(&pool).await
}

/// Persist the transcription settings. The size is normalized to a supported
/// value and a blank language falls back to English.
#[tauri::command]
pub async fn set_transcription_settings(
    app: tauri::AppHandle,
    settings: TranscriptionSettings,
) -> Result<()> {
    let pool = pool(&app).await?;
    let size = models::normalize_size(&settings.model_size);
    let language = if settings.language.trim().is_empty() {
        DEFAULT_LANGUAGE.to_string()
    } else {
        settings.language.trim().to_string()
    };
    for (key, value) in [
        (TRANSCRIPTION_MODEL_SIZE_KEY, size),
        (TRANSCRIPTION_LANGUAGE_KEY, language.as_str()),
    ] {
        sqlx::query(
            "INSERT INTO settings (key, value) VALUES ($1, $2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .bind(key)
        .bind(value)
        .execute(&pool)
        .await?;
    }
    Ok(())
}

/// Which speech models are on disk. `ready` is the mode-aware answer to "can
/// transcription start without a download?" — cloud mode needs only the VAD +
/// speaker-embedding models, since the backend does the speech-to-text. The
/// individual flags let the UI say *what* a first run would download.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelsReady {
    pub diarize: bool,
    pub whisper: bool,
    pub ready: bool,
}

/// Whether the transcription models for the chosen size are already downloaded, so
/// the UI can decide between offering "enable" directly or prompting a first-run
/// download.
#[tauri::command]
pub async fn transcription_models_ready(app: tauri::AppHandle) -> Result<ModelsReady> {
    let pool = pool(&app).await?;
    let settings = fetch_transcription_settings(&pool).await?;
    let paths = models::resolve(&app, &settings.model_size)?;
    let (diarize, whisper) = (paths.diarize_present(), paths.whisper_present());
    let ready = match cloud::current_mode(&app).await? {
        AppMode::Cloud => diarize,
        AppMode::Local => diarize && whisper,
    };
    Ok(ModelsReady {
        diarize,
        whisper,
        ready,
    })
}

/// Download any missing models the current mode needs, emitting
/// `transcription-progress` events. Runs on the blocking pool since it does
/// network + disk I/O. Idempotent.
#[tauri::command]
pub async fn ensure_transcription_models(app: tauri::AppHandle) -> Result<()> {
    let pool = pool(&app).await?;
    let size = fetch_transcription_settings(&pool).await?.model_size;
    // Cloud mode transcribes on the backend, so it skips the (much larger) Whisper
    // bundle and fetches only the on-device VAD + speaker-embedding models.
    let cloud_mode = cloud::current_mode(&app).await? == AppMode::Cloud;
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if cloud_mode {
            models::ensure_diarize(&handle)
        } else {
            models::ensure(&handle, &size)
        }
    })
    .await
    .map_err(|e| Error::Transcription(format!("model download task failed: {e}")))?
    .map(|_| ())
}

/// Load the persisted, speaker-labeled transcript for a meeting, ordered as
/// spoken. `speaker_name` is the user-assigned name, or `null` to fall back to
/// the raw `speaker_label` in the UI.
#[tauri::command]
pub async fn get_transcript(
    app: tauri::AppHandle,
    meeting_id: String,
) -> Result<Vec<TranscriptSegment>> {
    if cloud::current_mode(&app).await? == AppMode::Cloud {
        return cloud::transcription::get_transcript(&app, &meeting_id).await;
    }
    let pool = pool(&app).await?;
    let rows = sqlx::query_as::<_, TranscriptSegment>(
        "SELECT id, speaker_label, speaker_name, start_ms, end_ms, text
         FROM transcripts
         WHERE meeting_id = $1
         ORDER BY seq",
    )
    .bind(&meeting_id)
    .fetch_all(&pool)
    .await?;
    Ok(rows)
}

/// Clear a meeting's transcript. In local mode this hard-deletes its lines and the
/// remembered speaker names. In cloud mode the backend transcript has no delete
/// endpoint, so local live lines are removed and the backend copy is hidden on
/// read-back (see `cloud::transcription::clear_transcript`); re-transcribing a
/// recording brings it back.
#[tauri::command]
pub async fn clear_transcript(app: tauri::AppHandle, meeting_id: String) -> Result<()> {
    if cloud::current_mode(&app).await? == AppMode::Cloud {
        return cloud::transcription::clear_transcript(&app, &meeting_id).await;
    }
    let pool = pool(&app).await?;
    sqlx::query("DELETE FROM transcripts WHERE meeting_id = $1")
        .bind(&meeting_id)
        .execute(&pool)
        .await?;
    sqlx::query("DELETE FROM meeting_speakers WHERE meeting_id = $1")
        .bind(&meeting_id)
        .execute(&pool)
        .await?;
    Ok(())
}

/// Assign a display name to a speaker cluster, applied to every line of that
/// label (and remembered for future lines via `meeting_speakers`).
#[tauri::command]
pub async fn rename_speaker(
    app: tauri::AppHandle,
    meeting_id: String,
    speaker_label: String,
    new_name: String,
) -> Result<()> {
    // Cloud transcripts come from the backend, which has no rename endpoint, so the
    // mapping is persisted in the meeting's `clientMeta` and applied on read-back.
    if cloud::current_mode(&app).await? == AppMode::Cloud {
        return cloud::transcription::rename_speaker(&app, &meeting_id, &speaker_label, &new_name)
            .await;
    }
    let pool = pool(&app).await?;
    sqlx::query(
        "UPDATE transcripts SET speaker_name = $1 WHERE meeting_id = $2 AND speaker_label = $3",
    )
    .bind(&new_name)
    .bind(&meeting_id)
    .bind(&speaker_label)
    .execute(&pool)
    .await?;
    sqlx::query(
        "INSERT INTO meeting_speakers (meeting_id, speaker_label, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT(meeting_id, speaker_label) DO UPDATE SET display_name = excluded.display_name",
    )
    .bind(&meeting_id)
    .bind(&speaker_label)
    .bind(&new_name)
    .execute(&pool)
    .await?;
    Ok(())
}

/// How the cloud pipeline ended, so the caller can emit the right closing stage.
enum CloudTranscribe {
    Done { file_id: String },
    /// The user cancelled the upload before it finished.
    Cancelled,
}

/// The cloud-mode body of [`transcribe_recording`]: upload the WAV (unless it is
/// already on the backend), transcribe it server-side, then reconcile local
/// bookkeeping. Split out from the command so its many `?`s share a single
/// `failed` stage emission at the call site.
///
/// Emits `uploading` / `uploaded` / `transcribing` / `finalizing` as it goes.
#[allow(clippy::too_many_arguments)]
async fn cloud_transcribe(
    app: &tauri::AppHandle,
    pool: &Pool<Sqlite>,
    recording_id: &str,
    meeting_id: &str,
    path: &str,
    file_name: &str,
    existing_file_id: Option<String>,
    existing_recording_id: Option<String>,
) -> Result<CloudTranscribe> {
    // Upload once; reuse the backend file id on re-transcribe. When it's already
    // cached there is no transfer at all, so no `uploading` stage is emitted and
    // the UI goes straight to `transcribing` rather than showing a stuck 0% bar.
    let file_id = match existing_file_id.filter(|s| !s.is_empty()) {
        Some(id) => id,
        None => {
            // Announce the upload id up front so the UI can follow this upload's
            // `upload-progress` stream and cancel it.
            emit_stage(
                app,
                stage::UPLOADING,
                Some(recording_id),
                file_name,
                Some(tus_upload::upload_id_of(path)),
                None,
                None,
            );
            match cloud::transcription::upload(app, path).await? {
                UploadOutcome::Completed { file, .. } => {
                    emit_stage(
                        app,
                        stage::UPLOADED,
                        Some(recording_id),
                        file_name,
                        None,
                        Some(file.id.clone()),
                        None,
                    );
                    file.id
                }
                UploadOutcome::Cancelled { .. } => return Ok(CloudTranscribe::Cancelled),
                // Nothing drives the pause flag on this path, but treat it the
                // same as a cancel rather than pretending the upload finished.
                UploadOutcome::Paused { .. } => return Ok(CloudTranscribe::Cancelled),
            }
        }
    };

    // Transcribe first. Some backends create the MeetingRecording row as part of
    // transcription; others don't. We reconcile afterwards so exactly one row
    // exists either way (never a duplicate).
    emit_stage(app, stage::TRANSCRIBING, Some(recording_id), file_name, None, None, None);
    cloud::transcription::transcribe(app, meeting_id, &file_id).await?;

    emit_stage(app, stage::FINALIZING, Some(recording_id), file_name, None, None, None);

    // The backend transcript is now authoritative for this recording, so drop
    // the provisional lines live transcription wrote locally. Only after a
    // successful transcribe: on failure they're the only transcript there is.
    sqlx::query("DELETE FROM transcripts WHERE recording_id = $1 AND provisional = 1")
        .bind(recording_id)
        .execute(pool)
        .await?;

    // Producing a fresh transcript un-hides one the user had cleared, so the new
    // result actually shows. Best-effort — the transcript is already saved.
    let _ = cloud::transcription::set_cleared(app, meeting_id, false).await;

    // Register the recording once (best-effort — the transcript is already
    // saved, so bookkeeping must not fail the command).
    let cloud_recording_id = match existing_recording_id.filter(|s| !s.is_empty()) {
        Some(id) => Some(id),
        None => register_cloud_recording(app, meeting_id, &file_id, file_name, path).await,
    };

    // Cache the ids so a re-transcribe skips the re-upload/re-register. The
    // recording id is only overwritten when we actually have one (COALESCE).
    sqlx::query(
        "UPDATE recordings
         SET cloud_file_id = $1,
             cloud_recording_id = COALESCE($2, cloud_recording_id)
         WHERE id = $3",
    )
    .bind(&file_id)
    .bind(&cloud_recording_id)
    .bind(recording_id)
    .execute(pool)
    .await?;

    Ok(CloudTranscribe::Done { file_id })
}

/// Ensure a cloud `MeetingRecording` exists for a just-transcribed file and return
/// its id. Best-effort: any backend error yields `None` (the transcript is already
/// saved, so recording bookkeeping must not fail the transcribe command). Adopts a
/// row transcription may have created for this file; otherwise registers one with
/// the capture's start/end times (epoch-seconds from the filename stamp + length).
async fn register_cloud_recording(
    app: &tauri::AppHandle,
    meeting_id: &str,
    file_id: &str,
    file_name: &str,
    path: &str,
) -> Option<String> {
    if let Ok(recs) = cloud::transcription::list_recordings(app, meeting_id).await {
        if let Some(r) = recs
            .into_iter()
            .find(|r| r.file.as_ref().map(|f| f.id.as_str()) == Some(file_id))
        {
            return Some(r.id);
        }
    }
    let start = parse_stamp(file_name).unwrap_or(0);
    let dur = wav_duration_secs(path).unwrap_or(0.0).round() as u64;
    match cloud::transcription::add_recording(
        app,
        meeting_id,
        file_id,
        &start.to_string(),
        &(start + dur).to_string(),
    )
    .await
    {
        Ok(id) => Some(id),
        Err(e) => {
            eprintln!("cloud recording registration failed (transcript still saved): {e}");
            None
        }
    }
}

/// (Re)transcribe an already-saved recording on demand. Any prior transcript for
/// *this* recording is removed first, then the file is run through the same
/// on-device pipeline the live recorder uses, appending fresh speaker-labeled
/// lines for the meeting.
///
/// Refuses while a live capture is in progress, and requires the speech models to
/// already be present (the frontend downloads them first). The work itself is
/// detached onto a worker thread — like the live pipeline — and reports progress
/// through the usual `transcript-line` / `transcription-status` events; this
/// command returns once the prior lines are cleared and the worker is launched.
#[tauri::command]
pub async fn transcribe_recording(
    app: tauri::AppHandle,
    state: State<'_, RecordingState>,
    recording_id: String,
) -> Result<()> {
    if state.is_active() {
        return Err(Error::Message(
            "Stop the current recording before transcribing".to_string(),
        ));
    }

    let pool = pool(&app).await?;

    // Resolve the file from the DB rather than trusting a frontend-supplied path.
    let row = sqlx::query(
        "SELECT meeting_id, file_name, path, cloud_file_id, cloud_recording_id
         FROM recordings WHERE id = $1",
    )
    .bind(&recording_id)
    .fetch_optional(&pool)
    .await?
    .ok_or_else(|| Error::Message("Recording not found".to_string()))?;
    let meeting_id: String = row.get("meeting_id");
    let path: String = row.get("path");

    // Cloud mode: upload the locally-captured WAV, transcribe server-side, then
    // make sure the recording is registered exactly once. The transcript is read
    // back via `get_transcript`. Blocks until the backend finishes (synchronous),
    // so the frontend can refetch on completion. The upload/recording ids are
    // cached on the row so a re-transcribe reuses them instead of duplicating.
    if cloud::current_mode(&app).await? == AppMode::Cloud {
        let file_name: String = row.get("file_name");
        let existing_file_id: Option<String> = row.get("cloud_file_id");
        let existing_recording_id: Option<String> = row.get("cloud_recording_id");

        // Narrate the pipeline. Upload-then-transcribe is minutes of silence from
        // the outside, so the terminal stage is emitted here in one place and the
        // per-step ones inside the helper.
        emit_stage(&app, stage::PREPARING, Some(&recording_id), &file_name, None, None, None);

        let outcome = cloud_transcribe(
            &app,
            &pool,
            &recording_id,
            &meeting_id,
            &path,
            &file_name,
            existing_file_id,
            existing_recording_id,
        )
        .await;

        match &outcome {
            Ok(CloudTranscribe::Done { file_id }) => emit_stage(
                &app,
                stage::DONE,
                Some(&recording_id),
                &file_name,
                None,
                Some(file_id.clone()),
                None,
            ),
            // The user stopped the upload on purpose. Not a failure; the command
            // returns Ok so the frontend shows no error.
            Ok(CloudTranscribe::Cancelled) => emit_stage(
                &app,
                stage::CANCELLED,
                Some(&recording_id),
                &file_name,
                None,
                None,
                None,
            ),
            Err(e) => emit_stage(
                &app,
                stage::FAILED,
                Some(&recording_id),
                &file_name,
                None,
                None,
                Some(e.to_string()),
            ),
        }

        outcome?;
        return Ok(());
    }

    // The models must already be downloaded; the frontend ensures this first.
    let settings = fetch_transcription_settings(&pool).await?;
    let models = models::resolve(&app, &settings.model_size)?;
    if !models.all_present() {
        return Err(Error::Transcription(
            "Speech models are not downloaded yet".to_string(),
        ));
    }

    // "Remove previous transcription" — scoped to just this recording's lines, so
    // re-transcribing replaces its output without touching other recordings.
    sqlx::query("DELETE FROM transcripts WHERE recording_id = $1")
        .bind(&recording_id)
        .execute(&pool)
        .await?;

    // Detach the work, mirroring the live pipeline (which also runs unjoined).
    // Failures opening/reading the file surface via `transcription-error`, the
    // same channel the pipeline uses for its own inference errors.
    let language = settings.language;
    let app_bg = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = transcribe_file(&app_bg, &meeting_id, &recording_id, &path, models, &language)
        {
            eprintln!("transcribe_recording error: {e}");
            let _ = app_bg.emit("transcription-error", e.to_string());
        }
    });
    Ok(())
}

/// Transcribe one saved WAV through the speech pipeline. The file is read at its
/// native rate/channels and streamed to a [`pipeline::run`] worker over a channel
/// — the same interface the live recorder feeds — so the pipeline performs the
/// downmix, resampling, diarization, transcription, persistence, and event
/// emission. Blocking (sherpa models + file IO); runs on its own thread.
fn transcribe_file(
    app: &tauri::AppHandle,
    meeting_id: &str,
    recording_id: &str,
    path: &str,
    models: ModelPaths,
    language: &str,
) -> Result<()> {
    let mut reader = hound::WavReader::open(path)?;
    let spec = reader.spec();
    if spec.bits_per_sample != 16 || spec.sample_format != hound::SampleFormat::Int {
        return Err(Error::Transcription(format!(
            "{path} is not 16-bit PCM, so it can't be transcribed"
        )));
    }
    let input_rate = spec.sample_rate;
    let channels = spec.channels.max(1);

    // Drives the pipeline's backlog clock: bumped by the mono-frame count at the
    // input rate as audio is handed over (see `received_ms` in pipeline::run).
    let captured = Arc::new(AtomicU64::new(0));
    let (tx, rx) = mpsc::channel::<Vec<f32>>();

    // The worker owns the (non-`Send`) sherpa models on its own thread, exactly as
    // the live recorder spawns it.
    let pipeline = {
        let app = app.clone();
        let meeting_id = meeting_id.to_string();
        let recording_id = recording_id.to_string();
        let language = language.to_string();
        let captured = captured.clone();
        std::thread::spawn(move || {
            pipeline::run(
                app,
                meeting_id,
                Some(recording_id),
                input_rate,
                channels,
                models,
                language,
                // Only reached in local mode — the cloud branch of
                // `transcribe_recording` returns before this path.
                TranscribeBackend::Local,
                rx,
                captured,
            );
        })
    };

    // Stream the file into the worker in interleaved chunks so memory stays bounded
    // and the pipeline drains concurrently. Samples are normalized to f32 [-1, 1],
    // matching the live tee.
    const CHUNK_FRAMES: usize = 16_384;
    let frame = channels as usize;
    let chunk_samples = CHUNK_FRAMES * frame;
    let mut buf: Vec<f32> = Vec::with_capacity(chunk_samples);
    for sample in reader.samples::<i16>() {
        buf.push(sample? as f32 / 32768.0);
        if buf.len() >= chunk_samples {
            captured.fetch_add((buf.len() / frame) as u64, Ordering::Relaxed);
            if tx.send(std::mem::take(&mut buf)).is_err() {
                break; // worker gone; stop feeding
            }
            buf = Vec::with_capacity(chunk_samples);
        }
    }
    if !buf.is_empty() {
        captured.fetch_add((buf.len() / frame) as u64, Ordering::Relaxed);
        let _ = tx.send(buf);
    }

    // Closing the channel tells the worker to flush its final utterance and exit.
    drop(tx);
    let _ = pipeline.join();
    Ok(())
}
