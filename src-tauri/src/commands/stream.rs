use crate::commands::keychain::SERVICE_NAME;
use crate::commands::provider::load_provider;
use crate::error::AppError;
use futures_util::StreamExt;
use keyring::Entry;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use tauri::ipc::Channel;

// ─── Shared types ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Events sent through the Channel back to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StreamEvent {
    Chunk { delta: String },
    Done,
    Error { message: String },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub status: String, // "connected" | "error"
    pub latency_ms: Option<u64>,
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub context_length: Option<u32>,
}

// ─── Helpers ──────────────────────────────────────────────────

fn build_client() -> Result<Client, AppError> {
    Client::builder()
        .build()
        .map_err(|e| AppError::Other(e.to_string()))
}

fn get_api_key(alias: &str) -> Result<String, AppError> {
    let entry =
        Entry::new(SERVICE_NAME, alias).map_err(|e| AppError::Other(e.to_string()))?;
    entry
        .get_password()
        .map_err(|e| AppError::Other(format!("Keychain error for alias '{alias}': {e}")))
}

fn make_headers(pairs: &[(&str, &str)]) -> Result<HeaderMap, AppError> {
    let mut headers = HeaderMap::new();
    for (k, v) in pairs {
        let name = HeaderName::from_str(k)
            .map_err(|e| AppError::Other(format!("Invalid header name '{k}': {e}")))?;
        let value = HeaderValue::from_str(v)
            .map_err(|e| AppError::Other(format!("Invalid header value for '{k}': {e}")))?;
        headers.insert(name, value);
    }
    Ok(headers)
}

// ─── SSE line parsers ─────────────────────────────────────────

/// Extract text delta from an OpenAI-format SSE data line.
/// Returns None to continue, Some("") on [DONE], Some(delta) on text.
fn parse_openai_sse_line(data: &str) -> Option<String> {
    if data == "[DONE]" {
        return Some(String::new()); // signals stream end
    }
    let parsed: serde_json::Value = serde_json::from_str(data).ok()?;
    let delta = parsed["choices"][0]["delta"]["content"].as_str()?;
    if delta.is_empty() {
        None
    } else {
        Some(delta.to_owned())
    }
}

/// Extract text delta from an Anthropic-format SSE data line.
fn parse_anthropic_sse_line(data: &str) -> Option<String> {
    let parsed: serde_json::Value = serde_json::from_str(data).ok()?;
    match parsed["type"].as_str()? {
        "content_block_delta" => {
            let delta = &parsed["delta"];
            if delta["type"].as_str() == Some("text_delta") {
                let text = delta["text"].as_str()?;
                if text.is_empty() {
                    None
                } else {
                    Some(text.to_owned())
                }
            } else {
                None
            }
        }
        "message_stop" => Some(String::new()), // signals stream end
        _ => None,
    }
}

// ─── Streaming backends ───────────────────────────────────────

async fn stream_openai_sse(
    on_event: &Channel<StreamEvent>,
    client: &Client,
    url: &str,
    headers: HeaderMap,
    body: serde_json::Value,
) -> Result<(), AppError> {
    let response = client
        .post(url)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let msg = response
            .text()
            .await
            .unwrap_or_else(|_| format!("HTTP {status}"));
        return Err(AppError::Other(format!("HTTP {status}: {}", &msg[..msg.len().min(200)])));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(result) = stream.next().await {
        let chunk = result.map_err(|e| AppError::Other(e.to_string()))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim_end_matches('\r').to_owned();
            buffer.drain(..=pos);

            if !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            match parse_openai_sse_line(data) {
                Some(delta) if delta.is_empty() => {
                    // [DONE] sentinel
                    let _ = on_event.send(StreamEvent::Done);
                    return Ok(());
                }
                Some(delta) => {
                    let _ = on_event.send(StreamEvent::Chunk { delta });
                }
                None => {}
            }
        }
    }

    let _ = on_event.send(StreamEvent::Done);
    Ok(())
}

async fn stream_ollama_ndjson(
    on_event: &Channel<StreamEvent>,
    client: &Client,
    url: &str,
    body: serde_json::Value,
) -> Result<(), AppError> {
    let response = client
        .post(url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let msg = response
            .text()
            .await
            .unwrap_or_else(|_| format!("HTTP {status}"));
        return Err(AppError::Other(format!("HTTP {status}: {}", &msg[..msg.len().min(200)])));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(result) = stream.next().await {
        let chunk = result.map_err(|e| AppError::Other(e.to_string()))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim_end_matches('\r').to_owned();
            buffer.drain(..=pos);
            if line.is_empty() {
                continue;
            }
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&line) {
                if let Some(content) = parsed["message"]["content"].as_str() {
                    if !content.is_empty() {
                        let _ = on_event.send(StreamEvent::Chunk {
                            delta: content.to_owned(),
                        });
                    }
                }
                if parsed["done"].as_bool() == Some(true) {
                    let _ = on_event.send(StreamEvent::Done);
                    return Ok(());
                }
            }
        }
    }

    let _ = on_event.send(StreamEvent::Done);
    Ok(())
}

async fn stream_anthropic_sse(
    on_event: &Channel<StreamEvent>,
    client: &Client,
    url: &str,
    headers: HeaderMap,
    body: serde_json::Value,
) -> Result<(), AppError> {
    let response = client
        .post(url)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let msg = response
            .text()
            .await
            .unwrap_or_else(|_| format!("HTTP {status}"));
        return Err(AppError::Other(format!("HTTP {status}: {}", &msg[..msg.len().min(200)])));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(result) = stream.next().await {
        let chunk = result.map_err(|e| AppError::Other(e.to_string()))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buffer.find('\n') {
            let line = buffer[..pos].trim_end_matches('\r').to_owned();
            buffer.drain(..=pos);

            if !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            match parse_anthropic_sse_line(data) {
                Some(delta) if delta.is_empty() => {
                    let _ = on_event.send(StreamEvent::Done);
                    return Ok(());
                }
                Some(delta) => {
                    let _ = on_event.send(StreamEvent::Chunk { delta });
                }
                None => {}
            }
        }
    }

    let _ = on_event.send(StreamEvent::Done);
    Ok(())
}

// ─── Commands ─────────────────────────────────────────────────

/// Stream a chat completion. Events are sent through `on_event` channel.
/// Provider config is loaded from disk; API key is fetched from OS Keychain.
#[tauri::command]
pub async fn stream_chat(
    on_event: Channel<StreamEvent>,
    provider_id: String,
    model_id: String,
    messages: Vec<ChatMessage>,
) -> Result<(), AppError> {
    let record = load_provider(&provider_id)?
        .ok_or_else(|| AppError::Other(format!("Provider '{provider_id}' not found")))?;

    let api_key = match &record.keychain_alias {
        Some(alias) => get_api_key(alias)?,
        None => String::new(), // Ollama — no key needed
    };

    let client = build_client()?;

    let msgs: Vec<serde_json::Value> = messages
        .iter()
        .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
        .collect();

    let result = match record.provider_type.as_str() {
        "ollama" => {
            let url = format!("{}/api/chat", record.base_url.trim_end_matches('/'));
            let body = serde_json::json!({
                "model": model_id,
                "messages": msgs,
                "stream": true
            });
            stream_ollama_ndjson(&on_event, &client, &url, body).await
        }
        "minimax" => {
            let url = format!("{}/v1/messages", record.base_url.trim_end_matches('/'));
            let headers = make_headers(&[
                ("content-type", "application/json"),
                ("authorization", &format!("Bearer {api_key}")),
                ("anthropic-version", "2023-06-01"),
            ])?;
            let body = serde_json::json!({
                "model": model_id,
                "messages": msgs,
                "max_tokens": 4096,
                "stream": true
            });
            stream_anthropic_sse(&on_event, &client, &url, headers, body).await
        }
        _ => {
            // openai-compatible: DeepSeek, Qwen, etc.
            let url = format!("{}/chat/completions", record.base_url.trim_end_matches('/'));
            let headers = make_headers(&[
                ("content-type", "application/json"),
                ("authorization", &format!("Bearer {api_key}")),
            ])?;
            let body = serde_json::json!({
                "model": model_id,
                "messages": msgs,
                "stream": true
            });
            stream_openai_sse(&on_event, &client, &url, headers, body).await
        }
    };

    if let Err(e) = result {
        let _ = on_event.send(StreamEvent::Error {
            message: e.to_string(),
        });
    }

    Ok(())
}

/// Health-check a provider. Returns latency on success or an error message.
#[tauri::command]
pub async fn probe_provider(provider_id: String) -> Result<ProbeResult, AppError> {
    let record = load_provider(&provider_id)?
        .ok_or_else(|| AppError::Other(format!("Provider '{provider_id}' not found")))?;

    let api_key = match &record.keychain_alias {
        Some(alias) => get_api_key(alias).unwrap_or_default(),
        None => String::new(),
    };

    let client = build_client()?;
    let start = std::time::Instant::now();

    let result = match record.provider_type.as_str() {
        "ollama" => {
            let url = format!("{}/api/tags", record.base_url.trim_end_matches('/'));
            client.get(&url).send().await
        }
        "minimax" => {
            // Minimal non-streaming request to verify the key
            let url = format!("{}/v1/messages", record.base_url.trim_end_matches('/'));
            client
                .post(&url)
                .header("authorization", format!("Bearer {api_key}"))
                .header("anthropic-version", "2023-06-01")
                .json(&serde_json::json!({
                    "model": "MiniMax-M2.5",
                    "messages": [{ "role": "user", "content": "hi" }],
                    "max_tokens": 1
                }))
                .send()
                .await
        }
        _ => {
            // OpenAI-compatible: GET /models
            let url = format!("{}/models", record.base_url.trim_end_matches('/'));
            client
                .get(&url)
                .header("authorization", format!("Bearer {api_key}"))
                .send()
                .await
        }
    };

    match result {
        Ok(resp) if resp.status().is_success() => Ok(ProbeResult {
            status: "connected".to_owned(),
            latency_ms: Some(start.elapsed().as_millis() as u64),
            message: None,
        }),
        Ok(resp) => Ok(ProbeResult {
            status: "error".to_owned(),
            latency_ms: None,
            message: Some(format!("HTTP {}", resp.status().as_u16())),
        }),
        Err(e) => Ok(ProbeResult {
            status: "error".to_owned(),
            latency_ms: None,
            message: Some(e.to_string()),
        }),
    }
}

/// List available models for a provider.
/// Ollama: fetches /api/tags. OpenAI-compatible: fetches /models.
/// MiniMax and other fixed-model providers: returns the static list embedded here.
#[tauri::command]
pub async fn list_provider_models(provider_id: String) -> Result<Vec<ModelInfo>, AppError> {
    let record = load_provider(&provider_id)?
        .ok_or_else(|| AppError::Other(format!("Provider '{provider_id}' not found")))?;

    match record.provider_type.as_str() {
        "minimax" => Ok(minimax_static_models()),
        "ollama" => {
            let client = build_client()?;
            let url = format!("{}/api/tags", record.base_url.trim_end_matches('/'));
            let resp = client
                .get(&url)
                .send()
                .await
                .map_err(|e| AppError::Other(e.to_string()))?;
            if !resp.status().is_success() {
                return Ok(vec![]);
            }
            let data: serde_json::Value =
                resp.json().await.map_err(|e| AppError::Other(e.to_string()))?;
            let models = data["models"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|m| m["name"].as_str())
                        .map(|name| ModelInfo {
                            id: name.to_owned(),
                            name: name.to_owned(),
                            context_length: None,
                        })
                        .collect()
                })
                .unwrap_or_default();
            Ok(models)
        }
        _ => {
            // OpenAI-compatible
            let api_key = match &record.keychain_alias {
                Some(alias) => get_api_key(alias).unwrap_or_default(),
                None => String::new(),
            };
            let client = build_client()?;
            let url = format!("{}/models", record.base_url.trim_end_matches('/'));
            let resp = client
                .get(&url)
                .header("authorization", format!("Bearer {api_key}"))
                .send()
                .await
                .map_err(|e| AppError::Other(e.to_string()))?;
            if !resp.status().is_success() {
                return Ok(vec![]);
            }
            let data: serde_json::Value =
                resp.json().await.map_err(|e| AppError::Other(e.to_string()))?;
            let models = data["data"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|m| m["id"].as_str())
                        .map(|id| ModelInfo {
                            id: id.to_owned(),
                            name: id.to_owned(),
                            context_length: None,
                        })
                        .collect()
                })
                .unwrap_or_default();
            Ok(models)
        }
    }
}

/// Validate a provider connection using raw parameters (before it is saved to disk).
/// Used by the "Add Provider" form to test credentials before committing.
#[tauri::command]
pub async fn probe_url(
    provider_type: String,
    base_url: String,
    api_key: String,
) -> Result<ProbeResult, AppError> {
    let client = build_client()?;
    let base = base_url.trim_end_matches('/');
    let start = std::time::Instant::now();

    let result = match provider_type.as_str() {
        "ollama" => {
            client.get(format!("{base}/api/tags")).send().await
        }
        "minimax" => {
            client
                .post(format!("{base}/v1/messages"))
                .header("authorization", format!("Bearer {api_key}"))
                .header("anthropic-version", "2023-06-01")
                .json(&serde_json::json!({
                    "model": "MiniMax-M2.5",
                    "messages": [{ "role": "user", "content": "hi" }],
                    "max_tokens": 1
                }))
                .send()
                .await
        }
        _ => {
            client
                .get(format!("{base}/models"))
                .header("authorization", format!("Bearer {api_key}"))
                .send()
                .await
        }
    };

    match result {
        Ok(resp) if resp.status().is_success() => Ok(ProbeResult {
            status: "connected".to_owned(),
            latency_ms: Some(start.elapsed().as_millis() as u64),
            message: None,
        }),
        Ok(resp) => Ok(ProbeResult {
            status: "error".to_owned(),
            latency_ms: None,
            message: Some(format!("HTTP {}", resp.status().as_u16())),
        }),
        Err(e) => Ok(ProbeResult {
            status: "error".to_owned(),
            latency_ms: None,
            message: Some(e.to_string()),
        }),
    }
}

// ─── Static model lists ───────────────────────────────────────

fn minimax_static_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo {
            id: "MiniMax-M2.5".to_owned(),
            name: "MiniMax M2.5 (~60 tps)".to_owned(),
            context_length: Some(204_800),
        },
        ModelInfo {
            id: "MiniMax-M2.5-highspeed".to_owned(),
            name: "MiniMax M2.5 Highspeed (~100 tps)".to_owned(),
            context_length: Some(204_800),
        },
        ModelInfo {
            id: "MiniMax-M2.1".to_owned(),
            name: "MiniMax M2.1 (~60 tps)".to_owned(),
            context_length: Some(204_800),
        },
        ModelInfo {
            id: "MiniMax-M2.1-highspeed".to_owned(),
            name: "MiniMax M2.1 Highspeed (~100 tps)".to_owned(),
            context_length: Some(204_800),
        },
        ModelInfo {
            id: "MiniMax-M2".to_owned(),
            name: "MiniMax M2 (Agentic)".to_owned(),
            context_length: Some(204_800),
        },
    ]
}
