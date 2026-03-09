use crate::error::AppError;

fn scripts_dir() -> Result<std::path::PathBuf, AppError> {
    let home =
        dirs::home_dir().ok_or_else(|| AppError::Other("Cannot resolve home dir".into()))?;
    let dir = home.join(".mindeck").join("scripts");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// List all *.ts files in ~/.mindeck/scripts/.
#[tauri::command]
pub async fn list_scripts() -> Result<Vec<String>, AppError> {
    tauri::async_runtime::spawn_blocking(|| {
        let dir = scripts_dir()?;
        let mut paths = Vec::new();
        for entry in std::fs::read_dir(&dir)?.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("ts") {
                paths.push(path.to_string_lossy().to_string());
            }
        }
        paths.sort();
        Ok(paths)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task join error: {e}")))?
}

/// Read the content of a script file.
#[tauri::command]
pub async fn read_script(path: String) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::read_to_string(&path).map_err(|e| AppError::Other(e.to_string()))
    })
    .await
    .map_err(|e| AppError::Other(format!("Task join error: {e}")))?
}

/// Write content to a script file (creates if not exists).
#[tauri::command]
pub async fn write_script(path: String, content: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        // Ensure parent directory exists
        if let Some(parent) = std::path::Path::new(&path).parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&path, &content).map_err(|e| AppError::Other(e.to_string()))
    })
    .await
    .map_err(|e| AppError::Other(format!("Task join error: {e}")))?
}

/// Delete a script file.
#[tauri::command]
pub async fn delete_script(path: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::remove_file(&path).map_err(|e| AppError::Other(e.to_string()))
    })
    .await
    .map_err(|e| AppError::Other(format!("Task join error: {e}")))?
}
