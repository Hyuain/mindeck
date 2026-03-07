use crate::error::AppError;
use keyring::Entry;

pub const SERVICE_NAME: &str = "app.mindeck";

/// Store an API key in the OS keychain.
/// `alias` is the provider id, e.g. "deepseek" or "qwen".
#[tauri::command]
pub fn set_api_key(alias: String, key: String) -> Result<(), AppError> {
    let entry = Entry::new(SERVICE_NAME, &alias)
        .map_err(|e| AppError::Keychain(e.to_string()))?;
    entry
        .set_password(&key)
        .map_err(|e| AppError::Keychain(e.to_string()))
}

/// Retrieve an API key from the OS keychain.
#[tauri::command]
pub fn get_api_key(alias: String) -> Result<String, AppError> {
    let entry = Entry::new(SERVICE_NAME, &alias)
        .map_err(|e| AppError::Keychain(e.to_string()))?;
    entry
        .get_password()
        .map_err(|e| AppError::Keychain(e.to_string()))
}

/// Delete an API key from the OS keychain.
#[tauri::command]
pub fn delete_api_key(alias: String) -> Result<(), AppError> {
    let entry = Entry::new(SERVICE_NAME, &alias)
        .map_err(|e| AppError::Keychain(e.to_string()))?;
    entry
        .delete_credential()
        .map_err(|e| AppError::Keychain(e.to_string()))
}
