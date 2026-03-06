use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonlMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub model: Option<String>,
    pub provider_id: Option<String>,
    pub timestamp: String,
    pub metadata: Option<serde_json::Value>,
}

fn conversations_dir(workspace_id: &str) -> Result<PathBuf, AppError> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Other("Cannot resolve home dir".into()))?;
    Ok(home
        .join(".mindeck")
        .join("workspaces")
        .join(workspace_id)
        .join("conversations"))
}

fn main_jsonl(workspace_id: &str) -> Result<PathBuf, AppError> {
    Ok(conversations_dir(workspace_id)?.join("main.jsonl"))
}

/// Load the last `limit` messages from the workspace's main.jsonl.
#[tauri::command]
pub fn load_messages(workspace_id: String, limit: usize) -> Result<Vec<JsonlMessage>, AppError> {
    let path = main_jsonl(&workspace_id)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let file = fs::File::open(&path)?;
    let reader = BufReader::new(file);
    let mut messages: Vec<JsonlMessage> = Vec::new();
    for line in reader.lines() {
        let line = line?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Ok(msg) = serde_json::from_str::<JsonlMessage>(trimmed) {
            messages.push(msg);
        }
    }
    // Return only the last `limit` entries
    let start = if messages.len() > limit {
        messages.len() - limit
    } else {
        0
    };
    Ok(messages[start..].to_vec())
}

/// Append a single message to the workspace's main.jsonl.
#[tauri::command]
pub fn append_message(workspace_id: String, message: JsonlMessage) -> Result<(), AppError> {
    let path = main_jsonl(&workspace_id)?;
    // Ensure parent exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut file = OpenOptions::new().create(true).append(true).open(&path)?;
    let line = serde_json::to_string(&message)?;
    writeln!(file, "{}", line)?;
    Ok(())
}

/// Clear all messages for a workspace (renames to .bak first).
#[tauri::command]
pub fn clear_messages(workspace_id: String) -> Result<(), AppError> {
    let path = main_jsonl(&workspace_id)?;
    if path.exists() {
        let bak = path.with_extension("jsonl.bak");
        fs::rename(&path, &bak)?;
    }
    Ok(())
}
