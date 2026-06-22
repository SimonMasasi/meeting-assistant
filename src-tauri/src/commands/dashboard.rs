//! Aggregated dashboard statistics computed from real local data.
//!
//! Everything here is derived from the SQLite tables (meetings, recordings,
//! transcripts, meeting_summaries) — no mock data. Recording durations aren't
//! stored, so they're read from each WAV header on the fly via
//! [`crate::commands::recordings::wav_duration_secs`].

use serde::Serialize;
use sqlx::Row;

use crate::commands::recordings::wav_duration_secs;
use crate::commands::summary::ActionItem;
use crate::db::pool;
use crate::error::Result;

/// A labeled value, e.g. one slice of the meeting-type breakdown.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NameValue {
    pub name: String,
    pub value: i64,
}

/// Total speaking time for one speaker across all transcripts.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeakerTalkTime {
    pub speaker: String,
    pub seconds: i64,
}

/// A categorized count series (e.g. meetings per month).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeSeries {
    pub categories: Vec<String>,
    pub data: Vec<i64>,
}

/// The full dashboard payload. Every field is real, locally-derived data.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub total_meetings: i64,
    pub recorded_sessions: i64,
    pub total_recorded_secs: i64,
    pub avg_recording_secs: i64,
    pub summarized_meetings: i64,
    pub open_action_items: i64,
    pub done_action_items: i64,
    /// Speaking time per speaker, longest first.
    pub talk_time: Vec<SpeakerTalkTime>,
    /// Online vs in-person meeting counts.
    pub type_breakdown: Vec<NameValue>,
    /// Meeting counts indexed Mon..Sun (length 7).
    pub meetings_by_weekday: Vec<i64>,
    /// Meeting counts per month (YYYY-MM), oldest first.
    pub meetings_over_time: TimeSeries,
}

/// Compute the dashboard statistics from the local database.
#[tauri::command]
pub async fn get_dashboard_stats(app: tauri::AppHandle) -> Result<DashboardStats> {
    let pool = pool(&app).await?;

    let total_meetings: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM meetings")
        .fetch_one(&pool)
        .await?;

    // Recordings: count + total/avg duration read from WAV headers.
    let rec_rows = sqlx::query("SELECT path FROM recordings")
        .fetch_all(&pool)
        .await?;
    let recorded_sessions = rec_rows.len() as i64;
    let mut total_secs = 0f64;
    let mut counted = 0i64;
    for r in &rec_rows {
        let path: String = r.get("path");
        if let Some(d) = wav_duration_secs(&path) {
            total_secs += d;
            counted += 1;
        }
    }
    let avg_recording_secs = if counted > 0 {
        (total_secs / counted as f64) as i64
    } else {
        0
    };

    // Summaries + action-item progress (parse the JSON arrays in Rust).
    let sum_rows = sqlx::query("SELECT action_items FROM meeting_summaries")
        .fetch_all(&pool)
        .await?;
    let summarized_meetings = sum_rows.len() as i64;
    let mut open_action_items = 0i64;
    let mut done_action_items = 0i64;
    for r in &sum_rows {
        let raw: String = r.get("action_items");
        if let Ok(items) = serde_json::from_str::<Vec<ActionItem>>(&raw) {
            for it in items {
                if it.done {
                    done_action_items += 1;
                } else {
                    open_action_items += 1;
                }
            }
        }
    }

    // Talk-time per speaker (uses the renamed name when set).
    let tt_rows = sqlx::query(
        "SELECT COALESCE(speaker_name, speaker_label) AS speaker,
                SUM(end_ms - start_ms) AS ms
         FROM transcripts
         GROUP BY speaker
         ORDER BY ms DESC",
    )
    .fetch_all(&pool)
    .await?;
    let talk_time = tt_rows
        .iter()
        .map(|r| SpeakerTalkTime {
            speaker: r.get("speaker"),
            seconds: r.get::<i64, _>("ms") / 1000,
        })
        .collect();

    // Online vs in-person.
    let tb_rows = sqlx::query("SELECT source, COUNT(*) AS c FROM meetings GROUP BY source")
        .fetch_all(&pool)
        .await?;
    let type_breakdown = tb_rows
        .iter()
        .map(|r| {
            let src: String = r.get("source");
            let name = if src == "in-person" {
                "In-person"
            } else {
                "Online"
            };
            NameValue {
                name: name.to_string(),
                value: r.get("c"),
            }
        })
        .collect();

    // Meetings by weekday (created_at; SQLite %w is 0=Sun..6=Sat → remap to Mon..Sun).
    let wd_rows = sqlx::query(
        "SELECT CAST(strftime('%w', datetime(created_at, 'unixepoch')) AS INTEGER) AS dow,
                COUNT(*) AS c
         FROM meetings WHERE created_at > 0 GROUP BY dow",
    )
    .fetch_all(&pool)
    .await?;
    let mut meetings_by_weekday = vec![0i64; 7];
    for r in &wd_rows {
        let dow: i64 = r.get("dow");
        let c: i64 = r.get("c");
        let idx = (((dow + 6) % 7) as usize).min(6); // Sun(0)->6, Mon(1)->0, …
        meetings_by_weekday[idx] += c;
    }

    // Meetings per month.
    let ot_rows = sqlx::query(
        "SELECT strftime('%Y-%m', datetime(created_at, 'unixepoch')) AS ym, COUNT(*) AS c
         FROM meetings WHERE created_at > 0 GROUP BY ym ORDER BY ym",
    )
    .fetch_all(&pool)
    .await?;
    let mut categories = Vec::with_capacity(ot_rows.len());
    let mut data = Vec::with_capacity(ot_rows.len());
    for r in &ot_rows {
        categories.push(r.get::<String, _>("ym"));
        data.push(r.get::<i64, _>("c"));
    }

    Ok(DashboardStats {
        total_meetings,
        recorded_sessions,
        total_recorded_secs: total_secs as i64,
        avg_recording_secs,
        summarized_meetings,
        open_action_items,
        done_action_items,
        talk_time,
        type_breakdown,
        meetings_by_weekday,
        meetings_over_time: TimeSeries { categories, data },
    })
}
