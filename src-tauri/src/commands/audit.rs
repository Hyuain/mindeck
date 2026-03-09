use crate::error::AppError;
use serde_json::Value;
use std::io::Write;

fn audit_log_path() -> Result<std::path::PathBuf, AppError> {
    let home =
        dirs::home_dir().ok_or_else(|| AppError::Other("Cannot resolve home dir".into()))?;
    Ok(home.join(".mindeck").join("audit.jsonl"))
}

/// Append a JSON event to ~/.mindeck/audit.jsonl.
/// Creates the file (and parent dirs) if they do not exist.
#[tauri::command]
pub async fn append_audit_event(event: Value) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = audit_log_path()?;

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
