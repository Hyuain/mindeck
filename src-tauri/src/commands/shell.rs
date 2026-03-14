use crate::error::AppError;
use serde::Serialize;
use std::process::Command;
use tauri::command;
use tauri::ipc::Channel;

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
pub async fn bash_exec(command: String, cwd: Option<String>) -> Result<BashOutput, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new("sh");
        cmd.arg("-c").arg(&command);

        if let Some(dir) = cwd {
            cmd.current_dir(&dir);
        }

        let output = cmd.output().map_err(AppError::Io)?;

        Ok(BashOutput {
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            exit_code: output.status.code().unwrap_or(-1),
        })
    })
    .await
    .map_err(|e| AppError::Other(format!("Task join error: {e}")))?
}

/// Streaming variant: emits lines of stdout/stderr through a Channel.
/// Returns when the process exits.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BashChunkEvent {
    Stdout { data: String },
    Stderr { data: String },
    Exit { code: i32 },
}

#[command]
pub async fn bash_exec_stream(
    command: String,
    cwd: Option<String>,
    on_event: Channel<BashChunkEvent>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::{BufRead, BufReader};
        use std::process::Stdio;

        let mut cmd = Command::new("sh");
        cmd.arg("-c")
            .arg(&command)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(dir) = &cwd {
            cmd.current_dir(dir);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| AppError::Other(format!("Failed to spawn process: {e}")))?;

        let stderr_handle = child.stderr.take();
        let stdout_handle = child.stdout.take();

        // Spawn a thread to drain stderr concurrently to avoid pipe buffer deadlock
        let on_event_clone = on_event.clone();
        let stderr_thread = std::thread::spawn(move || {
            if let Some(stderr) = stderr_handle {
                for line in BufReader::new(stderr).lines() {
                    if let Ok(data) = line {
                        on_event_clone.send(BashChunkEvent::Stderr { data }).ok();
                    }
                }
            }
        });

        // Read stdout on the current thread
        if let Some(stdout) = stdout_handle {
            for line in BufReader::new(stdout).lines() {
                match line {
                    Ok(data) => {
                        on_event.send(BashChunkEvent::Stdout { data }).ok();
                    }
                    Err(e) => {
                        on_event
                            .send(BashChunkEvent::Stderr {
                                data: format!("stdout read error: {e}"),
                            })
                            .ok();
                    }
                }
            }
        }

        // Wait for the stderr thread to finish
        let _ = stderr_thread.join();

        let exit_code = child
            .wait()
            .map(|s| s.code().unwrap_or(-1))
            .unwrap_or(-1);

        on_event.send(BashChunkEvent::Exit { code: exit_code }).ok();
        Ok(())
    })
    .await
    .map_err(|e| AppError::Other(format!("Task join error: {e}")))?
}
