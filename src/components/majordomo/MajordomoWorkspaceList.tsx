import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  FolderOpen,
  Plus,
  RotateCcw,
  X,
} from "lucide-react"
import { useWorkspaceStore } from "@/stores/workspace"
import { useProviderStore } from "@/stores/provider"
import { useTaskStore } from "@/stores/tasks"
import { eventBus } from "@/services/events/event-bus"
import {
  createWorkspace,
  deleteWorkspace,
  importWorkspace,
  newWorkspace,
} from "@/services/workspace/workspace"
import {
  WORKSPACE_TEMPLATES,
  applyTemplate,
} from "@/services/templates/workspace-templates"
import { WorkspaceTemplateSelector } from "@/components/workspace/WorkspaceTemplateSelector"
import { retryTask } from "@/services/events/task-manager"
import type { Task, WorkspaceSummary } from "@/types"

const TASK_STATUS_COLOR: Record<string, string> = {
  pending: "var(--color-t2)",
  received: "var(--color-t2)",
  processing: "var(--color-yellow)",
  completed: "var(--color-ac)",
  failed: "#f87171",
}

const TASK_STATUS_LABEL: Record<string, string> = {
  pending: "waiting",
  received: "queued",
  processing: "running",
  completed: "done",
  failed: "failed",
}

interface MajordomoWorkspaceListProps {
  summaries: WorkspaceSummary[]
  tasksByWorkspace: Record<string, Task[]>
}

export function MajordomoWorkspaceList({
  summaries,
  tasksByWorkspace,
}: MajordomoWorkspaceListProps) {
  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspace,
    addWorkspace,
    removeWorkspace,
  } = useWorkspaceStore()
  const { providers } = useProviderStore()

  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string> | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(
    null
  )
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState("blank")
  const allTasks = useTaskStore((state) => state.tasks)

  // Auto-expand workspaces with active tasks (on mount + when new tasks arrive)
  useEffect(() => {
    const activeWsIds = new Set<string>()
    for (const t of allTasks) {
      if (
        t.status === "processing" ||
        t.status === "received" ||
        t.status === "pending"
      ) {
        activeWsIds.add(t.workspaceId)
      }
    }
    if (expandedWorkspaces === null) {
      setExpandedWorkspaces(activeWsIds)
    } else if (activeWsIds.size > 0) {
      setExpandedWorkspaces((prev) => {
        const next = new Set(prev ?? new Set<string>())
        let changed = false
        for (const id of activeWsIds) {
          if (!next.has(id)) {
            next.add(id)
            changed = true
          }
        }
        return changed ? next : prev
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks])

  function getDefaultProviderInfo() {
    const p = providers[0]
    return {
      providerId: p?.id ?? "ollama",
      modelId: p?.models?.[0]?.id ?? "llama3.2",
    }
  }

  async function handleNew() {
    setSelectedTemplateId("blank")
    setShowTemplateModal(true)
  }

  async function handleConfirmNew() {
    setShowTemplateModal(false)
    const { providerId, modelId } = getDefaultProviderInfo()
    const base = newWorkspace(`Workspace ${workspaces.length + 1}`, providerId, modelId)
    const tpl = WORKSPACE_TEMPLATES.find((t) => t.id === selectedTemplateId)
    const ws = tpl ? applyTemplate(base, tpl) : base
    try {
      await createWorkspace(ws)
      addWorkspace(ws)
      setActiveWorkspace(ws.id)
    } catch (err) {
      console.error("Failed to create workspace:", err)
    }
  }

  async function handleImportFolder() {
    try {
      const path = await invoke<string | null>("pick_folder")
      if (!path) return
      const { providerId, modelId } = getDefaultProviderInfo()
      const ws = importWorkspace(path, providerId, modelId)
      await createWorkspace(ws)
      addWorkspace(ws)
      setActiveWorkspace(ws.id)
    } catch (err) {
      console.error("Failed to import folder:", err)
    }
  }

  function requestDelete(
    workspaceId: string,
    workspaceName: string,
    e: React.MouseEvent
  ) {
    e.stopPropagation()
    setConfirmTarget({ id: workspaceId, name: workspaceName })
  }

  async function confirmDelete() {
    if (!confirmTarget) return
    const { id } = confirmTarget
    setConfirmTarget(null)
    try {
      await deleteWorkspace(id)
      if (activeWorkspaceId === id) {
        const idx = workspaces.findIndex((w) => w.id === id)
        const next = workspaces[idx + 1] ?? workspaces[idx - 1]
        if (next) setActiveWorkspace(next.id)
      }
      removeWorkspace(id)
      eventBus.emit("workspace:deleted", { workspaceId: id })
    } catch (err) {
      console.error("Failed to delete workspace:", err)
    }
  }

  function getWsDotColor(wsId: string): string {
    const tasks = tasksByWorkspace[wsId] ?? []
    if (tasks.some((t) => t.status === "processing" || t.status === "received")) {
      return "var(--color-ac)"
    }
    if (tasks.some((t) => t.status === "pending")) return "var(--color-yellow)"
    if (tasks.some((t) => t.status === "failed")) return "#f87171"
    return "var(--color-t2)"
  }

  function toggleExpanded(wsId: string) {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev ?? new Set<string>())
      if (next.has(wsId)) next.delete(wsId)
      else next.add(wsId)
      return next
    })
  }

  return (
    <>
      <div className="mj-ws-section">
        <div className="mj-ws-header">
          <span className="mj-ws-label">Workspaces</span>
          <div className="mj-ws-acts">
            <button
              className="mj-ws-act"
              onClick={handleImportFolder}
              title="Import folder as workspace"
            >
              <FolderOpen size={11} />
            </button>
            <button className="mj-ws-act" onClick={handleNew} title="New workspace">
              <Plus size={11} />
            </button>
          </div>
        </div>
        {summaries.length === 0 ? (
          <div className="mj-ws-empty">No workspaces — click + to create one.</div>
        ) : (
          summaries.map((s) => {
            const wsTasks = tasksByWorkspace[s.workspaceId] ?? []
            const activeTasks = wsTasks.filter(
              (t) => t.status === "processing" || t.status === "received"
            )
            const pendingTasks = wsTasks.filter((t) => t.status === "pending")
            const failedTasks = wsTasks.filter(
              (t) => t.status === "failed" && t.attempts < t.maxAttempts
            )
            const isExpanded = expandedWorkspaces?.has(s.workspaceId) ?? false
            const dotColor = getWsDotColor(s.workspaceId)
            const snippet =
              activeTasks[0]?.content.split("\n")[0].slice(0, 60) ?? s.snippet

            return (
              <div key={s.workspaceId} className="mj-ws-group">
                <button
                  className={`mj-ws-item${s.workspaceId === activeWorkspaceId ? " on" : ""}`}
                  onClick={() => {
                    setActiveWorkspace(s.workspaceId)
                    if (wsTasks.length > 0) toggleExpanded(s.workspaceId)
                  }}
                >
                  <div className="mj-ws-dot" style={{ background: dotColor }} />
                  <div className="mj-ws-info">
                    <div className="mj-ws-name">{s.workspaceName}</div>
                    {snippet && <div className="mj-ws-snip">{snippet}</div>}
                  </div>

                  <div className="mj-ws-chips">
                    {activeTasks.length > 0 && (
                      <span className="mj-ws-chip running">{activeTasks.length}</span>
                    )}
                    {pendingTasks.length > 0 && (
                      <span className="mj-ws-chip pending">{pendingTasks.length}</span>
                    )}
                    {failedTasks.length > 0 && (
                      <span className="mj-ws-chip failed">{failedTasks.length}</span>
                    )}
                  </div>

                  <span
                    className="mj-ws-del"
                    role="button"
                    aria-label={`Delete ${s.workspaceName}`}
                    onClick={(e) => requestDelete(s.workspaceId, s.workspaceName, e)}
                  >
                    <X size={9} />
                  </span>
                </button>

                {isExpanded && wsTasks.length > 0 && (
                  <div className="mj-ws-tasks">
                    {(() => {
                      const running = wsTasks.filter(
                        (t) =>
                          t.status === "processing" ||
                          t.status === "received" ||
                          t.status === "pending"
                      )
                      const rest = wsTasks.filter(
                        (t) =>
                          t.status !== "processing" &&
                          t.status !== "received" &&
                          t.status !== "pending"
                      )
                      const runningIds = new Set(running.map((t) => t.id))
                      const recent = rest.filter((t) => !runningIds.has(t.id)).slice(0, 3)
                      return [...running, ...recent]
                    })().map((task) => (
                      <div key={task.id} className="mj-task-item">
                        <span
                          className={`mj-task-dot ${task.status}`}
                          style={{ background: TASK_STATUS_COLOR[task.status] }}
                        />
                        <span className="mj-task-content">
                          {task.content.split("\n")[0].slice(0, 55)}
                        </span>
                        <span className="mj-task-label">
                          {TASK_STATUS_LABEL[task.status]}
                        </span>
                        {task.status === "failed" && task.attempts < task.maxAttempts && (
                          <button
                            className="mj-task-retry"
                            title={`Retry (attempt ${task.attempts + 1}/${task.maxAttempts})`}
                            onClick={(e) => {
                              e.stopPropagation()
                              retryTask(task.id)
                            }}
                          >
                            <RotateCcw size={9} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Delete confirm dialog */}
      {confirmTarget && (
        <div className="mj-confirm-overlay" onClick={() => setConfirmTarget(null)}>
          <div className="mj-confirm" onClick={(e) => e.stopPropagation()}>
            <p className="mj-confirm-msg">
              Delete <strong>{confirmTarget.name}</strong>?
            </p>
            <div className="mj-confirm-actions">
              <button
                className="mj-confirm-cancel"
                onClick={() => setConfirmTarget(null)}
              >
                Cancel
              </button>
              <button className="mj-confirm-delete" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template picker dialog */}
      {showTemplateModal && (
        <div className="mj-confirm-overlay" onClick={() => setShowTemplateModal(false)}>
          <div
            className="mj-confirm ws-template-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mj-confirm-msg">Choose a workspace template</p>
            <WorkspaceTemplateSelector
              selected={selectedTemplateId}
              onSelect={setSelectedTemplateId}
            />
            <div className="mj-confirm-actions">
              <button
                className="mj-confirm-cancel"
                onClick={() => setShowTemplateModal(false)}
              >
                Cancel
              </button>
              <button className="mj-confirm-delete" onClick={handleConfirmNew}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
