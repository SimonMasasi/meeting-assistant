//! Commands for the on-device live transcription / speaker-detection feature.
//!
//! The capture pipeline itself is driven from [`crate::commands::microphone`]
//! (it tees audio off the recording thread). These commands cover everything
//! around it: making sure the ONNX models are downloaded, reading back a saved
//! transcript, and renaming the anonymous "Speaker N" clusters.

use serde::{Deserialize, Serialize};
use sqlx::{Pool, Row, Sqlite};

use crate::db::pool;
use crate::diarize::models;
use crate::diarize::pipeline::TranscriptSegment;
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

/// Whether all transcription models for the chosen size are already downloaded,
/// so the UI can decide between offering "enable" directly or prompting a
/// first-run download.
#[tauri::command]
pub async fn transcription_models_ready(app: tauri::AppHandle) -> Result<bool> {
    let pool = pool(&app).await?;
    let settings = fetch_transcription_settings(&pool).await?;
    Ok(models::resolve(&app, &settings.model_size)?.all_present())
}

/// Download any missing models for the chosen size, emitting
/// `transcription-progress` events. Runs on the blocking pool since it does
/// network + disk I/O. Idempotent.
#[tauri::command]
pub async fn ensure_transcription_models(app: tauri::AppHandle) -> Result<()> {
    let pool = pool(&app).await?;
    let size = fetch_transcription_settings(&pool).await?.model_size;
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || models::ensure(&handle, &size))
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

/// Assign a display name to a speaker cluster, applied to every line of that
/// label (and remembered for future lines via `meeting_speakers`).
#[tauri::command]
pub async fn rename_speaker(
    app: tauri::AppHandle,
    meeting_id: String,
    speaker_label: String,
    new_name: String,
) -> Result<()> {
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
