use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// ─── Types ────────────────────────────────────────────────────

/// Provider config stored on disk (no API keys — those go in keychain).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRecord {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub provider_type: String, // "ollama" | "openai-compatible" | "minimax"
    pub base_url: String,
    /// References the keychain alias; None for Ollama (no key needed).
    pub keychain_alias: Option<String>,
    pub priority: String, // "p0" | "p1" | "p2"
    /// The default model ID selected by the user for this provider.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
}

// ─── Helpers ─────────────────────────────────────────────────

pub fn providers_dir() -> Result<PathBuf, AppError> {
    let home = dirs::home_dir().ok_or_else(|| AppError::Other("Cannot resolve home dir".into()))?;
    Ok(home.join(".mindeck").join("providers"))
}

pub fn provider_path(dir: &PathBuf, id: &str) -> PathBuf {
    dir.join(format!("{}.json", id))
}

// ─── Commands ─────────────────────────────────────────────────

/// Load a single provider by id. Returns None if not found.
pub fn load_provider(id: &str) -> Result<Option<ProviderRecord>, AppError> {
    let dir = providers_dir()?;
    let path = provider_path(&dir, id);
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)?;
    let record: ProviderRecord = serde_json::from_str(&raw)?;
    Ok(Some(record))
}

/// Return all saved provider configs.
#[tauri::command]
pub fn list_providers() -> Result<Vec<ProviderRecord>, AppError> {
    let dir = providers_dir()?;
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut providers = Vec::new();
    for entry in fs::read_dir(&dir)? {
        let path = entry?.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let raw = fs::read_to_string(&path)?;
        let record: ProviderRecord = serde_json::from_str(&raw)?;
        providers.push(record);
    }
    Ok(providers)
}

/// Save (insert or overwrite) a provider config.
#[tauri::command]
pub fn save_provider(record: ProviderRecord) -> Result<(), AppError> {
    let dir = providers_dir()?;
    fs::create_dir_all(&dir)?;
    let path = provider_path(&dir, &record.id);
    let json = serde_json::to_string_pretty(&record)?;
    fs::write(path, json)?;
    Ok(())
}

/// Delete a provider config file.
#[tauri::command]
pub fn delete_provider(id: String) -> Result<(), AppError> {
    let dir = providers_dir()?;
    let path = provider_path(&dir, &id);
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

/// Ensure the ~/.mindeck/ directory tree exists. Call on app startup.
#[tauri::command]
pub fn init_app_dirs() -> Result<(), AppError> {
    let home = dirs::home_dir().ok_or_else(|| AppError::Other("Cannot resolve home dir".into()))?;
    let root = home.join(".mindeck");
    for subdir in &["providers", "workspaces", "super-agent/conversations", "cache"] {
        fs::create_dir_all(root.join(subdir))?;
    }
    Ok(())
}
