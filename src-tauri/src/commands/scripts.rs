use crate::error::AppError;

fn scripts_dir() -> Result<std::path::PathBuf, AppError> {
    let home =
        dirs::home_dir().ok_or_else(|| AppError::Other("Cannot resolve home dir".into()))?;
    let dir = home.join(".mindeck").join("scripts");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Sanitize a filename: reject path separators and traversal components.
fn safe_filename(name: &str) -> Result<&str, AppError> {
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name == "."
        || name == ".."
        || name.contains('\0')
    {
        return Err(AppError::Other(format!(
            "Invalid script filename: '{name}'"
        )));
    }
    Ok(name)
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

/// Read the content of a script file by filename (not full path).
#[tauri::command]
pub async fn read_script(filename: String) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let name = safe_filename(&filename)?;
        let path = scripts_dir()?.join(name);
        std::fs::read_to_string(&path).map_err(AppError::Io)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task join error: {e}")))?
}

/// Write content to a script file by filename (creates if not exists).
#[tauri::command]
pub async fn write_script(filename: String, content: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let name = safe_filename(&filename)?;
        let path = scripts_dir()?.join(name);
        std::fs::write(&path, &content).map_err(AppError::Io)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task join error: {e}")))?
}

/// Delete a script file by filename.
#[tauri::command]
pub async fn delete_script(filename: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let name = safe_filename(&filename)?;
        let path = scripts_dir()?.join(name);
        std::fs::remove_file(&path).map_err(AppError::Io)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task join error: {e}")))?
}
