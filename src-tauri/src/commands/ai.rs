//! Commands for reading and persisting AI model provider settings.
//!
//! Covers the speech-to-text, text-to-speech and chat/LLM providers, each with
//! its own provider name, API key, model name and base URL. Stored as the
//! single row (`id = 1`) of the `ai_settings` table.

use sqlx::{Pool, Row, Sqlite};

use crate::db::pool;
use crate::error::Result;
use crate::settings::AiSettings;

/// Read the saved AI provider settings from the database, or blank defaults when
/// no row exists yet. Shared by [`get_ai_settings`] and other commands (e.g. the
/// summary generator) that need the configured Chat provider.
pub async fn fetch_ai_settings(pool: &Pool<Sqlite>) -> Result<AiSettings> {
    let row = sqlx::query(
        "SELECT stt_provider, stt_api_key, stt_model, stt_base_url,
                tts_provider, tts_api_key, tts_model, tts_base_url,
                chat_provider, chat_api_key, chat_model, chat_base_url
         FROM ai_settings WHERE id = 1",
    )
    .fetch_optional(pool)
    .await?;

    Ok(match row {
        Some(r) => AiSettings {
            stt_provider: r.get("stt_provider"),
            stt_api_key: r.get("stt_api_key"),
            stt_model: r.get("stt_model"),
            stt_base_url: r.get("stt_base_url"),
            tts_provider: r.get("tts_provider"),
            tts_api_key: r.get("tts_api_key"),
            tts_model: r.get("tts_model"),
            tts_base_url: r.get("tts_base_url"),
            chat_provider: r.get("chat_provider"),
            chat_api_key: r.get("chat_api_key"),
            chat_model: r.get("chat_model"),
            chat_base_url: r.get("chat_base_url"),
        },
        None => AiSettings::default(),
    })
}

/// Return the saved AI provider settings, or blank defaults when none are set.
#[tauri::command]
pub async fn get_ai_settings(app: tauri::AppHandle) -> Result<AiSettings> {
    let pool = pool(&app).await?;
    fetch_ai_settings(&pool).await
}

/// Persist the AI provider settings.
#[tauri::command]
pub async fn set_ai_settings(app: tauri::AppHandle, settings: AiSettings) -> Result<()> {
    let pool = pool(&app).await?;
    sqlx::query(
        "INSERT INTO ai_settings
             (id, stt_provider, stt_api_key, stt_model, stt_base_url,
              tts_provider, tts_api_key, tts_model, tts_base_url,
              chat_provider, chat_api_key, chat_model, chat_base_url)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT(id) DO UPDATE SET
             stt_provider  = excluded.stt_provider,
             stt_api_key   = excluded.stt_api_key,
             stt_model     = excluded.stt_model,
             stt_base_url  = excluded.stt_base_url,
             tts_provider  = excluded.tts_provider,
             tts_api_key   = excluded.tts_api_key,
             tts_model     = excluded.tts_model,
             tts_base_url  = excluded.tts_base_url,
             chat_provider = excluded.chat_provider,
             chat_api_key  = excluded.chat_api_key,
             chat_model    = excluded.chat_model,
             chat_base_url = excluded.chat_base_url",
    )
    .bind(settings.stt_provider)
    .bind(settings.stt_api_key)
    .bind(settings.stt_model)
    .bind(settings.stt_base_url)
    .bind(settings.tts_provider)
    .bind(settings.tts_api_key)
    .bind(settings.tts_model)
    .bind(settings.tts_base_url)
    .bind(settings.chat_provider)
    .bind(settings.chat_api_key)
    .bind(settings.chat_model)
    .bind(settings.chat_base_url)
    .execute(&pool)
    .await?;
    Ok(())
}
