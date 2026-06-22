//! CRUD for meetings — the parent record that child tables (recordings,
//! transcripts, meeting_speakers, meeting_summaries, attachments) reference by
//! `meeting_id`.
//!
//! `id` stays a frontend-generated string (e.g. `mtg-<millis>`), so every
//! existing child command keeps working unchanged. `tags` is stored as a JSON
//! string, following the same convention as `meeting_summaries.key_points`
//! (see [`crate::commands::summary`]).

use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sqlx::Row;
use tauri::State;

use crate::commands::microphone::RecordingState;
use crate::commands::storage::resolve_storage_dir;
use crate::db::pool;
use crate::error::{Error, Result};

/// A persisted meeting. Mirrors the scalar fields the list, detail header and
/// dashboard read. Transcript, summary, key points and action items are owned by
/// their own tables and fetched separately, so they are intentionally absent.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Meeting {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub host: String,
    #[serde(default)]
    pub date: String,
    #[serde(default)]
    pub time: String,
    #[serde(default)]
    pub views: i64,
    #[serde(default)]
    pub attendees: i64,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub duration_label: String,
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub objective: String,
    #[serde(default)]
    pub created_at: i64,
}

/// Map a `meetings` row to a [`Meeting`], decoding the JSON `tags` column.
fn row_to_meeting(r: &sqlx::sqlite::SqliteRow) -> Meeting {
    let tags: Vec<String> = serde_json::from_str(&r.get::<String, _>("tags")).unwrap_or_default();
    Meeting {
        id: r.get("id"),
        title: r.get("title"),
        host: r.get("host"),
        date: r.get("date"),
        time: r.get("time"),
        views: r.get("views"),
        attendees: r.get("attendees"),
        status: r.get("status"),
        source: r.get("source"),
        duration_label: r.get("duration_label"),
        language: r.get("language"),
        tags,
        objective: r.get("objective"),
        created_at: r.get("created_at"),
    }
}

const SELECT_COLUMNS: &str = "id, title, host, date, time, views, attendees, status, source,
     duration_label, language, tags, objective, created_at";

/// Every meeting, newest first.
#[tauri::command]
pub async fn list_meetings(app: tauri::AppHandle) -> Result<Vec<Meeting>> {
    let pool = pool(&app).await?;
    let rows = sqlx::query(&format!(
        "SELECT {SELECT_COLUMNS} FROM meetings ORDER BY created_at DESC, id DESC"
    ))
    .fetch_all(&pool)
    .await?;
    Ok(rows.iter().map(row_to_meeting).collect())
}

/// A single meeting, or `None` if no row has that id (e.g. a stale deep link).
#[tauri::command]
pub async fn get_meeting(app: tauri::AppHandle, meeting_id: String) -> Result<Option<Meeting>> {
    let pool = pool(&app).await?;
    let row = sqlx::query(&format!(
        "SELECT {SELECT_COLUMNS} FROM meetings WHERE id = $1"
    ))
    .bind(&meeting_id)
    .fetch_optional(&pool)
    .await?;
    Ok(row.as_ref().map(row_to_meeting))
}

/// Insert or update a meeting, returning the stored row. Shared by create and
/// update since both upsert by `id`.
#[tauri::command]
pub async fn create_meeting(app: tauri::AppHandle, meeting: Meeting) -> Result<Meeting> {
    upsert_meeting(&app, meeting).await
}

/// Update an existing meeting (same upsert as [`create_meeting`]).
#[tauri::command]
pub async fn update_meeting(app: tauri::AppHandle, meeting: Meeting) -> Result<Meeting> {
    upsert_meeting(&app, meeting).await
}

async fn upsert_meeting(app: &tauri::AppHandle, mut meeting: Meeting) -> Result<Meeting> {
    if meeting.id.trim().is_empty() {
        return Err(Error::Message("Meeting id is required".into()));
    }
    // Stamp creation time server-side when the client didn't supply one, so the
    // newest-first ordering in `list_meetings` is reliable.
    if meeting.created_at <= 0 {
        meeting.created_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
    }

    let pool = pool(app).await?;
    sqlx::query(
        "INSERT INTO meetings
             (id, title, host, date, time, views, attendees, status, source,
              duration_label, language, tags, objective, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT(id) DO UPDATE SET
             title          = excluded.title,
             host           = excluded.host,
             date           = excluded.date,
             time           = excluded.time,
             views          = excluded.views,
             attendees      = excluded.attendees,
             status         = excluded.status,
             source         = excluded.source,
             duration_label = excluded.duration_label,
             language       = excluded.language,
             tags           = excluded.tags,
             objective      = excluded.objective",
    )
    .bind(&meeting.id)
    .bind(&meeting.title)
    .bind(&meeting.host)
    .bind(&meeting.date)
    .bind(&meeting.time)
    .bind(meeting.views)
    .bind(meeting.attendees)
    .bind(&meeting.status)
    .bind(&meeting.source)
    .bind(&meeting.duration_label)
    .bind(&meeting.language)
    .bind(serde_json::to_string(&meeting.tags)?)
    .bind(&meeting.objective)
    .bind(meeting.created_at)
    .execute(&pool)
    .await?;
    Ok(meeting)
}

/// Delete a meeting and everything attached to it — child rows in every table
/// plus the meeting's on-disk recordings/attachments folder. Refuses while a
/// capture is in progress (mirrors [`crate::commands::recordings::delete_recording`]).
#[tauri::command]
pub async fn delete_meeting(
    app: tauri::AppHandle,
    state: State<'_, RecordingState>,
    meeting_id: String,
) -> Result<()> {
    if state.is_active() {
        return Err(Error::Message(
            "Stop the current recording before deleting".to_string(),
        ));
    }

    let pool = pool(&app).await?;
    let mut tx = pool.begin().await?;
    for table in [
        "transcripts",
        "meeting_speakers",
        "meeting_summaries",
        "recordings",
        "attachments",
    ] {
        sqlx::query(&format!("DELETE FROM {table} WHERE meeting_id = $1"))
            .bind(&meeting_id)
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query("DELETE FROM meetings WHERE id = $1")
        .bind(&meeting_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    // Remove the on-disk folder holding this meeting's recordings/attachments.
    // A leftover folder is harmless, so a failure here doesn't fail the command.
    let dir = resolve_storage_dir(&app)
        .await?
        .join("meeting-assistant")
        .join(&meeting_id);
    if dir.exists() {
        let _ = std::fs::remove_dir_all(&dir);
    }
    Ok(())
}
