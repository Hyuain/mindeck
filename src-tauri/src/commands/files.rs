use crate::error::AppError;
use crate::path_guard::confine_path;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::Path;
use tauri::command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

#[command]
pub fn list_dir(path: String) -> Result<Vec<FileNode>, AppError> {
    let safe_path = confine_path(&path)?;
    let dir = safe_path.as_path();
    if !dir.exists() {
        return Err(AppError::Other(format!("Path does not exist: {path}")));
    }
    if !dir.is_dir() {
        return Err(AppError::Other(format!("Not a directory: {path}")));
    }

    let entries = fs::read_dir(dir)?;

    let mut nodes: Vec<FileNode> = entries
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let p = entry.path();
            let name = p.file_name()?.to_string_lossy().to_string();
            // Skip hidden files (starting with .)
            if name.starts_with('.') {
                return None;
            }
            let is_dir = p.is_dir();
            let size = if is_dir {
                None
            } else {
                entry.metadata().ok().map(|m| m.len())
            };
            Some(FileNode {
                path: p.to_string_lossy().to_string(),
                name,
                is_dir,
                size,
            })
        })
        .collect();

    // Sort: directories first, then files, both alphabetically
    nodes.sort_by(|a, b| {
        if a.is_dir == b.is_dir {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        } else if a.is_dir {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    Ok(nodes)
}

#[command]
pub fn rename_path(old_path: String, new_path: String) -> Result<(), AppError> {
    let safe_old = confine_path(&old_path)?;
    let safe_new = confine_path(&new_path)?;
    fs::rename(&safe_old, &safe_new).map_err(AppError::Io)
}

#[command]
pub fn create_file(path: String) -> Result<(), AppError> {
    let safe_path = confine_path(&path)?;
    if let Some(parent) = safe_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::File::create(&safe_path)?;
    Ok(())
}

#[command]
pub fn create_dir_at(path: String) -> Result<(), AppError> {
    let safe_path = confine_path(&path)?;
    fs::create_dir_all(&safe_path).map_err(AppError::Io)
}

#[command]
pub fn delete_path(path: String) -> Result<(), AppError> {
    let safe_path = confine_path(&path)?;
    if !safe_path.exists() {
        return Ok(()); // Already gone
    }
    if safe_path.is_dir() {
        fs::remove_dir_all(&safe_path).map_err(AppError::Io)
    } else {
        fs::remove_file(&safe_path).map_err(AppError::Io)
    }
}

#[command]
pub async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, AppError> {
    use tauri_plugin_dialog::DialogExt;

    let folder = app
        .dialog()
        .file()
        .blocking_pick_folder();

    Ok(folder.map(|f| f.to_string()))
}

#[command]
pub fn read_file(path: String) -> Result<String, AppError> {
    let safe_path = confine_path(&path)?;
    fs::read_to_string(&safe_path).map_err(AppError::Io)
}

#[command]
pub fn write_file(path: String, content: String) -> Result<(), AppError> {
    let safe_path = confine_path(&path)?;
    if let Some(parent) = safe_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&safe_path, content).map_err(AppError::Io)
}

/// Append a batch of pre-formatted log lines to ~/.mindeck/logs/mindeck.log.
/// Each line should already include a trailing newline.
#[command]
pub fn append_log_batch(lines: Vec<String>) -> Result<(), AppError> {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    let log_dir = Path::new(&home).join(".mindeck").join("logs");
    fs::create_dir_all(&log_dir)?;
    let log_path = log_dir.join("mindeck.log");
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)?;
    for line in &lines {
        file.write_all(line.as_bytes())?;
    }
    Ok(())
}
