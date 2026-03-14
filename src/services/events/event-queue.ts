/**
 * event-queue.ts — Persistent event queue backed by disk files.
 *
 * Best-effort durability layer for task dispatch events. Failures are
 * logged and swallowed — this MUST NOT block normal app operation.
 *
 * Storage: ~/.mindeck/events/{workspaceId}.jsonl
 *          ~/.mindeck/events/{workspaceId}.processed
 */
import { invoke } from "@tauri-apps/api/core"
import { createLogger } from "../logger"
import type { TaskDispatchEvent } from "@/types"

const log = createLogger("EventQueue")

interface PersistedEvent {
  id: string
  eventType: string
  payload: unknown
  createdAt: number
}

/**
 * Persist a task dispatch event to disk so it survives app restarts.
 * Call this alongside EventBus.emit for durability.
 */
export async function enqueueTaskDispatch(event: TaskDispatchEvent): Promise<void> {
  const record: PersistedEvent = {
    id: event.id,
    eventType: "task:dispatch",
    payload: event,
    createdAt: Date.now(),
  }
  await invoke("append_event", {
    workspaceId: event.targetWorkspaceId,
    event: record,
  })
}

/**
 * Load all pending (unprocessed) dispatch events for a workspace.
 * Call on WorkspaceAgent.connect() to recover missed events.
 */
export async function loadPendingDispatches(
  workspaceId: string
): Promise<TaskDispatchEvent[]> {
  const raw = await invoke<PersistedEvent[]>("load_pending_events", { workspaceId })
  const results: TaskDispatchEvent[] = []

  for (const record of raw) {
    if (record.eventType !== "task:dispatch") continue
    const payload = record.payload as Record<string, unknown>
    if (
      typeof payload.id !== "string" ||
      typeof payload.targetWorkspaceId !== "string" ||
      typeof payload.task !== "string" ||
      typeof payload.sourceType !== "string"
    ) {
      log.warn("Skipping malformed persisted event", { id: record.id })
      continue
    }
    results.push({
      id: payload.id,
      sourceType: payload.sourceType as TaskDispatchEvent["sourceType"],
      targetWorkspaceId: payload.targetWorkspaceId,
      task: payload.task,
      priority:
        typeof payload.priority === "string"
          ? (payload.priority as TaskDispatchEvent["priority"])
          : "normal",
    })
  }

  return results
}

/**
 * Mark an event as processed so it won't be recovered again.
 */
export async function markEventProcessed(
  workspaceId: string,
  eventId: string
): Promise<void> {
  await invoke("mark_event_processed", { workspaceId, eventId })
}
