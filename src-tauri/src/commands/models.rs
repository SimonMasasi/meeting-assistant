//! Command for discovering models served by a local / self-hosted provider.
//!
//! The frontend can't reach a local model server (Ollama, LM Studio, …) directly
//! under the Tauri sandbox, so it asks the backend to enumerate the installed
//! models. We try the OpenAI-compatible `/models` endpoint first (covers Ollama's
//! `/v1` base and LM Studio) and fall back to Ollama's native `/api/tags`.

use std::time::Duration;

use serde_json::Value;

use crate::error::{Error, Result};

/// List the models installed on a local / self-hosted server reachable at `base_url`.
///
/// Returns model names/ids; an empty vec means the server responded but exposed no
/// models. Errors (unreachable host, bad URL) are surfaced to the UI, which then
/// falls back to free-text entry.
#[tauri::command]
pub async fn list_local_models(base_url: String) -> Result<Vec<String>> {
    // `ureq` is blocking; keep it off the async runtime's worker threads.
    let models = tauri::async_runtime::spawn_blocking(move || fetch_local_models(&base_url))
        .await
        .map_err(|e| Error::Message(format!("model listing task failed: {e}")))??;
    Ok(models)
}

fn fetch_local_models(base_url: &str) -> Result<Vec<String>> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(Error::Message("Base URL is empty".into()));
    }

    // 1) OpenAI-compatible: GET {base_url}/models -> { "data": [ { "id" } ] }
    match get_json(&format!("{trimmed}/models")) {
        Ok(json) => {
            let models = parse_openai_models(&json);
            if !models.is_empty() {
                return Ok(models);
            }
            // 200 but empty — maybe a bare Ollama root, try its native endpoint.
            Ok(try_ollama_tags(trimmed).unwrap_or_default())
        }
        // The OpenAI route failed (e.g. 404 on a bare Ollama host). Try the native
        // endpoint before giving up, but report the original error if that also fails.
        Err(first_err) => Ok(try_ollama_tags(trimmed).ok_or(first_err)?),
    }
}

/// Ollama-native fallback: GET {host}/api/tags -> { "models": [ { "name" } ] }.
/// `base_url` may include a trailing `/v1` (OpenAI-compat path) which we strip.
fn try_ollama_tags(trimmed: &str) -> Option<Vec<String>> {
    let host_root = trimmed.strip_suffix("/v1").unwrap_or(trimmed);
    let json = get_json(&format!("{host_root}/api/tags")).ok()?;
    let models: Vec<String> = json
        .get("models")?
        .as_array()?
        .iter()
        .filter_map(|m| m.get("name").and_then(Value::as_str).map(String::from))
        .collect();
    if models.is_empty() {
        None
    } else {
        Some(models)
    }
}

fn parse_openai_models(json: &Value) -> Vec<String> {
    json.get("data")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("id").and_then(Value::as_str).map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

fn get_json(url: &str) -> Result<Value> {
    let body = ureq::get(url)
        .timeout(Duration::from_secs(5))
        .call()
        .map_err(|e| Error::Message(format!("request to {url} failed: {e}")))?
        .into_string()
        .map_err(|e| Error::Message(format!("reading response from {url} failed: {e}")))?;
    serde_json::from_str(&body).map_err(Error::from)
}
