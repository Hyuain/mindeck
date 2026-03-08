use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

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

/// Get the current time as an ISO 8601 UTC timestamp string.
/// Uses the Gregorian calendar algorithm without external dependencies.
fn now_timestamp() -> String {
    let total_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let time_secs = total_secs % 86400;
    let h = time_secs / 3600;
    let min = (time_secs % 3600) / 60;
    let s = time_secs % 60;

    // Convert days since 1970-01-01 to year/month/day (Gregorian)
    let mut remaining_days = total_secs / 86400;
    let mut year = 1970u32;
    loop {
        let days_in_year = if is_leap_year(year) { 366 } else { 365 };
        if remaining_days < days_in_year {
            break;
        }
        remaining_days -= days_in_year;
        year += 1;
    }
    let leap = is_leap_year(year);
    let month_lengths: [u64; 12] = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut month = 1u32;
    for &ml in &month_lengths {
        if remaining_days < ml {
            break;
        }
        remaining_days -= ml;
        month += 1;
    }
    let day = remaining_days + 1;

    format!("{year:04}-{month:02}-{day:02}T{h:02}:{min:02}:{s:02}Z")
}

fn is_leap_year(year: u32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}
fn slugify(s: &str) -> String {
    let slug: String = s
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect();
    // Collapse multiple hyphens and trim leading/trailing
    let slug = slug
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    slug
}

/// Extract a value for `key:` from SKILL.md frontmatter (first match only).
fn extract_frontmatter_field(fm: &str, key: &str) -> Option<String> {
    for line in fm.lines() {
        let trimmed = line.trim();
        let prefix = format!("{key}:");
        if let Some(rest) = trimmed.strip_prefix(&prefix) {
            let val = rest.trim().trim_matches('"').trim_matches('\'');
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}

/// Parse a minimal SKILL.md file into a SkillRecord.
/// Only extracts: name, description — used for listing (not full load).
fn parse_skill_md_minimal(content: &str, id: &str) -> SkillRecord {
    let now = now_timestamp();

    // Split on --- delimiters
    let trimmed = content.trim_start();
    let (fm, body) = if trimmed.starts_with("---") {
        let after = &trimmed[3..];
        if let Some(end_idx) = after.find("\n---") {
            let fm = &after[..end_idx];
            let body = after[end_idx + 4..].trim_start();
            (fm.to_string(), body.to_string())
        } else {
            (String::new(), content.to_string())
        }
    } else {
        (String::new(), content.to_string())
    };

    let name = extract_frontmatter_field(&fm, "name")
        .unwrap_or_else(|| {
            id.split('-')
                .map(|w| {
                    let mut c = w.chars();
                    match c.next() {
                        None => String::new(),
                        Some(f) => f.to_uppercase().to_string() + c.as_str(),
                    }
                })
                .collect::<Vec<_>>()
                .join(" ")
        });
    let description = extract_frontmatter_field(&fm, "description").unwrap_or_default();
    let system_prompt = body.trim().to_string();

    SkillRecord {
        id: id.to_string(),
        name,
        description,
        system_prompt,
        tools: None,
        created_at: now.clone(),
        updated_at: now,
    }
}

// ─── Commands ─────────────────────────────────────────────────

/// Return all saved skills (JSON files + SKILL.md subdirectories).
#[tauri::command]
pub fn list_skills() -> Result<Vec<SkillRecord>, AppError> {
    let dir = skills_dir()?;
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut skills = Vec::new();
    for entry in fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        if path.is_dir() {
            // Check for {name}/SKILL.md
            let skill_md = path.join("SKILL.md");
            if skill_md.exists() {
                let raw = fs::read_to_string(&skill_md)?;
                let id = slugify(&name);
                let record = parse_skill_md_minimal(&raw, &id);
                skills.push(record);
            }
        } else if path.extension().and_then(|e| e.to_str()) == Some("json") {
            // Legacy {id}.json
            let raw = fs::read_to_string(&path)?;
            match serde_json::from_str::<SkillRecord>(&raw) {
                Ok(record) => skills.push(record),
                Err(_) => continue,
            }
        }
    }
    Ok(skills)
}

/// Save (insert or overwrite) a skill as JSON.
#[tauri::command]
pub fn save_skill(record: SkillRecord) -> Result<(), AppError> {
    let dir = skills_dir()?;
    fs::create_dir_all(&dir)?;
    let path = skill_path(&dir, &record.id);
    let json = serde_json::to_string_pretty(&record)?;
    fs::write(path, json)?;
    Ok(())
}

/// Save a skill as a SKILL.md file in a named subdirectory.
/// Writes to ~/.mindeck/skills/{name}/SKILL.md
#[tauri::command]
pub fn save_skill_md(name: String, content: String) -> Result<(), AppError> {
    let dir = skills_dir()?;
    let skill_dir = dir.join(&name);
    fs::create_dir_all(&skill_dir)?;
    let path = skill_dir.join("SKILL.md");
    fs::write(path, content)?;
    Ok(())
}

/// Delete a skill config file or directory.
#[tauri::command]
pub fn delete_skill(id: String) -> Result<(), AppError> {
    let dir = skills_dir()?;

    // Try JSON file first
    let json_path = skill_path(&dir, &id);
    if json_path.exists() {
        fs::remove_file(json_path)?;
        return Ok(());
    }

    // Try SKILL.md subdirectory (id matches slugified dir name)
    for entry in fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            let dir_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");
            if slugify(dir_name) == id {
                fs::remove_dir_all(&path)?;
                return Ok(());
            }
        }
    }

    Ok(())
}
