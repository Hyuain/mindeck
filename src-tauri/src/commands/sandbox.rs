use crate::error::AppError;
use serde::Serialize;
use std::process::Command;
use tauri::ipc::Channel;

/// Check whether Docker is available on this machine.
#[tauri::command]
pub async fn check_docker() -> Result<bool, AppError> {
    tauri::async_runtime::spawn_blocking(|| {
        let output = Command::new("docker").arg("info").output();
        match output {
            Ok(o) => Ok(o.status.success()),
            Err(_) => Ok(false),
        }
    })
    .await
    .map_err(|e| AppError::Other(format!("Task join error: {e}")))?
}

/// Start a Docker container with the workspace directory bind-mounted.
/// Returns the container ID.
#[tauri::command]
pub async fn docker_start(
    image: String,
    workspace_path: String,
    network_mode: String,
    cpus: f64,
    memory_mb: u64,
) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let mem_arg = format!("{memory_mb}m");
        let cpus_arg = cpus.to_string();

        // Validate workspace_path contains no colons to prevent mount injection
        if workspace_path.contains(':') {
            return Err(AppError::Other(
                "workspace_path must not contain ':' characters".into(),
            ));
        }

        let mount_src = format!("type=bind,src={workspace_path},dst=/workspace");

        let output = Command::new("docker")
            .args([
                "run",
                "-d",
                "--rm",
                "--network",
                &network_mode,
                "--cpus",
                &cpus_arg,
                "--memory",
                &mem_arg,
                "--mount",
                &mount_src,
                "-w",
                "/workspace",
                &image,
                // Keep container alive with a blocking command
                "tail",
                "-f",
                "/dev/null",
            ])
            .output()
            .map_err(|e| AppError::Other(format!("docker run failed: {e}")))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(AppError::Other(format!("docker run error: {stderr}")));
        }

        let container_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(container_id)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task join error: {e}")))?
}

/// Streaming output event for docker exec.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum DockerChunkEvent {
    Stdout { data: String },
    Stderr { data: String },
    Exit { code: i32 },
}

/// Execute a shell command inside a running Docker container, streaming output.
#[tauri::command]
pub async fn docker_exec(
    container_id: String,
    command: String,
    cwd: Option<String>,
    on_event: Channel<DockerChunkEvent>,
) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::{BufRead, BufReader};
        use std::process::Stdio;

        let mut args = vec!["exec".to_string(), container_id.clone()];

        if let Some(ref dir) = cwd {
            // Override the working directory inside the container
            args.extend(["--workdir".to_string(), dir.clone()]);
        }

        args.extend(["sh".to_string(), "-c".to_string(), command]);

        let mut child = Command::new("docker")
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| AppError::Other(format!("docker exec spawn error: {e}")))?;

        if let Some(stdout) = child.stdout.take() {
            for line in BufReader::new(stdout).lines() {
                match line {
                    Ok(data) => { on_event.send(DockerChunkEvent::Stdout { data }).ok(); }
                    Err(e) => {
                        on_event.send(DockerChunkEvent::Stderr { data: format!("stdout err: {e}") }).ok();
                    }
                }
            }
        }

        if let Some(stderr) = child.stderr.take() {
            for line in BufReader::new(stderr).lines() {
                if let Ok(data) = line {
                    on_event.send(DockerChunkEvent::Stderr { data }).ok();
                }
            }
        }

        let code = child.wait().map(|s| s.code().unwrap_or(-1)).unwrap_or(-1);
        on_event.send(DockerChunkEvent::Exit { code }).ok();
        Ok(())
    })
    .await
    .map_err(|e| AppError::Other(format!("Task join error: {e}")))?
}

/// Stop and remove a Docker container.
#[tauri::command]
pub async fn docker_stop(container_id: String) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        Command::new("docker")
            .args(["rm", "-f", &container_id])
            .output()
            .map_err(|e| AppError::Other(format!("docker rm failed: {e}")))?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::Other(format!("Task join error: {e}")))?
}
