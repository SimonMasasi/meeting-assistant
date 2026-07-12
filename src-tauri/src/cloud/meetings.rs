//! Cloud-mode meetings: CRUD against the backend, mapped to/from the desktop
//! [`Meeting`] shape the frontend already consumes.
//!
//! Separate stores: in cloud mode the backend owns meeting ids. The desktop's
//! presentation-only fields are round-tripped through the backend's `clientMeta`
//! blob, so a meeting created in the cloud comes back identical (with the
//! backend's id substituted in).

use std::collections::{BTreeMap, HashMap};

use serde_json::{json, Value};

use crate::cloud::{client, transcription};
use crate::commands::dashboard::{DashboardStats, NameValue, SpeakerTalkTime, TimeSeries};
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

/// The raw backend meeting objects for the signed-in user (before mapping to the
/// desktop shape). The dashboard needs backend-only fields (`summaryJson`,
/// `durationMinutes`) that [`from_backend`] drops. The desktop expects "all
/// meetings", so request a large page (cloud lists are small in practice).
async fn list_raw(app: &tauri::AppHandle) -> Result<Vec<Value>> {
    let data = client::authed_request(
        app,
        "GET",
        "/meetings/get_meetings?itemsPerPage=500&pageNumber=1",
        None,
    )
    .await?;
    Ok(data.as_array().cloned().unwrap_or_default())
}

/// Every meeting for the signed-in user, mapped to the desktop shape.
pub async fn list(app: &tauri::AppHandle) -> Result<Vec<Meeting>> {
    Ok(list_raw(app).await?.iter().map(from_backend).collect())
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

/// Dashboard stats for cloud mode, derived from the backend. Meeting-level fields
/// (counts, online/in-person split, weekday/over-time, summarized count + action
/// items) come from the single `get_meetings` response; recording-derived fields
/// (session count, durations, talk-time) come from one `get_meeting_recordings`
/// call per meeting (cloud lists are small — see [`list`]).
pub async fn dashboard(app: &tauri::AppHandle) -> Result<DashboardStats> {
    let raw = list_raw(app).await?;

    let mut total_meetings = 0i64;
    let (mut online, mut in_person) = (0i64, 0i64);
    let mut summarized_meetings = 0i64;
    let mut open_action_items = 0i64;
    let mut weekday = vec![0i64; 7];
    let mut by_month: BTreeMap<String, i64> = BTreeMap::new();

    // Recording aggregation, grouped by uploaded file id so it's correct whether a
    // MeetingRecording is stored per-file or split into per-segment rows.
    let mut file_span: HashMap<String, (i64, i64)> = HashMap::new(); // file_id -> (min_start, max_end)
    let mut talk: HashMap<String, i64> = HashMap::new(); // speaker -> total secs

    for v in &raw {
        total_meetings += 1;
        let meeting = from_backend(v);

        if meeting.source == "in-person" {
            in_person += 1;
        } else {
            online += 1;
        }

        // created_at is epoch seconds carried in clientMeta; skip unset (0) rows,
        // mirroring the local dashboard's `WHERE created_at > 0`.
        if meeting.created_at > 0 {
            weekday[weekday_mon0(meeting.created_at)] += 1;
            let (y, mo, _) = civil_from_epoch(meeting.created_at);
            *by_month.entry(format!("{y:04}-{mo:02}")).or_insert(0) += 1;
        }

        // Summary + action items from the backend's own `summaryJson` column.
        if let Some(sj) = v.get("summaryJson").and_then(Value::as_str) {
            if !sj.trim().is_empty() {
                summarized_meetings += 1;
                open_action_items += count_action_items(sj);
            }
        }

        // Recording-derived stats: one call per meeting (backend has no "all
        // recordings" endpoint). Failures for a single meeting don't fail the board.
        if let Ok(recordings) = transcription::list_recordings(app, &meeting.id).await {
            for r in &recordings {
                let start = transcription::parse_epoch_secs(&r.start_time);
                let end = transcription::parse_epoch_secs(&r.end_time);
                if let Some(file_id) = r.file.as_ref().map(|f| f.id.clone()).filter(|s| !s.is_empty()) {
                    if let (Some(s), Some(e)) = (start, end) {
                        let span = file_span.entry(file_id).or_insert((s, e));
                        span.0 = span.0.min(s);
                        span.1 = span.1.max(e);
                    } else {
                        file_span.entry(file_id).or_insert((0, 0));
                    }
                }
                if let (Some(name), Some(s), Some(e)) = (
                    r.speaker.as_ref().and_then(|sp| sp.speaker_name.clone()),
                    start,
                    end,
                ) {
                    *talk.entry(name).or_insert(0) += (e - s).max(0);
                }
            }
        }
    }

    let recorded_sessions = file_span.len() as i64;
    let total_recorded_secs: i64 = file_span.values().map(|(s, e)| (e - s).max(0)).sum();
    let avg_recording_secs = if recorded_sessions > 0 {
        total_recorded_secs / recorded_sessions
    } else {
        0
    };

    let mut talk_time: Vec<SpeakerTalkTime> = talk
        .into_iter()
        .map(|(speaker, seconds)| SpeakerTalkTime { speaker, seconds })
        .collect();
    talk_time.sort_by(|a, b| b.seconds.cmp(&a.seconds));

    let mut type_breakdown = Vec::new();
    if online > 0 {
        type_breakdown.push(NameValue { name: "Online".into(), value: online });
    }
    if in_person > 0 {
        type_breakdown.push(NameValue { name: "In-person".into(), value: in_person });
    }

    let (categories, data): (Vec<String>, Vec<i64>) = by_month.into_iter().unzip();

    Ok(DashboardStats {
        total_meetings,
        recorded_sessions,
        total_recorded_secs,
        avg_recording_secs,
        summarized_meetings,
        open_action_items,
        // No per-item "done" state on the backend yet (see the action-item
        // follow-on in the plan), so everything summarized reads as open.
        done_action_items: 0,
        talk_time,
        type_breakdown,
        meetings_by_weekday: weekday,
        meetings_over_time: TimeSeries { categories, data },
    })
}

/// Count the action items in a backend `summaryJson` blob, tolerant of shape:
/// accepts either `actionItems` or `action_items` as a JSON array.
fn count_action_items(summary_json: &str) -> i64 {
    serde_json::from_str::<Value>(summary_json)
        .ok()
        .and_then(|v| {
            v.get("actionItems")
                .or_else(|| v.get("action_items"))
                .and_then(Value::as_array)
                .map(|a| a.len() as i64)
        })
        .unwrap_or(0)
}

/// Day of week for a Unix timestamp, indexed Mon(0)..Sun(6) to match the local
/// dashboard's remapped weekdays. 1970-01-01 was a Thursday (=3).
fn weekday_mon0(secs: i64) -> usize {
    let days = secs.div_euclid(86_400);
    ((days.rem_euclid(7) + 3) % 7) as usize
}

/// Convert a Unix timestamp (seconds, UTC) to a civil `(year, month, day)` using
/// Howard Hinnant's days-from-civil algorithm — avoids pulling in a datetime crate
/// just for the "meetings per month" series.
fn civil_from_epoch(secs: i64) -> (i64, u32, u32) {
    let days = secs.div_euclid(86_400);
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32; // [1, 12]
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[cfg(test)]
mod tests {
    use super::{civil_from_epoch, count_action_items, weekday_mon0};

    #[test]
    fn civil_dates_match_reference() {
        assert_eq!(civil_from_epoch(0), (1970, 1, 1));
        assert_eq!(civil_from_epoch(1_609_459_200), (2021, 1, 1));
        assert_eq!(civil_from_epoch(1_700_000_000), (2023, 11, 14));
        assert_eq!(civil_from_epoch(1_752_192_000), (2025, 7, 11));
    }

    #[test]
    fn weekdays_match_reference() {
        // Mon(0)..Sun(6): 1970-01-01 Thu, 2021-01-01 Fri, 2023-11-14 Tue, 2025-07-11 Fri.
        assert_eq!(weekday_mon0(0), 3);
        assert_eq!(weekday_mon0(1_609_459_200), 4);
        assert_eq!(weekday_mon0(1_700_000_000), 1);
        assert_eq!(weekday_mon0(1_752_192_000), 4);
    }

    #[test]
    fn action_items_counted_tolerantly() {
        assert_eq!(count_action_items(r#"{"actionItems":["a","b","c"]}"#), 3);
        assert_eq!(count_action_items(r#"{"action_items":["a"]}"#), 1);
        assert_eq!(count_action_items(r#"{"summary":"x"}"#), 0);
        assert_eq!(count_action_items("not json"), 0);
        assert_eq!(count_action_items(""), 0);
    }
}
