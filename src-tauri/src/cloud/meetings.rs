//! Cloud-mode meetings: CRUD against the backend, mapped to/from the desktop
//! [`Meeting`] shape the frontend already consumes.
//!
//! Separate stores: in cloud mode the backend owns meeting ids. The desktop's
//! presentation-only fields are round-tripped through the backend's `clientMeta`
//! blob, so a meeting created in the cloud comes back identical (with the
//! backend's id substituted in).

use serde_json::{json, Value};

use crate::cloud::client;
use crate::commands::dashboard::{DashboardStats, NameValue, TimeSeries};
use crate::commands::meetings::Meeting;
use crate::error::Result;

/// Build the backend create/update payload from a desktop meeting. The full
/// client model is packed into `clientMeta`; `title`/`description` also populate
/// the backend's own columns.
fn to_payload(m: &Meeting) -> Value {
    json!({
        "title": m.title,
        "description": m.objective,
        "clientMeta": serde_json::to_string(m).unwrap_or_default(),
    })
}

/// Reconstruct a desktop meeting from a backend meeting object: prefer the
/// round-tripped `clientMeta`, fall back to the backend columns, and always use
/// the backend id (authoritative in cloud mode).
fn from_backend(v: &Value) -> Meeting {
    let mut meeting = v
        .get("clientMeta")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .and_then(|s| serde_json::from_str::<Meeting>(s).ok())
        .unwrap_or_else(|| Meeting {
            title: str_field(v, "title"),
            objective: str_field(v, "description"),
            ..Default::default()
        });
    if let Some(id) = v.get("id").and_then(Value::as_str) {
        meeting.id = id.to_string();
    }
    meeting
}

fn str_field(v: &Value, key: &str) -> String {
    v.get(key).and_then(Value::as_str).unwrap_or("").to_string()
}

/// Every meeting for the signed-in user. The desktop expects "all meetings", so
/// request a large page (cloud lists are small in practice).
pub async fn list(app: &tauri::AppHandle) -> Result<Vec<Meeting>> {
    let data = client::authed_request(
        app,
        "GET",
        "/meetings/get_meetings?itemsPerPage=500&pageNumber=1",
        None,
    )
    .await?;
    Ok(data
        .as_array()
        .map(|arr| arr.iter().map(from_backend).collect())
        .unwrap_or_default())
}

/// A single meeting, or `None` for a stale/unknown id (the backend returns
/// success + null data in that case).
pub async fn get(app: &tauri::AppHandle, meeting_id: &str) -> Result<Option<Meeting>> {
    let data = client::authed_request(app, "GET", &format!("/meetings/{meeting_id}"), None).await?;
    Ok(if data.is_null() {
        None
    } else {
        Some(from_backend(&data))
    })
}

/// Create a meeting; returns it with the backend-assigned id.
pub async fn create(app: &tauri::AppHandle, meeting: &Meeting) -> Result<Meeting> {
    let data =
        client::authed_request(app, "POST", "/meetings/create_meeting", Some(to_payload(meeting)))
            .await?;
    Ok(from_backend(&data))
}

/// Update an existing meeting (by its backend id).
pub async fn update(app: &tauri::AppHandle, meeting: &Meeting) -> Result<Meeting> {
    let data = client::authed_request(
        app,
        "PUT",
        &format!("/meetings/{}", meeting.id),
        Some(to_payload(meeting)),
    )
    .await?;
    Ok(from_backend(&data))
}

/// Delete a meeting (and its backend children).
pub async fn delete(app: &tauri::AppHandle, meeting_id: &str) -> Result<()> {
    client::authed_request(app, "DELETE", &format!("/meetings/{meeting_id}"), None).await?;
    Ok(())
}

/// Dashboard stats for cloud mode, derived from the meeting list. Recording-,
/// transcript- and summary-derived fields are zero until cloud inference lands
/// (Phase 3); meeting counts and the online/in-person split are real.
pub async fn dashboard(app: &tauri::AppHandle) -> Result<DashboardStats> {
    let meetings = list(app).await?;

    let (mut online, mut in_person) = (0i64, 0i64);
    for m in &meetings {
        if m.source == "in-person" {
            in_person += 1;
        } else {
            online += 1;
        }
    }
    let mut type_breakdown = Vec::new();
    if online > 0 {
        type_breakdown.push(NameValue { name: "Online".into(), value: online });
    }
    if in_person > 0 {
        type_breakdown.push(NameValue { name: "In-person".into(), value: in_person });
    }

    Ok(DashboardStats {
        total_meetings: meetings.len() as i64,
        recorded_sessions: 0,
        total_recorded_secs: 0,
        avg_recording_secs: 0,
        summarized_meetings: 0,
        open_action_items: 0,
        done_action_items: 0,
        talk_time: Vec::new(),
        type_breakdown,
        meetings_by_weekday: vec![0; 7],
        meetings_over_time: TimeSeries { categories: Vec::new(), data: Vec::new() },
    })
}
