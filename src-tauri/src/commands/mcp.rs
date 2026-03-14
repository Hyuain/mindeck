use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{command, State};

// ─── Managed state ───────────────────────────────────────────

pub struct McpProcessRegistry {
    pub processes: Mutex<HashMap<String, Arc<Mutex<McpProcess>>>>,
}

impl McpProcessRegistry {
    pub fn new() -> Self {
        Self {
            processes: Mutex::new(HashMap::new()),
        }
    }
}

pub struct McpProcess {
    _child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
}

// ─── JSON-RPC helpers ────────────────────────────────────────

#[derive(Serialize)]
struct JsonRpcRequest<'a> {
    jsonrpc: &'static str,
    id: u64,
    method: &'a str,
    params: serde_json::Value,
}

#[derive(Deserialize)]
struct JsonRpcResponse {
    #[allow(dead_code)]
    id: Option<serde_json::Value>,
    result: Option<serde_json::Value>,
    error: Option<JsonRpcErrorObj>,
}

#[derive(Deserialize)]
struct JsonRpcErrorObj {
    message: String,
}

fn send_request(
    proc: &mut McpProcess,
    method: &str,
    params: serde_json::Value,
) -> Result<u64, AppError> {
    let id = proc.next_id;
    proc.next_id += 1;
    let req = JsonRpcRequest {
        jsonrpc: "2.0",
        id,
        method,
        params,
    };
    let mut line = serde_json::to_string(&req)?;
    line.push('\n');
    proc.stdin
        .write_all(line.as_bytes())
        .map_err(|e| AppError::Other(format!("Write to MCP stdin failed: {e}")))?;
    Ok(id)
}

fn read_response(proc: &mut McpProcess) -> Result<serde_json::Value, AppError> {
    let mut line = String::new();
    proc.stdout
        .read_line(&mut line)
        .map_err(|e| AppError::Other(format!("Read from MCP stdout failed: {e}")))?;
    let resp: JsonRpcResponse = serde_json::from_str(line.trim())?;
    if let Some(err) = resp.error {
        return Err(AppError::Other(format!("MCP error: {}", err.message)));
    }
    Ok(resp.result.unwrap_or(serde_json::Value::Null))
}

// ─── Commands ────────────────────────────────────────────────

/// Spawn an MCP server process and send the initialize handshake.
/// Uses synchronous I/O — Tauri runs commands on a thread pool.
#[command]
pub fn mcp_start(
    state: State<'_, McpProcessRegistry>,
    id: String,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
) -> Result<(), AppError> {
    let mut lock = state
        .processes
        .lock()
        .map_err(|e| AppError::Other(format!("Registry lock error: {e}")))?;

    if lock.contains_key(&id) {
        return Ok(()); // already running
    }

    let mut child = Command::new(&command)
        .args(&args)
        .envs(&env)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| AppError::Other(format!("Failed to spawn MCP process '{command}': {e}")))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| AppError::Other("Failed to open MCP stdin".into()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Other("Failed to open MCP stdout".into()))?;

    let mut proc = McpProcess {
        _child: child,
        stdin,
        stdout: BufReader::new(stdout),
        next_id: 1,
    };

    // MCP initialize handshake
    let init_params = serde_json::json!({
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": { "name": "mindeck", "version": "1.0.0" }
    });
    send_request(&mut proc, "initialize", init_params)?;
    read_response(&mut proc)?;

    // Send initialized notification (fire-and-forget, no response)
    let notif = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "notifications/initialized",
        "params": {}
    });
    let mut line = serde_json::to_string(&notif)?;
    line.push('\n');
    proc.stdin
        .write_all(line.as_bytes())
        .map_err(|e| AppError::Other(format!("Failed to write initialized notification: {e}")))?;

    lock.insert(id, Arc::new(Mutex::new(proc)));
    Ok(())
}

/// Invoke a JSON-RPC method on a running MCP process.
/// Acquires the outer HashMap lock briefly to clone the Arc, then releases it
/// before doing blocking I/O on the per-process Mutex.
#[command]
pub fn mcp_invoke(
    state: State<'_, McpProcessRegistry>,
    id: String,
    method: String,
    params: serde_json::Value,
) -> Result<serde_json::Value, AppError> {
    // Brief lock on the registry — clone the Arc so we can release immediately
    let proc_arc = {
        let lock = state
            .processes
            .lock()
            .map_err(|e| AppError::Other(format!("Registry lock error: {e}")))?;

        Arc::clone(
            lock.get(&id)
                .ok_or_else(|| AppError::Other(format!(
                    "MCP process '{id}' not found — call mcp_start first"
                )))?,
        )
    };
    // Outer lock is now released — blocking I/O only holds the per-process lock
    let mut proc = proc_arc
        .lock()
        .map_err(|e| AppError::Other(format!("Process lock error: {e}")))?;

    send_request(&mut proc, &method, params)?;
    read_response(&mut proc)
}

/// Kill an MCP server process and remove it from the registry.
#[command]
pub fn mcp_stop(
    state: State<'_, McpProcessRegistry>,
    id: String,
) -> Result<(), AppError> {
    let mut lock = state
        .processes
        .lock()
        .map_err(|e| AppError::Other(format!("Registry lock error: {e}")))?;
    lock.remove(&id); // Child drop → OS sends SIGCHLD
    Ok(())
}
