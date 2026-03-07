use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRecord {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub agent_config: AgentConfig,
    pub layout: WorkspaceLayout,
    pub workspace_type: Option<String>, // "internal" | "linked"
    pub repo_path: Option<String>,
    pub state_summary: Option<String>,
    pub status: String, // "active" | "pending" | "idle"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentConfig {
    pub provider_id: String,
    pub model_id: String,
    pub system_prompt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceLayout {
    pub preview_panel_width: u32,
    pub active_renderer_id: Option<String>,
}

fn workspaces_dir() -> Result<PathBuf, AppError> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Other("Cannot resolve home dir".into()))?;
    Ok(home.join(".mindeck").join("workspaces"))
}

fn workspace_dir(base: &PathBuf, id: &str) -> PathBuf {
    base.join(id)
}

fn workspace_path(base: &PathBuf, id: &str) -> PathBuf {
    workspace_dir(base, id).join("workspace.json")
}

#[tauri::command]
pub fn list_workspaces() -> Result<Vec<WorkspaceRecord>, AppError> {
    let dir = workspaces_dir()?;
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut workspaces = Vec::new();
    for entry in fs::read_dir(&dir)? {
        let path = entry?.path();
        if !path.is_dir() {
            continue;
        }
        let meta_path = path.join("workspace.json");
        if !meta_path.exists() {
            continue;
        }
        let raw = fs::read_to_string(&meta_path)?;
        let record: WorkspaceRecord = serde_json::from_str(&raw)?;
        workspaces.push(record);
    }
    // Sort by updatedAt descending
    workspaces.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(workspaces)
}

#[tauri::command]
pub fn create_workspace(record: WorkspaceRecord) -> Result<(), AppError> {
    let base = workspaces_dir()?;
    let ws_dir = workspace_dir(&base, &record.id);
    // Create workspace directory tree
    for sub in &["conversations", "knowledge/documents", "knowledge/index", "outputs", "files"] {
        fs::create_dir_all(ws_dir.join(sub))?;
    }
    let json = serde_json::to_string_pretty(&record)?;
    fs::write(workspace_path(&base, &record.id), json)?;
    Ok(())
}

#[tauri::command]
pub fn update_workspace(record: WorkspaceRecord) -> Result<(), AppError> {
    let base = workspaces_dir()?;
    let path = workspace_path(&base, &record.id);
    if !path.exists() {
        return Err(AppError::Other(format!("Workspace {} not found", record.id)));
    }
    let json = serde_json::to_string_pretty(&record)?;
    fs::write(path, json)?;
    Ok(())
}

#[tauri::command]
pub fn delete_workspace(id: String) -> Result<(), AppError> {
    let base = workspaces_dir()?;
    let ws_dir = workspace_dir(&base, &id);
    if ws_dir.exists() {
        fs::remove_dir_all(ws_dir)?;
    }
    Ok(())
}
