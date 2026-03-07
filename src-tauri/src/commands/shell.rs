use serde::Serialize;
use std::process::Command;
use tauri::command;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BashOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

/// Execute a shell command and return stdout/stderr/exit_code.
/// The frontend must show a confirmation dialog before calling this command.
#[command]
pub async fn bash_exec(command: String, cwd: Option<String>) -> Result<BashOutput, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new("sh");
        cmd.arg("-c").arg(&command);

        if let Some(dir) = cwd {
            cmd.current_dir(&dir);
        }

        let output = cmd
            .output()
            .map_err(|e| format!("Failed to execute command: {e}"))?;

        Ok(BashOutput {
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            exit_code: output.status.code().unwrap_or(-1),
        })
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}
