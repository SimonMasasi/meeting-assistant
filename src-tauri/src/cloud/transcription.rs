//! Cloud-mode transcription: upload a locally-captured WAV and have the backend
//! transcribe + diarize it, then read the stored transcript back.
//!
//! Recordings stay on-device (raw audio); only transcription/summarization run in
//! the cloud, so the audio is uploaded per transcribe request.

use serde::Deserialize;

use crate::cloud::client;
use crate::diarize::pipeline::TranscriptSegment;
use crate::error::Result;

/// Backend `TranscriptSegmentDTO`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SegmentDto {
    speaker_label: String,
    #[serde(default)]
    speaker_name: Option<String>,
    start_ms: i64,
    end_ms: i64,
    text: String,
}

/// The stored cloud transcript for a meeting, mapped to the desktop segment shape.
pub async fn get_transcript(
    app: &tauri::AppHandle,
    meeting_id: &str,
) -> Result<Vec<TranscriptSegment>> {
    let data =
        client::authed_request(app, "GET", &format!("/inference/transcript/{meeting_id}"), None)
            .await?;
    let dtos: Vec<SegmentDto> = serde_json::from_value(data).unwrap_or_default();
    Ok(dtos
        .into_iter()
        .enumerate()
        .map(|(i, s)| TranscriptSegment {
            id: format!("seg-{i}"),
            speaker_label: s.speaker_label,
            speaker_name: s.speaker_name,
            start_ms: s.start_ms,
            end_ms: s.end_ms,
            text: s.text,
        })
        .collect())
}

/// Upload a local WAV and run cloud transcription for the meeting. The transcript
/// is persisted server-side and then read back via [`get_transcript`].
pub async fn transcribe(
    app: &tauri::AppHandle,
    meeting_id: &str,
    file_path: &str,
) -> Result<()> {
    let bytes = std::fs::read(file_path)?;
    let filename = std::path::Path::new(file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("recording.wav")
        .to_string();
    let file_id = client::upload_file(app, &filename, bytes).await?;

    let body = serde_json::json!({ "fileId": file_id });
    client::authed_request(
        app,
        "POST",
        &format!("/inference/transcribe/{meeting_id}"),
        Some(body),
    )
    .await?;
    Ok(())
}
