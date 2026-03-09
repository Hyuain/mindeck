use crate::error::AppError;
use serde_json::Value;
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};

fn today_date_string() -> String {
    // Compute YYYY-MM-DD from seconds since epoch (UTC)
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let days_since_epoch = secs / 86400;
    // Use a fixed epoch offset (2000-01-01 = day 10957 since 1970-01-01)
    let y2k_days: u64 = 10957;
    let days_from_y2k = days_since_epoch.saturating_sub(y2k_days);
    // Simple Gregorian calc
    let mut year = 2000u64;
    let mut remaining = days_from_y2k;
    loop {
        let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
        let days_in_year: u64 = if leap { 366 } else { 365 };
        if remaining < days_in_year {
            break;
        }
        remaining -= days_in_year;
        year += 1;
    }
    let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    let month_days: [u64; 12] = if leap {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut month = 1u64;
    for &md in &month_days {
        if remaining < md {
            break;
        }
        remaining -= md;
        month += 1;
    }
    let day = remaining + 1;
    format!("{year:04}-{month:02}-{day:02}")
}

fn metrics_log_path() -> Result<std::path::PathBuf, AppError> {
    let home =
        dirs::home_dir().ok_or_else(|| AppError::Other("Cannot resolve home dir".into()))?;
    let today = today_date_string();
    Ok(home.join(".mindeck").join("metrics").join(format!("{today}.jsonl")))
}

/// Append a metric event JSON line to ~/.mindeck/metrics/{date}.jsonl.
#[tauri::command]
pub async fn append_metric_event(event: Value) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = metrics_log_path()?;

        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let mut line =
            serde_json::to_string(&event).map_err(|e| AppError::Other(e.to_string()))?;
        line.push('\n');

        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)?;

        file.write_all(line.as_bytes())?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::Other(format!("Task join error: {e}")))?
}

/// Load metric events from ~/.mindeck/metrics/ files at or after since_iso date.
#[tauri::command]
pub async fn load_metric_events(since_iso: String) -> Result<Vec<Value>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let home =
            dirs::home_dir().ok_or_else(|| AppError::Other("Cannot resolve home dir".into()))?;
        let metrics_dir = home.join(".mindeck").join("metrics");

        if !metrics_dir.exists() {
            return Ok(vec![]);
        }

        // Parse date prefix from since_iso (first 10 chars: YYYY-MM-DD)
        let since_date = since_iso.get(..10).unwrap_or("2000-01-01").to_string();

        let mut events: Vec<Value> = Vec::new();

        let entries = std::fs::read_dir(&metrics_dir)
            .map_err(|e| AppError::Other(e.to_string()))?;

        for entry in entries.flatten() {
            let fname = entry.file_name();
            let fname_str = fname.to_string_lossy();
            // Only process YYYY-MM-DD.jsonl files that are >= since_date
            if !fname_str.ends_with(".jsonl") {
                continue;
            }
            let date_part = fname_str.trim_end_matches(".jsonl");
            if date_part < since_date.as_str() {
                continue;
            }

            let content = std::fs::read_to_string(entry.path())
                .unwrap_or_default();
            for line in content.lines() {
                if let Ok(val) = serde_json::from_str::<Value>(line) {
                    events.push(val);
                }
            }
        }

        Ok(events)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task join error: {e}")))?
}
