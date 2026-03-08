use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedEvent {
    pub id: String,
    pub event_type: String,
    pub payload: serde_json::Value,
    pub created_at: i64,
}

fn events_dir() -> Result<PathBuf, AppError> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Other("Cannot resolve home dir".into()))?;
    let dir = home.join(".mindeck").join("events");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn events_jsonl_path(workspace_id: &str) -> Result<PathBuf, AppError> {
    Ok(events_dir()?.join(format!("{}.jsonl", workspace_id)))
}

fn processed_path(workspace_id: &str) -> Result<PathBuf, AppError> {
    Ok(events_dir()?.join(format!("{}.processed", workspace_id)))
}

/// Append a new event to ~/.mindeck/events/{workspace_id}.jsonl
#[tauri::command]
pub fn append_event(workspace_id: String, event: PersistedEvent) -> Result<(), AppError> {
    let path = events_jsonl_path(&workspace_id)?;
    let mut file = OpenOptions::new().create(true).append(true).open(&path)?;
    let line = serde_json::to_string(&event)?;
    writeln!(file, "{}", line)?;
    Ok(())
}

/// Load unprocessed events for a workspace created within the last 24 hours.
#[tauri::command]
pub fn load_pending_events(workspace_id: String) -> Result<Vec<PersistedEvent>, AppError> {
    let events_path = events_jsonl_path(&workspace_id)?;
    if !events_path.exists() {
        return Ok(vec![]);
    }

    // Cutoff: now - 24h in Unix ms
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let cutoff_ms = now_ms - 24 * 60 * 60 * 1000;

    // Collect processed IDs
    let processed = load_processed_ids(&workspace_id)?;

    // Read and filter events
    let file = fs::File::open(&events_path)?;
    let reader = BufReader::new(file);
    let mut pending = Vec::new();

    for line in reader.lines() {
        let line = line?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Ok(event) = serde_json::from_str::<PersistedEvent>(trimmed) {
            if event.created_at >= cutoff_ms && !processed.contains(&event.id) {
                pending.push(event);
            }
        }
    }

    Ok(pending)
}

/// Mark an event as processed (appends ID to .processed file).
#[tauri::command]
pub fn mark_event_processed(workspace_id: String, event_id: String) -> Result<(), AppError> {
    let path = processed_path(&workspace_id)?;
    let mut file = OpenOptions::new().create(true).append(true).open(&path)?;
    writeln!(file, "{}", event_id)?;
    Ok(())
}

fn load_processed_ids(workspace_id: &str) -> Result<HashSet<String>, AppError> {
    let path = processed_path(workspace_id)?;
    if !path.exists() {
        return Ok(HashSet::new());
    }
    let file = fs::File::open(&path)?;
    let reader = BufReader::new(file);
    let mut ids = HashSet::new();
    for line in reader.lines() {
        let line = line?;
        let trimmed = line.trim().to_string();
        if !trimmed.is_empty() {
            ids.insert(trimmed);
        }
    }
    Ok(ids)
}
