use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

#[command]
pub fn list_dir(path: String) -> Result<Vec<FileNode>, String> {
    let dir = Path::new(&path);
    if !dir.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    if !dir.is_dir() {
        return Err(format!("Not a directory: {path}"));
    }

    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;

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
pub fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| format!("Failed to rename: {e}"))
}

#[command]
pub fn create_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dirs: {e}"))?;
    }
    fs::File::create(&path).map_err(|e| format!("Failed to create file: {e}"))?;
    Ok(())
}

#[command]
pub fn create_dir_at(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory: {e}"))
}

#[command]
pub fn delete_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Ok(()); // Already gone
    }
    if p.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| format!("Failed to delete directory: {e}"))
    } else {
        fs::remove_file(&path).map_err(|e| format!("Failed to delete file: {e}"))
    }
}

#[command]
pub async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let folder = app
        .dialog()
        .file()
        .blocking_pick_folder();

    Ok(folder.map(|f| f.to_string()))
}

#[command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file '{path}': {e}"))
}

#[command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent dirs for '{path}': {e}"))?;
    }
    fs::write(&path, content).map_err(|e| format!("Failed to write file '{path}': {e}"))
}
