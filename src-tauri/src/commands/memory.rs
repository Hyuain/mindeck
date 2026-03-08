use crate::error::AppError;
use std::fs;
use std::path::PathBuf;

fn workspace_memory_path(workspace_id: &str) -> Result<PathBuf, AppError> {
    let home =
        dirs::home_dir().ok_or_else(|| AppError::Other("Cannot resolve home dir".into()))?;
    Ok(home
        .join(".mindeck")
        .join("workspaces")
        .join(workspace_id)
        .join("memory.md"))
}

/// Read the workspace memory file. Returns empty string if not found.
#[tauri::command]
pub fn read_workspace_memory(workspace_id: String) -> Result<String, AppError> {
    let path = workspace_memory_path(&workspace_id)?;
    if !path.exists() {
        return Ok(String::new());
    }
    let content = std::fs::read_to_string(&path)?;
    Ok(content)
}

/// Write the workspace memory file, creating parent directories as needed.
#[tauri::command]
pub fn save_workspace_memory(workspace_id: String, content: String) -> Result<(), AppError> {
    let path = workspace_memory_path(&workspace_id)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content)?;
    Ok(())
}
