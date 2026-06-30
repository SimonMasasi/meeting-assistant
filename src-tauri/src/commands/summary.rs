//! Meeting summarization via the user's configured Chat provider.
//!
//! Reads a meeting's persisted transcript, sends it to the Chat model named in
//! `ai_settings` (OpenAI, Anthropic, or a local OpenAI-compatible server such as
//! Ollama / LM Studio), and stores the structured result — a summary, key points
//! and action items — in `meeting_summaries`. Regenerating overwrites the row.
//!
//! HTTP follows the same blocking-`ureq`-on-`spawn_blocking` pattern as
//! [`crate::commands::models`]; the request shape differs per provider (OpenAI's
//! `/chat/completions` vs Anthropic's `/messages`).

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;

use crate::cloud::{self, AppMode};
use crate::commands::ai::fetch_ai_settings;
use crate::db::pool;
use crate::error::{Error, Result};

/// A single follow-up task extracted from the meeting. `done` always starts
/// `false`; toggling it is presentational state in the UI (not persisted here).
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionItem {
    pub id: String,
    pub label: String,
    pub done: bool,
}

/// The stored, structured summary for one meeting.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingSummary {
    pub meeting_id: String,
    pub summary: String,
    pub key_points: Vec<String>,
    pub action_items: Vec<ActionItem>,
    /// "provider:model" that produced this summary, for display / debugging.
    pub model: String,
    /// Unix epoch seconds at which the summary was generated.
    pub generated_at: i64,
}

const SYSTEM_PROMPT: &str = "You are an assistant that summarizes meeting transcripts. \
Reply with ONLY a single JSON object and nothing else, using exactly this shape: \
{\"summary\": string, \"key_points\": array of strings, \"action_items\": array of strings}. \
\"summary\" is a concise paragraph capturing what the meeting was about and what was decided. \
\"key_points\" are the most important takeaways. \"action_items\" are concrete follow-up \
tasks. Do not wrap the JSON in markdown code fences.";

/// Return the saved summary for a meeting, or `None` if it has never been generated.
#[tauri::command]
pub async fn get_meeting_summary(
    app: tauri::AppHandle,
    meeting_id: String,
) -> Result<Option<MeetingSummary>> {
    if cloud::current_mode(&app).await? == AppMode::Cloud {
        return cloud::summary::get(&app, &meeting_id).await;
    }
    let pool = pool(&app).await?;
    let row = sqlx::query(
        "SELECT summary, key_points, action_items, model, generated_at
         FROM meeting_summaries WHERE meeting_id = $1",
    )
    .bind(&meeting_id)
    .fetch_optional(&pool)
    .await?;

    let Some(r) = row else {
        return Ok(None);
    };
    let key_points: Vec<String> =
        serde_json::from_str(&r.get::<String, _>("key_points")).unwrap_or_default();
    let action_items: Vec<ActionItem> =
        serde_json::from_str(&r.get::<String, _>("action_items")).unwrap_or_default();

    Ok(Some(MeetingSummary {
        meeting_id,
        summary: r.get("summary"),
        key_points,
        action_items,
        model: r.get("model"),
        generated_at: r.get("generated_at"),
    }))
}

/// Generate (or regenerate) the summary for a meeting using the configured Chat
/// provider, persist it, and return it. Errors with a user-facing message when no
/// provider/model is configured or there is no transcript yet.
#[tauri::command]
pub async fn generate_meeting_summary(
    app: tauri::AppHandle,
    meeting_id: String,
) -> Result<MeetingSummary> {
    if cloud::current_mode(&app).await? == AppMode::Cloud {
        return cloud::summary::generate(&app, &meeting_id).await;
    }
    let pool = pool(&app).await?;
    let settings = fetch_ai_settings(&pool).await?;

    let provider = settings.chat_provider.trim().to_lowercase();
    if provider.is_empty() {
        return Err(Error::Message(
            "No chat provider configured. Set one in Settings → AI.".into(),
        ));
    }
    let model = settings.chat_model.trim().to_string();
    if model.is_empty() {
        return Err(Error::Message(
            "No chat model configured. Set one in Settings → AI.".into(),
        ));
    }
    let api_key = settings.chat_api_key.trim().to_string();
    if provider != "local" && api_key.is_empty() {
        return Err(Error::Message(format!(
            "No API key configured for the {provider} chat provider. Add one in Settings → AI."
        )));
    }
    let base_url = default_base_url(&provider, &settings.chat_base_url);

    // Build a plain-text transcript: one "Speaker: text" line per utterance.
    let rows = sqlx::query(
        "SELECT speaker_label, speaker_name, text
         FROM transcripts WHERE meeting_id = $1 ORDER BY seq",
    )
    .bind(&meeting_id)
    .fetch_all(&pool)
    .await?;
    if rows.is_empty() {
        return Err(Error::Message(
            "No transcript to summarize yet. Record the meeting first.".into(),
        ));
    }
    let mut transcript = String::new();
    for r in &rows {
        let label: String = r.get("speaker_label");
        let name: Option<String> = r.get("speaker_name");
        let text: String = r.get("text");
        let speaker = name.unwrap_or(label);
        transcript.push_str(&format!("{speaker}: {text}\n"));
    }
    let user = format!("Summarize the following meeting transcript.\n\nTranscript:\n{transcript}");

    // `ureq` is blocking; keep it off the async runtime's worker threads.
    let provider_c = provider.clone();
    let model_c = model.clone();
    let raw = tauri::async_runtime::spawn_blocking(move || {
        chat_complete(&provider_c, &base_url, &api_key, &model_c, SYSTEM_PROMPT, &user)
    })
    .await
    .map_err(|e| Error::Message(format!("summary task failed: {e}")))??;

    let parsed = parse_summary(&raw);
    let action_items: Vec<ActionItem> = parsed
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
    let model_label = format!("{provider}:{model}");

    sqlx::query(
        "INSERT INTO meeting_summaries
             (meeting_id, summary, key_points, action_items, model, generated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT(meeting_id) DO UPDATE SET
             summary      = excluded.summary,
             key_points   = excluded.key_points,
             action_items = excluded.action_items,
             model        = excluded.model,
             generated_at = excluded.generated_at",
    )
    .bind(&meeting_id)
    .bind(&parsed.summary)
    .bind(serde_json::to_string(&parsed.key_points)?)
    .bind(serde_json::to_string(&action_items)?)
    .bind(&model_label)
    .bind(generated_at)
    .execute(&pool)
    .await?;

    Ok(MeetingSummary {
        meeting_id,
        summary: parsed.summary,
        key_points: parsed.key_points,
        action_items,
        model: model_label,
        generated_at,
    })
}

/// The configured base URL, or a per-provider default when the user left it blank.
fn default_base_url(provider: &str, configured: &str) -> String {
    let c = configured.trim().trim_end_matches('/');
    if !c.is_empty() {
        return c.to_string();
    }
    match provider {
        "anthropic" => "https://api.anthropic.com/v1".to_string(),
        "local" => "http://localhost:11434/v1".to_string(),
        _ => "https://api.openai.com/v1".to_string(),
    }
}

/// Call the provider's chat endpoint and return the raw assistant text. OpenAI
/// and local servers share the OpenAI-compatible shape; Anthropic differs.
fn chat_complete(
    provider: &str,
    base_url: &str,
    api_key: &str,
    model: &str,
    system: &str,
    user: &str,
) -> Result<String> {
    match provider {
        "anthropic" => anthropic_complete(base_url, api_key, model, system, user),
        // "openai", "local", and any other OpenAI-compatible endpoint.
        _ => openai_complete(base_url, api_key, model, system, user),
    }
}

/// OpenAI-compatible `POST {base_url}/chat/completions`. The API key (Bearer) is
/// omitted when blank, as local servers like Ollama don't require one.
fn openai_complete(
    base_url: &str,
    api_key: &str,
    model: &str,
    system: &str,
    user: &str,
) -> Result<String> {
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user },
        ],
        "max_tokens": 1024,
    });

    let mut req = ureq::post(&url)
        .timeout(Duration::from_secs(120))
        .set("content-type", "application/json");
    if !api_key.is_empty() {
        req = req.set("authorization", &format!("Bearer {api_key}"));
    }

    let json = post_json(req, &url, body)?;
    json.get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(Value::as_str)
        .map(String::from)
        .ok_or_else(|| Error::Message(format!("unexpected response from {url}: {json}")))
}

/// Anthropic `POST {base_url}/messages` (x-api-key + anthropic-version). Returns
/// the first text block's text.
fn anthropic_complete(
    base_url: &str,
    api_key: &str,
    model: &str,
    system: &str,
    user: &str,
) -> Result<String> {
    let url = format!("{}/messages", base_url.trim_end_matches('/'));
    let body = json!({
        "model": model,
        "max_tokens": 1024,
        "system": system,
        "messages": [{ "role": "user", "content": user }],
    });

    let req = ureq::post(&url)
        .timeout(Duration::from_secs(120))
        .set("content-type", "application/json")
        .set("x-api-key", api_key)
        .set("anthropic-version", "2023-06-01");

    let json = post_json(req, &url, body)?;
    json.get("content")
        .and_then(Value::as_array)
        .and_then(|arr| {
            arr.iter().find_map(|b| {
                (b.get("type").and_then(Value::as_str) == Some("text"))
                    .then(|| b.get("text").and_then(Value::as_str).map(String::from))
                    .flatten()
            })
        })
        .ok_or_else(|| Error::Message(format!("unexpected response from {url}: {json}")))
}

/// Send a JSON body and parse the JSON response, surfacing non-2xx bodies (e.g.
/// bad key, unknown model) as readable messages for the UI. The body is sent as
/// bytes (with an explicit `content-type` header on `req`) since `ureq`'s
/// `send_json` helper requires its `json` feature, which isn't enabled here.
fn post_json(req: ureq::Request, url: &str, body: Value) -> Result<Value> {
    let payload = serde_json::to_string(&body)?;
    match req.send_bytes(payload.as_bytes()) {
        Ok(resp) => {
            let text = resp
                .into_string()
                .map_err(|e| Error::Message(format!("reading response from {url} failed: {e}")))?;
            serde_json::from_str(&text).map_err(Error::from)
        }
        Err(ureq::Error::Status(code, resp)) => {
            let detail = resp.into_string().unwrap_or_default();
            Err(Error::Message(format!(
                "provider request to {url} failed ({code}): {detail}"
            )))
        }
        Err(e) => Err(Error::Message(format!("request to {url} failed: {e}"))),
    }
}

/// Parsed pieces of the model's JSON reply, before action items are given ids.
struct ParsedSummary {
    summary: String,
    key_points: Vec<String>,
    action_items: Vec<String>,
}

/// Leniently extract the JSON object from the model's reply. Falls back to using
/// the whole text as the summary so the UI still shows something if the model
/// ignored the JSON instruction.
fn parse_summary(raw: &str) -> ParsedSummary {
    let slice = raw
        .find('{')
        .and_then(|start| raw.rfind('}').map(|end| &raw[start..=end]));
    if let Some(slice) = slice {
        if let Ok(v) = serde_json::from_str::<Value>(slice) {
            let summary = v
                .get("summary")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();
            let key_points = string_array(v.get("key_points"));
            let action_items = string_array(v.get("action_items"));
            if !summary.is_empty() || !key_points.is_empty() || !action_items.is_empty() {
                return ParsedSummary {
                    summary,
                    key_points,
                    action_items,
                };
            }
        }
    }
    ParsedSummary {
        summary: raw.trim().to_string(),
        key_points: Vec::new(),
        action_items: Vec::new(),
    }
}

/// Collect a JSON value's array of non-empty trimmed strings (ignoring non-strings).
fn string_array(v: Option<&Value>) -> Vec<String> {
    v.and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(|s| s.trim().to_string()))
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default()
}
