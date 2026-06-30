//! Cloud-mode summarization: ask the backend to summarize a meeting (it calls the
//! server-configured LLM), mapped to the desktop [`MeetingSummary`] shape.

use std::time::{SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use serde_json::Value;

use crate::cloud::client;
use crate::commands::summary::{ActionItem, MeetingSummary};
use crate::error::{Error, Result};

/// Backend `SummaryDTO`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SummaryDto {
    summary: String,
    #[serde(default)]
    key_points: Vec<String>,
    #[serde(default)]
    action_items: Vec<String>,
    #[serde(default)]
    model: String,
}

/// Generate (and return) a summary for a cloud meeting. The backend persists it,
/// so subsequent [`get`] calls return it without re-billing the LLM.
pub async fn generate(app: &tauri::AppHandle, meeting_id: &str) -> Result<MeetingSummary> {
    let data = client::authed_request(
        app,
        "POST",
        &format!("/inference/summarize/{meeting_id}"),
        Some(Value::Object(Default::default())),
    )
    .await?;
    let dto: SummaryDto = serde_json::from_value(data)
        .map_err(|e| Error::Message(format!("unexpected summary response: {e}")))?;
    Ok(to_meeting_summary(meeting_id, dto))
}

/// The cached summary for a cloud meeting, or `None` if it hasn't been generated.
pub async fn get(app: &tauri::AppHandle, meeting_id: &str) -> Result<Option<MeetingSummary>> {
    let data =
        client::authed_request(app, "GET", &format!("/inference/summary/{meeting_id}"), None)
            .await?;
    if data.is_null() {
        return Ok(None);
    }
    let dto: SummaryDto = serde_json::from_value(data)
        .map_err(|e| Error::Message(format!("unexpected summary response: {e}")))?;
    Ok(Some(to_meeting_summary(meeting_id, dto)))
}

/// Map a backend `SummaryDTO` to the desktop [`MeetingSummary`] shape.
fn to_meeting_summary(meeting_id: &str, dto: SummaryDto) -> MeetingSummary {
    let action_items = dto
        .action_items
        .into_iter()
        .enumerate()
        .map(|(i, label)| ActionItem {
            id: format!("a{}", i + 1),
            label,
            done: false,
        })
        .collect();
    let generated_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    MeetingSummary {
        meeting_id: meeting_id.to_string(),
        summary: dto.summary,
        key_points: dto.key_points,
        action_items,
        model: dto.model,
        generated_at,
    }
}
