use crate::commands::keychain::SERVICE_NAME;
use crate::commands::provider::load_provider;
use crate::error::AppError;
use futures_util::StreamExt;
use keyring::Entry;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::str::FromStr;
use tauri::ipc::Channel;

// ─── Stream events ────────────────────────────────────────────

/// Events sent through the Channel back to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum StreamEvent {
    Chunk { delta: String },
    Done,
    Error { message: String },
    ToolCallStart { id: String, name: String },
    ToolCallArgsDelta { id: String, delta: String },
    ToolCallEnd { id: String },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub status: String,
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

// ─── Streaming backends ───────────────────────────────────────

/// Stream OpenAI-format SSE, including tool call fragments.
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
    // index -> (id, name)
    let mut tool_calls: HashMap<usize, (String, String)> = HashMap::new();

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

            if data == "[DONE]" {
                for (_, (id, _)) in tool_calls.drain() {
                    let _ = on_event.send(StreamEvent::ToolCallEnd { id });
                }
                let _ = on_event.send(StreamEvent::Done);
                return Ok(());
            }

            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                let delta = &parsed["choices"][0]["delta"];

                // Text delta
                if let Some(text) = delta["content"].as_str() {
                    if !text.is_empty() {
                        let _ = on_event.send(StreamEvent::Chunk {
                            delta: text.to_owned(),
                        });
                    }
                }

                // Tool call fragments
                if let Some(tcs) = delta["tool_calls"].as_array() {
                    for tc in tcs {
                        let idx = tc["index"].as_u64().unwrap_or(0) as usize;

                        // New call — emit start
                        if let Some(id) = tc["id"].as_str() {
                            let name =
                                tc["function"]["name"].as_str().unwrap_or("").to_owned();
                            tool_calls.insert(idx, (id.to_owned(), name.clone()));
                            let _ = on_event.send(StreamEvent::ToolCallStart {
                                id: id.to_owned(),
                                name,
                            });
                        }

                        // Arguments fragment
                        if let Some(args_delta) = tc["function"]["arguments"].as_str() {
                            if !args_delta.is_empty() {
                                if let Some((id, _)) = tool_calls.get(&idx) {
                                    let _ = on_event.send(StreamEvent::ToolCallArgsDelta {
                                        id: id.clone(),
                                        delta: args_delta.to_owned(),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Stream ended without [DONE] — close any pending tool calls
    for (_, (id, _)) in tool_calls.drain() {
        let _ = on_event.send(StreamEvent::ToolCallEnd { id });
    }
    let _ = on_event.send(StreamEvent::Done);
    Ok(())
}

/// Stream Ollama native NDJSON, including basic tool call detection.
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
                    // Emit tool calls from final done message (Ollama native format)
                    if let Some(tcs) = parsed["message"]["tool_calls"].as_array() {
                        for (idx, tc) in tcs.iter().enumerate() {
                            let id = format!("ollama-tool-{idx}");
                            let name =
                                tc["function"]["name"].as_str().unwrap_or("").to_owned();
                            let args =
                                serde_json::to_string(&tc["function"]["arguments"])
                                    .unwrap_or_default();
                            let _ = on_event.send(StreamEvent::ToolCallStart {
                                id: id.clone(),
                                name,
                            });
                            let _ = on_event.send(StreamEvent::ToolCallArgsDelta {
                                id: id.clone(),
                                delta: args,
                            });
                            let _ = on_event.send(StreamEvent::ToolCallEnd { id });
                        }
                    }
                    let _ = on_event.send(StreamEvent::Done);
                    return Ok(());
                }
            }
        }
    }

    let _ = on_event.send(StreamEvent::Done);
    Ok(())
}

/// Stream Anthropic-format SSE, including tool_use block events.
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
    // block_index -> id
    let mut tool_block_ids: HashMap<u64, String> = HashMap::new();
    let mut thinking_block_indices: HashSet<u64> = HashSet::new();

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

            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                match parsed["type"].as_str() {
                    Some("content_block_start") => {
                        let block = &parsed["content_block"];
                        match block["type"].as_str() {
                            Some("tool_use") => {
                                let id = block["id"].as_str().unwrap_or("").to_owned();
                                let name = block["name"].as_str().unwrap_or("").to_owned();
                                let index = parsed["index"].as_u64().unwrap_or(0);
                                tool_block_ids.insert(index, id.clone());
                                let _ = on_event.send(StreamEvent::ToolCallStart { id, name });
                            }
                            Some("thinking") => {
                                let index = parsed["index"].as_u64().unwrap_or(0);
                                thinking_block_indices.insert(index);
                                let _ = on_event.send(StreamEvent::Chunk {
                                    delta: "<think>".to_owned(),
                                });
                            }
                            _ => {}
                        }
                    }
                    Some("content_block_delta") => {
                        let block_delta = &parsed["delta"];
                        match block_delta["type"].as_str() {
                            Some("text_delta") => {
                                if let Some(text) = block_delta["text"].as_str() {
                                    if !text.is_empty() {
                                        let _ = on_event.send(StreamEvent::Chunk {
                                            delta: text.to_owned(),
                                        });
                                    }
                                }
                            }
                            Some("thinking_delta") => {
                                if let Some(text) = block_delta["thinking"].as_str() {
                                    if !text.is_empty() {
                                        let _ = on_event.send(StreamEvent::Chunk {
                                            delta: text.to_owned(),
                                        });
                                    }
                                }
                            }
                            Some("input_json_delta") => {
                                let index = parsed["index"].as_u64().unwrap_or(0);
                                if let Some(id) = tool_block_ids.get(&index) {
                                    if let Some(delta) =
                                        block_delta["partial_json"].as_str()
                                    {
                                        if !delta.is_empty() {
                                            let _ =
                                                on_event.send(StreamEvent::ToolCallArgsDelta {
                                                    id: id.clone(),
                                                    delta: delta.to_owned(),
                                                });
                                        }
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                    Some("content_block_stop") => {
                        let index = parsed["index"].as_u64().unwrap_or(0);
                        if let Some(id) = tool_block_ids.remove(&index) {
                            let _ = on_event
                                .send(StreamEvent::ToolCallEnd { id });
                        }
                        if thinking_block_indices.remove(&index) {
                            let _ = on_event.send(StreamEvent::Chunk {
                                delta: "</think>".to_owned(),
                            });
                        }
                    }
                    Some("message_stop") => {
                        // Close any pending tool blocks before signalling done
                        for (_, id) in tool_block_ids.drain() {
                            let _ = on_event
                                .send(StreamEvent::ToolCallEnd { id });
                        }
                        let _ = on_event.send(StreamEvent::Done);
                        return Ok(());
                    }
                    _ => {}
                }
            }
        }
    }

    // Stream ended without message_stop — close pending tool blocks
    for (_, id) in tool_block_ids.drain() {
        let _ = on_event.send(StreamEvent::ToolCallEnd { id });
    }
    let _ = on_event.send(StreamEvent::Done);
    Ok(())
}

// ─── Commands ─────────────────────────────────────────────────

/// Stream a chat completion. `messages` and `tools` are pre-formatted by the
/// TypeScript bridge and passed verbatim to the provider API.
#[tauri::command]
pub async fn stream_chat(
    on_event: Channel<StreamEvent>,
    provider_id: String,
    model_id: String,
    messages: Vec<serde_json::Value>,
    tools: Option<serde_json::Value>,
) -> Result<(), AppError> {
    let record = load_provider(&provider_id)?
        .ok_or_else(|| AppError::Other(format!("Provider '{provider_id}' not found")))?;

    let api_key = match &record.keychain_alias {
        Some(alias) => get_api_key(alias)?,
        None => String::new(),
    };

    let client = build_client()?;

    let result = match record.provider_type.as_str() {
        "ollama" => {
            let url = format!("{}/api/chat", record.base_url.trim_end_matches('/'));
            let body = if let Some(ref t) = tools {
                serde_json::json!({
                    "model": model_id,
                    "messages": messages,
                    "stream": true,
                    "tools": t
                })
            } else {
                serde_json::json!({
                    "model": model_id,
                    "messages": messages,
                    "stream": true
                })
            };
            stream_ollama_ndjson(&on_event, &client, &url, body).await
        }
        "minimax" => {
            let url = format!("{}/v1/messages", record.base_url.trim_end_matches('/'));
            let headers = make_headers(&[
                ("content-type", "application/json"),
                ("authorization", &format!("Bearer {api_key}")),
                ("anthropic-version", "2023-06-01"),
            ])?;

            // Anthropic protocol requires system content as a top-level "system"
            // field — system-role messages in the array cause HTTP 400.
            let system_text: String = messages
                .iter()
                .filter(|m| m.get("role").and_then(|r| r.as_str()) == Some("system"))
                .filter_map(|m| m.get("content").and_then(|c| c.as_str()))
                .collect::<Vec<_>>()
                .join("\n\n");
            let chat_messages: Vec<&serde_json::Value> = messages
                .iter()
                .filter(|m| m.get("role").and_then(|r| r.as_str()) != Some("system"))
                .collect();

            let body = match (system_text.is_empty(), &tools) {
                (false, Some(t)) => serde_json::json!({
                    "model": model_id,
                    "system": system_text,
                    "messages": chat_messages,
                    "max_tokens": 4096,
                    "stream": true,
                    "tools": t
                }),
                (false, None) => serde_json::json!({
                    "model": model_id,
                    "system": system_text,
                    "messages": chat_messages,
                    "max_tokens": 4096,
                    "stream": true
                }),
                (true, Some(t)) => serde_json::json!({
                    "model": model_id,
                    "messages": chat_messages,
                    "max_tokens": 4096,
                    "stream": true,
                    "tools": t
                }),
                (true, None) => serde_json::json!({
                    "model": model_id,
                    "messages": chat_messages,
                    "max_tokens": 4096,
                    "stream": true
                }),
            };
            stream_anthropic_sse(&on_event, &client, &url, headers, body).await
        }
        _ => {
            let url = format!("{}/chat/completions", record.base_url.trim_end_matches('/'));
            let headers = make_headers(&[
                ("content-type", "application/json"),
                ("authorization", &format!("Bearer {api_key}")),
            ])?;
            let body = if let Some(ref t) = tools {
                serde_json::json!({
                    "model": model_id,
                    "messages": messages,
                    "stream": true,
                    "tools": t
                })
            } else {
                serde_json::json!({
                    "model": model_id,
                    "messages": messages,
                    "stream": true
                })
            };
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

/// Validate a provider connection using raw parameters.
/// Accepts an optional keychain alias instead of a raw API key.
#[tauri::command]
pub async fn probe_url(
    provider_type: String,
    base_url: String,
    keychain_alias: Option<String>,
) -> Result<ProbeResult, AppError> {
    let client = build_client()?;
    let base = base_url.trim_end_matches('/');
    let start = std::time::Instant::now();

    let api_key = match keychain_alias {
        Some(alias) if !alias.is_empty() => get_api_key(&alias).unwrap_or_default(),
        _ => String::new(),
    };

    let result = match provider_type.as_str() {
        "ollama" => client.get(format!("{base}/api/tags")).send().await,
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

// ─── Legacy type kept for potential future use ────────────────

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}
