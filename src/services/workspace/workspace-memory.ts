/**
 * Cross-session workspace memory (H3.6).
 * Persists factual context across agent sessions in ~/.mindeck/workspaces/{id}/memory.md
 */
import { invoke } from "@tauri-apps/api/core"
import { createLogger } from "../logger"

const log = createLogger("WorkspaceMemory")

const MEMORY_COMPACT_THRESHOLD = 3000
const MEMORY_MAX_CHARS = 3000

export async function readWorkspaceMemory(workspaceId: string): Promise<string> {
  try {
    return await invoke<string>("read_workspace_memory", { workspaceId })
  } catch (err) {
    log.warn("Failed to read workspace memory", err)
    return ""
  }
}

export async function saveWorkspaceMemory(
  workspaceId: string,
  content: string
): Promise<void> {
  try {
    await invoke("save_workspace_memory", { workspaceId, content })
  } catch (err) {
    log.warn("Failed to save workspace memory", err)
  }
}

/**
 * Append a new fact/summary to the workspace memory.
 * If the resulting memory exceeds the threshold, compact it using the LLM.
 */
export async function appendToWorkspaceMemory(
  workspaceId: string,
  summary: string,
  providerId: string,
  modelId: string
): Promise<void> {
  const current = await readWorkspaceMemory(workspaceId)
  const timestamp = new Date().toISOString()
  const appended = current
    ? `${current}\n---\n${timestamp}: ${summary}`
    : `${timestamp}: ${summary}`

  if (appended.length > MEMORY_COMPACT_THRESHOLD) {
    log.debug("memory threshold exceeded — compacting", { chars: appended.length })
    const compacted = await compactMemory(appended, providerId, modelId)
    await saveWorkspaceMemory(workspaceId, compacted)
  } else {
    await saveWorkspaceMemory(workspaceId, appended)
  }
}

/**
 * Compact memory using the LLM when it exceeds the size threshold.
 * Falls back to simple truncation if the API call fails.
 */
export async function compactMemory(
  current: string,
  providerId: string,
  modelId: string
): Promise<string> {
  try {
    const { streamChat } = await import("../providers/bridge")
    const request = [
      {
        role: "user" as const,
        content: `The following is a workspace memory log. Condense it into a concise, factual summary (max ${MEMORY_MAX_CHARS} chars), preserving key decisions, results, and important context:\n\n${current}`,
      },
    ]

    let summary = ""
    for await (const chunk of streamChat(
      providerId,
      "openai-compatible",
      modelId,
      request
    )) {
      if (chunk.delta) summary += chunk.delta
    }
    return summary.slice(0, MEMORY_MAX_CHARS)
  } catch (err) {
    log.warn("Memory compaction failed — truncating instead", err)
    // Fall back: keep the most recent portion
    return current.slice(-MEMORY_MAX_CHARS)
  }
}
