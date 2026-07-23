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
use crate::commands::tus_upload::UploadOutcome;
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

/// Upload a local WAV to the backend. Called once per recording; the resulting
/// id is cached locally so re-transcribes skip the re-upload.
///
/// Goes over the resumable tus protocol, streaming the file 8 MB at a time from
/// disk. A long meeting can produce a multi-gigabyte WAV, so it is never read
/// into memory — and a transfer interrupted by a dropped connection or an app
/// restart picks up from the server's offset instead of starting over. See
/// [`crate::commands::tus_upload`].
///
/// Returns the [`UploadOutcome`] rather than just the id so the caller can tell
/// a user-initiated cancel apart from a failure.
pub async fn upload(app: &tauri::AppHandle, file_path: &str) -> Result<UploadOutcome> {
    crate::commands::tus_upload::upload_for_transcribe(app, file_path).await
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

/// How long to wait on `/inference/transcribe`. The backend transcribes and
/// diarizes synchronously, which takes minutes for a large file — well past the
/// default request timeout.
const TRANSCRIBE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60 * 60);

/// Run cloud transcription for an already-uploaded file. The transcript is
/// persisted server-side and then read back via [`get_transcript`].
pub async fn transcribe(app: &tauri::AppHandle, meeting_id: &str, file_id: &str) -> Result<()> {
    // `file_id` stays a string end to end: backend ids are 64-bit and would lose
    // precision if they were ever round-tripped through a JS number.
    let body = json!({ "fileId": file_id });
    client::authed_request_with_timeout(
        app,
        "POST",
        &format!("/inference/transcribe/{meeting_id}"),
        Some(body),
        TRANSCRIBE_TIMEOUT,
    )
    .await?;
    Ok(())
}

/// The cloud transcript for a meeting, mapped to the desktop segment shape:
/// the backend's stored lines, followed by any provisional lines live
/// transcription wrote locally for recordings not yet batch-transcribed.
///
/// The union matters because the backend transcribes one recording at a time: a
/// meeting can have recording 1 batch-transcribed while recording 2 is still live,
/// and an either/or switch would drop recording 2's lines the moment recording 1's
/// backend transcript appeared. Concatenating is also the honest order — `start_ms`
/// is relative to its own recording in both sources, so a global time sort would
/// interleave them wrongly.
///
/// User-assigned speaker names (persisted in the meeting's `clientMeta`) override
/// the backend's `speakerName` per line, keyed by `speakerLabel`, and apply to both
/// sources.
pub async fn get_transcript(
    app: &tauri::AppHandle,
    meeting_id: &str,
) -> Result<Vec<TranscriptSegment>> {
    // The rename map and the "cleared" marker both live on the meeting; a
    // missing/unknown meeting just means no overrides and not cleared.
    let meeting = meetings::get(app, meeting_id).await.ok().flatten();
    let cleared = meeting.as_ref().is_some_and(|m| m.transcript_cleared);
    let overrides = meeting.map(|m| m.speaker_names).unwrap_or_default();

    // When the user has cleared the transcript, the backend's stored copy stays
    // hidden (there's no delete endpoint) — skip the fetch entirely. Any local
    // provisional lines from a *new* recording still show, and re-transcribing
    // resets the marker.
    let backend = if cleared {
        serde_json::Value::Null
    } else {
        // A backend blip must not blank the panel — the provisional lines below may
        // be the only transcript the user has right now.
        client::authed_request(
            app,
            "GET",
            &format!("/inference/transcript/{meeting_id}"),
            None,
        )
        .await
        .unwrap_or_else(|e| {
            eprintln!("cloud get_transcript: falling back to local lines only: {e}");
            serde_json::Value::Null
        })
    };

    let dtos: Vec<SegmentDto> = serde_json::from_value(backend).unwrap_or_default();
    let mut segments: Vec<TranscriptSegment> = dtos
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
        .collect();

    // Ids here are already `{meeting_id}-{seq}`, so they can't collide with the
    // `seg-{i}` ids above. `speaker_name` is always NULL on these rows (cloud-mode
    // renames only ever touch `clientMeta`), so the overrides supply it.
    let pool = crate::db::pool(app).await?;
    let local = sqlx::query_as::<_, TranscriptSegment>(
        "SELECT id, speaker_label, speaker_name, start_ms, end_ms, text
         FROM transcripts WHERE meeting_id = $1 AND provisional = 1 ORDER BY seq",
    )
    .bind(meeting_id)
    .fetch_all(&pool)
    .await?;
    segments.extend(local.into_iter().map(|mut s| {
        s.speaker_name = overrides.get(&s.speaker_label).cloned().or(s.speaker_name);
        s
    }));

    Ok(segments)
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

/// Clear a meeting's transcript in cloud mode. Local live/provisional lines are
/// hard-deleted; the backend's stored transcript has no delete endpoint, so it is
/// instead marked hidden (see `transcript_cleared` in [`get_transcript`]).
/// Re-transcribing a recording resets the marker via [`set_cleared`].
pub async fn clear_transcript(app: &tauri::AppHandle, meeting_id: &str) -> Result<()> {
    let pool = crate::db::pool(app).await?;
    sqlx::query("DELETE FROM transcripts WHERE meeting_id = $1 AND provisional = 1")
        .bind(meeting_id)
        .execute(&pool)
        .await?;
    set_cleared(app, meeting_id, true).await
}

/// Set (or reset) the meeting's `transcript_cleared` marker, skipping the backend
/// round-trip when it's already at the desired value.
pub async fn set_cleared(app: &tauri::AppHandle, meeting_id: &str, cleared: bool) -> Result<()> {
    let mut meeting = meetings::get(app, meeting_id)
        .await?
        .ok_or_else(|| Error::Message("Meeting not found".into()))?;
    if meeting.transcript_cleared != cleared {
        meeting.transcript_cleared = cleared;
        meetings::update(app, &meeting).await?;
    }
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
