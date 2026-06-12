//! Commands for the on-device live transcription / speaker-detection feature.
//!
//! The capture pipeline itself is driven from [`crate::commands::microphone`]
//! (it tees audio off the recording thread). These commands cover everything
//! around it: making sure the ONNX models are downloaded, reading back a saved
//! transcript, and renaming the anonymous "Speaker N" clusters.

use crate::db::pool;
use crate::diarize::models;
use crate::diarize::pipeline::TranscriptSegment;
use crate::error::{Error, Result};

/// Whether all transcription models are already downloaded, so the UI can decide
/// between offering "enable" directly or prompting a first-run download.
#[tauri::command]
pub async fn transcription_models_ready(app: tauri::AppHandle) -> Result<bool> {
    Ok(models::resolve(&app)?.all_present())
}

/// Download any missing models, emitting `transcription-progress` events. Runs on
/// the blocking pool since it does network + disk I/O. Idempotent.
#[tauri::command]
pub async fn ensure_transcription_models(app: tauri::AppHandle) -> Result<()> {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || models::ensure(&handle))
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
