use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// ─── Types ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRecord {
    pub id: String,
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<String>>,
    pub created_at: String,
    pub updated_at: String,
}

// ─── Helpers ──────────────────────────────────────────────────

fn skills_dir() -> Result<PathBuf, AppError> {
    let home =
        dirs::home_dir().ok_or_else(|| AppError::Other("Cannot resolve home dir".into()))?;
    Ok(home.join(".mindeck").join("skills"))
}

fn skill_path(dir: &PathBuf, id: &str) -> PathBuf {
    dir.join(format!("{id}.json"))
}

// ─── Commands ─────────────────────────────────────────────────

/// Return all saved skills.
#[tauri::command]
pub fn list_skills() -> Result<Vec<SkillRecord>, AppError> {
    let dir = skills_dir()?;
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut skills = Vec::new();
    for entry in fs::read_dir(&dir)? {
        let path = entry?.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let raw = fs::read_to_string(&path)?;
        let record: SkillRecord = serde_json::from_str(&raw)?;
        skills.push(record);
    }
    Ok(skills)
}

/// Save (insert or overwrite) a skill.
#[tauri::command]
pub fn save_skill(record: SkillRecord) -> Result<(), AppError> {
    let dir = skills_dir()?;
    fs::create_dir_all(&dir)?;
    let path = skill_path(&dir, &record.id);
    let json = serde_json::to_string_pretty(&record)?;
    fs::write(path, json)?;
    Ok(())
}

/// Delete a skill config file.
#[tauri::command]
pub fn delete_skill(id: String) -> Result<(), AppError> {
    let dir = skills_dir()?;
    let path = skill_path(&dir, &id);
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}
