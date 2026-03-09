use crate::error::AppError;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

// ─── Helpers ─────────────────────────────────────────────────

fn apps_dir() -> Result<PathBuf, AppError> {
    let home = dirs::home_dir().ok_or_else(|| AppError::Other("Cannot resolve home dir".into()))?;
    Ok(home.join(".mindeck").join("apps"))
}

fn registry_path() -> Result<PathBuf, AppError> {
    Ok(apps_dir()?.join("registry.json"))
}

// ─── Commands ─────────────────────────────────────────────────

/// Load the global Agent App registry from ~/.mindeck/apps/registry.json.
/// Returns an empty array if the file does not exist yet.
#[tauri::command]
pub fn load_app_registry() -> Result<Vec<Value>, AppError> {
    let path = registry_path()?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(&path)?;
    let apps: Vec<Value> = serde_json::from_str(&raw)?;
    Ok(apps)
}

/// Atomically persist the global Agent App registry to ~/.mindeck/apps/registry.json.
#[tauri::command]
pub fn save_app_registry(apps: Vec<Value>) -> Result<(), AppError> {
    let dir = apps_dir()?;
    fs::create_dir_all(&dir)?;
    let path = registry_path()?;
    // Write atomically via temp file
    let tmp = path.with_extension("tmp");
    let contents = serde_json::to_string_pretty(&apps)?;
    fs::write(&tmp, contents)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}
