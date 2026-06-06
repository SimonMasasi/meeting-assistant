//! Command for persisting meeting attachments to the storage folder.

use std::path::Path;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;

use crate::commands::storage::resolve_storage_dir;
use crate::db::pool;
use crate::error::{Error, Result};

/// A reference to a saved attachment that the frontend stores on the meeting.
#[derive(Serialize)]
pub struct SavedAttachment {
    pub id: String,
    pub file_name: String,
    pub path: String,
    pub size: u64,
}

/// Persist a base64-encoded file into the configured storage folder, organized
/// per meeting. Returns a reference the frontend can store on the meeting.
#[tauri::command]
pub async fn save_meeting_attachment(
    app: tauri::AppHandle,
    meeting_id: String,
    file_name: String,
    data_base64: String,
) -> Result<SavedAttachment> {
    // Strip any directory components the frontend may have sent (file.path can be
    // a full path) to keep the write inside the meeting folder.
    let base_name = Path::new(&file_name)
        .file_name()
        .and_then(|n| n.to_str())
        .filter(|n| !n.is_empty())
        .ok_or_else(|| Error::Message("Invalid file name".to_string()))?
        .to_string();

    let dir = resolve_storage_dir(&app)
        .await?
        .join("meeting-assistant")
        .join(&meeting_id);

    std::fs::create_dir_all(&dir)?;

    let bytes = STANDARD.decode(&data_base64)?;

    let target = dir.join(&base_name);
    std::fs::write(&target, &bytes)?;

    let saved = SavedAttachment {
        id: format!("{}-{}", meeting_id, base_name),
        file_name: base_name,
        path: target.to_string_lossy().to_string(),
        size: bytes.len() as u64,
    };

    // The binary lives on disk; record a queryable metadata row in the database.
    // Re-saving a file with the same name for a meeting refreshes the row.
    let pool = pool(&app).await?;
    sqlx::query(
        "INSERT INTO attachments (id, meeting_id, file_name, path, size)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(id) DO UPDATE SET
             file_name = excluded.file_name,
             path      = excluded.path,
             size      = excluded.size",
    )
    .bind(&saved.id)
    .bind(&meeting_id)
    .bind(&saved.file_name)
    .bind(&saved.path)
    .bind(saved.size as i64)
    .execute(&pool)
    .await?;

    Ok(saved)
}
