//! Cloud-mode transcription: upload a locally-captured WAV, register it as a
//! backend recording, have the backend transcribe + diarize it, then read the
//! stored transcript back.
//!
//! Recordings stay on-device (raw audio); the WAV is uploaded once per recording
//! and the resulting file/recording ids are remembered locally (see the
//! `recordings.cloud_file_id` / `cloud_recording_id` columns) so re-transcribing
//! reuses them instead of duplicating the upload or the backend recording.
//!
//! Speaker renames have no backend endpoint, so they are persisted in the
//! meeting's `clientMeta` blob (the `speaker_names` map) and applied over the
//! backend transcript here — see [`get_transcript`] and [`rename_speaker`].

use serde::Deserialize;
use serde_json::json;

use crate::cloud::{client, meetings};
use crate::diarize::pipeline::TranscriptSegment;
use crate::error::{Error, Result};

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

/// The `file` (backend `UploadedFile`) attached to a recording — we only need its id.
#[derive(Deserialize)]
pub struct UploadedFileRef {
    #[serde(default)]
    pub id: String,
}

/// The `speaker` (backend `MeetingSpeaker`) attached to a recording.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingSpeakerRef {
    #[serde(default)]
    pub speaker_name: Option<String>,
}

/// Backend `MeetingRecording`, trimmed to the fields the desktop uses (recording
/// bookkeeping + dashboard aggregation). `startTime`/`endTime` are stored as
/// strings; the desktop writes them as epoch-seconds (see [`add_recording`]).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingDto {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub start_time: Option<String>,
    #[serde(default)]
    pub end_time: Option<String>,
    #[serde(default)]
    pub file: Option<UploadedFileRef>,
    #[serde(default)]
    pub speaker: Option<MeetingSpeakerRef>,
}

/// Upload a local WAV to the backend and return the new file's id. Called once per
/// recording; the id is cached locally so re-transcribes skip the re-upload.
pub async fn upload(app: &tauri::AppHandle, file_path: &str) -> Result<String> {
    let bytes = std::fs::read(file_path)?;
    let filename = std::path::Path::new(file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("recording.wav")
        .to_string();
    client::upload_file(app, &filename, bytes).await
}

/// Register an uploaded file as a `MeetingRecording` on the backend and return the
/// new recording's id. `start_time`/`end_time` are opaque strings to the backend;
/// the desktop passes epoch-seconds. The response `data` is the meeting's full
/// recording list, so pick the row for our `file_id` (falling back to the first).
pub async fn add_recording(
    app: &tauri::AppHandle,
    meeting_id: &str,
    file_id: &str,
    start_time: &str,
    end_time: &str,
) -> Result<String> {
    let body = json!({
        "meetingId": meeting_id,
        "fileId": file_id,
        "startTime": start_time,
        "endTime": end_time,
    });
    let data = client::authed_request(app, "POST", "/meetings/add_meeting_recording", Some(body))
        .await?;
    let recordings: Vec<RecordingDto> = serde_json::from_value(data).unwrap_or_default();
    let picked = recordings
        .iter()
        .find(|r| r.file.as_ref().map(|f| f.id.as_str()) == Some(file_id))
        .or_else(|| recordings.first())
        .ok_or_else(|| Error::Message("add_meeting_recording returned no recording".into()))?;
    Ok(picked.id.clone())
}

/// Every backend recording for a meeting (used by the cloud dashboard).
pub async fn list_recordings(
    app: &tauri::AppHandle,
    meeting_id: &str,
) -> Result<Vec<RecordingDto>> {
    let path = format!(
        "/meetings/get_meeting_recordings?meetingId={meeting_id}&itemsPerPage=500&pageNumber=1"
    );
    let data = client::authed_request(app, "GET", &path, None).await?;
    Ok(serde_json::from_value(data).unwrap_or_default())
}

/// Run cloud transcription for an already-uploaded file. The transcript is
/// persisted server-side and then read back via [`get_transcript`].
pub async fn transcribe(app: &tauri::AppHandle, meeting_id: &str, file_id: &str) -> Result<()> {
    let body = json!({ "fileId": file_id });
    client::authed_request(
        app,
        "POST",
        &format!("/inference/transcribe/{meeting_id}"),
        Some(body),
    )
    .await?;
    Ok(())
}

/// The stored cloud transcript for a meeting, mapped to the desktop segment shape.
/// User-assigned speaker names (persisted in the meeting's `clientMeta`) override
/// the backend's `speakerName` per line, keyed by `speakerLabel`.
pub async fn get_transcript(
    app: &tauri::AppHandle,
    meeting_id: &str,
) -> Result<Vec<TranscriptSegment>> {
    // The rename map lives on the meeting; a missing/unknown meeting just means no
    // overrides (the backend's own speaker names are used as-is).
    let overrides = meetings::get(app, meeting_id)
        .await
        .ok()
        .flatten()
        .map(|m| m.speaker_names)
        .unwrap_or_default();

    let data =
        client::authed_request(app, "GET", &format!("/inference/transcript/{meeting_id}"), None)
            .await?;
    let dtos: Vec<SegmentDto> = serde_json::from_value(data).unwrap_or_default();
    Ok(dtos
        .into_iter()
        .enumerate()
        .map(|(i, s)| {
            let speaker_name = overrides
                .get(&s.speaker_label)
                .cloned()
                .or(s.speaker_name);
            TranscriptSegment {
                id: format!("seg-{i}"),
                speaker_label: s.speaker_label,
                speaker_name,
                start_ms: s.start_ms,
                end_ms: s.end_ms,
                text: s.text,
            }
        })
        .collect())
}

/// Persist a speaker rename in cloud mode. The backend has no rename endpoint, so
/// the mapping is stored in the meeting's `clientMeta` (via `update_meeting`) and
/// applied when the transcript is read back in [`get_transcript`].
pub async fn rename_speaker(
    app: &tauri::AppHandle,
    meeting_id: &str,
    speaker_label: &str,
    new_name: &str,
) -> Result<()> {
    let mut meeting = meetings::get(app, meeting_id)
        .await?
        .ok_or_else(|| Error::Message("Meeting not found".into()))?;
    meeting
        .speaker_names
        .insert(speaker_label.to_string(), new_name.to_string());
    meetings::update(app, &meeting).await?;
    Ok(())
}

/// Parse a recording's `startTime`/`endTime` string (epoch-seconds as written by
/// [`add_recording`]) to seconds. Tolerant of blanks and fractional values; used
/// by the cloud dashboard to derive durations.
pub(crate) fn parse_epoch_secs(s: &Option<String>) -> Option<i64> {
    s.as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .and_then(|v| v.parse::<f64>().ok())
        .map(|v| v as i64)
}
