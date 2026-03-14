/**
 * TaskManager — engineering-level task lifecycle.
 *
 * All dispatch, status tracking, and retry logic lives here.
 * WorkspaceAgent and builtins talk to this service, not directly to
 * the EventBus or TaskStore, so behaviour is consistent and testable.
 */
import { useTaskStore } from "@/stores/tasks"
import { useWorkspaceStore } from "@/stores/workspace"
import { eventBus } from "./event-bus"
import { enqueueTaskDispatch } from "./event-queue"
import { createLogger } from "../logger"
import type { Task, TaskStatus, MessageSource } from "@/types"

const log = createLogger("TaskManager")

/**
 * Create a new task in the store and return it.
 * The caller is responsible for emitting `task:dispatch` after this.
 */
export function createTask(
  workspaceId: string,
  content: string,
  sourceType: MessageSource = "majordomo"
): Task {
  const ws = useWorkspaceStore.getState().workspaces.find((w) => w.id === workspaceId)
  const task: Task = {
    id: crypto.randomUUID(),
    workspaceId,
    workspaceName: ws?.name ?? workspaceId,
    content,
    status: "pending",
    sourceType,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    attempts: 1,
    maxAttempts: 3,
  }
  useTaskStore.getState().addTask(task)
  log.info("Task created", {
    taskId: task.id,
    workspace: task.workspaceName,
    content: content.slice(0, 60),
  })

  // Persist to disk for durability across app restarts (best-effort)
  enqueueTaskDispatch({
    id: task.id,
    sourceType: task.sourceType,
    targetWorkspaceId: task.workspaceId,
    task: task.content,
    priority: "normal",
  }).catch((err: unknown) => log.warn("Failed to persist event to disk", err))

  return task
}

/**
 * Update a task's status, optionally attaching result/error text.
 * No-ops silently if the task ID is unknown (for legacy EventBus events
 * created before the TaskStore existed).
 */
export function updateTaskStatus(
  id: string,
  status: TaskStatus,
  extra?: { result?: string; error?: string }
): void {
  const exists = useTaskStore.getState().tasks.some((t) => t.id === id)
  if (!exists) return
  useTaskStore.getState().updateTask(id, { status, ...extra })
  log.debug("Task status →", { taskId: id, status })

  // After completing, prune old tasks for that workspace
  if (status === "completed" || status === "failed") {
    const task = useTaskStore.getState().tasks.find((t) => t.id === id)
    if (task) useTaskStore.getState().pruneWorkspace(task.workspaceId)
  }
}

/**
 * Retry a failed/stuck task: increments attempts, resets to pending,
 * and re-emits `task:dispatch` so a connected agent picks it up.
 */
export function retryTask(id: string): void {
  const task = useTaskStore.getState().tasks.find((t) => t.id === id)
  if (!task) {
    log.warn("retryTask: task not found", { id })
    return
  }
  if (task.attempts >= task.maxAttempts) {
    log.warn("retryTask: max attempts reached", { id, attempts: task.attempts })
    return
  }
  useTaskStore.getState().retryTask(id)
  const updated = useTaskStore.getState().tasks.find((t) => t.id === id)!
  log.info("Task retried", { taskId: id, attempt: updated.attempts })
  eventBus.emit("task:dispatch", {
    id: task.id,
    sourceType: task.sourceType,
    targetWorkspaceId: task.workspaceId,
    task: task.content,
    priority: "normal",
  })
}

/**
 * Called by WorkspaceAgent.connect() to recover tasks that were
 * pending (never picked up) or stuck in processing (agent crashed).
 * Returns the list of tasks to re-enqueue.
 */
export function recoverPendingTasks(workspaceId: string): Task[] {
  const pending = useTaskStore.getState().getPendingForWorkspace(workspaceId)
  if (pending.length > 0) {
    log.info("Recovering pending tasks on connect", {
      workspaceId,
      count: pending.length,
      taskIds: pending.map((t) => t.id),
    })
  }
  return pending
}
