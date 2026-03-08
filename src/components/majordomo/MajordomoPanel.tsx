import { useRef, useState, useEffect, type KeyboardEvent, type RefObject } from "react"
import { invoke } from "@tauri-apps/api/core"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkBreaks from "remark-breaks"
import rehypeHighlight from "rehype-highlight"
import {
  ChevronDown,
  FolderOpen,
  Plus,
  RotateCcw,
  SendHorizontal,
  ShieldAlert,
  X,
  Eraser,
} from "lucide-react"
import { useMajordomoStore } from "@/stores/majordomo"
import { useChatStore } from "@/stores/chat"
import { useWorkspaceStore } from "@/stores/workspace"
import { useProviderStore } from "@/stores/provider"
import { useSkillsStore } from "@/stores/skills"
import { useLayoutStore } from "@/stores/layout"
import { useTaskStore } from "@/stores/tasks"
import { MAJORDOMO_WS_ID, clearMajordomoMessages } from "@/services/conversation"
import { majordomoAgent } from "@/services/majordomo-agent"
import { eventBus } from "@/services/event-bus"
import { resolvePermission, resolveAllPermissions } from "@/services/permissions"
import { retryTask } from "@/services/task-manager"
import {
  createWorkspace,
  deleteWorkspace,
  importWorkspace,
  newWorkspace,
} from "@/services/workspace"
import { ToolActivityRow } from "./ToolActivityRow"
import { MessageBubble } from "@/components/chat/MessageBubble"
import { SkillChips } from "@/components/ui/SkillChips"
import { SlashCommandDropdown } from "@/components/ui/SlashCommandDropdown"
import { useSlashCommand } from "@/hooks/useSlashCommand"
import type { Task, WorkspaceSummary, Model, Message } from "@/types"

// Stable empty array — prevents React 19 getSnapshot tearing detection from
// triggering infinite re-renders when the MAJORDOMO_WS_ID key is absent.
const EMPTY_MESSAGES: Message[] = []

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

interface MajordomoPanelProps {
  panelRef?: RefObject<HTMLDivElement | null>
}

export function MajordomoPanel({ panelRef }: MajordomoPanelProps) {
  const {
    isStreaming,
    workspaceSummaries,
    selectedProviderId,
    selectedModelId,
    setModel,
    activeToolActivities,
    pendingPermissions,
  } = useMajordomoStore()

  // Read Majordomo messages from useChatStore (Phase 3.2)
  const messages = useChatStore(
    (state) => state.messages[MAJORDOMO_WS_ID] ?? EMPTY_MESSAGES
  )
  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspace,
    addWorkspace,
    removeWorkspace,
  } = useWorkspaceStore()
  const { providers } = useProviderStore()
  const { skills } = useSkillsStore()
  const { majordomoWidth } = useLayoutStore()
  const allTasks = useTaskStore((state) => state.tasks)

  const [input, setInput] = useState("")
  // Per-message skills selected via slash command — NOT stored globally
  const [ephemeralSkills, setEphemeralSkills] = useState<(typeof skills)[number][]>([])
  const [confirmClear, setConfirmClear] = useState(false)
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string> | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(
    null
  )
  const msgsEndRef = useRef<HTMLDivElement>(null)
  const msgsContainerRef = useRef<HTMLDivElement>(null)
  const isMjNearBottomRef = useRef(true)

  // Auto-select the first provider/model when providers load and nothing is selected
  useEffect(() => {
    if (selectedProviderId || providers.length === 0) return
    const p = providers[0]
    const m = p.defaultModel ?? p.models?.[0]?.id ?? ""
    if (p.id && m) setModel(p.id, m)
  }, [providers, selectedProviderId, setModel])

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

  function handleMjScroll() {
    const el = msgsContainerRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isMjNearBottomRef.current = distFromBottom <= 80
  }

  // Auto-scroll to bottom whenever messages change (includes async result cards)
  useEffect(() => {
    if (isMjNearBottomRef.current) {
      msgsEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages.length])

  function getDefaultProviderInfo() {
    const p = providers[0]
    return {
      providerId: p?.id ?? "ollama",
      modelId: p?.models?.[0]?.id ?? "llama3.2",
    }
  }

  async function handleNew() {
    const { providerId, modelId } = getDefaultProviderInfo()
    const ws = newWorkspace(`Workspace ${workspaces.length + 1}`, providerId, modelId)
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

  async function handleSend() {
    const content = input.trim()
    if ((!content && ephemeralSkills.length === 0) || isStreaming) return
    setInput("")
    const ids = ephemeralSkills.map((s) => s.id)
    setEphemeralSkills([])
    await majordomoAgent.send(content, workspaces, summaries, ids)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (slashState.query !== null && slashState.matches.length > 0) {
      if (e.key === "Enter" || e.key === "Tab") {
        const skill = slashState.matches[slashState.selectedIndex]
        if (skill) {
          e.preventDefault()
          selectSkill(skill, () => {
            setEphemeralSkills((prev) =>
              prev.some((s) => s.id === skill.id) ? prev : [...prev, skill]
            )
          })
          setInput("")
          return
        }
      }
      if (slashKeyDown(e)) return
    }
    // Backspace on empty input removes the last ephemeral skill chip
    if (e.key === "Backspace" && input === "" && ephemeralSkills.length > 0) {
      e.preventDefault()
      setEphemeralSkills((prev) => prev.slice(0, -1))
      return
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function executeClearContext() {
    setConfirmClear(false)
    useChatStore.getState().clearMessages(MAJORDOMO_WS_ID)
    clearMajordomoMessages().catch(console.warn)
  }

  // Per-workspace task data derived from the store
  const tasksByWorkspace: Record<string, Task[]> = {}
  for (const ws of workspaces) {
    tasksByWorkspace[ws.id] = allTasks
      .filter((t) => t.workspaceId === ws.id)
      .sort((a, b) => b.createdAt - a.createdAt)
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

  const summaries: WorkspaceSummary[] = workspaces.map((ws) => {
    const stored = workspaceSummaries.find((s) => s.workspaceId === ws.id)
    return {
      workspaceId: ws.id,
      workspaceName: ws.name,
      status: ws.status,
      snippet: stored?.snippet ?? ws.stateSummary ?? "",
      updatedAt: ws.updatedAt,
    }
  })

  const activeProvider = providers.find((p) => p.id === selectedProviderId)
  const activeModel = activeProvider?.models?.find((m: Model) => m.id === selectedModelId)
  const modelLabel = activeModel?.name ?? selectedModelId ?? "No model"

  const modelWrapRef = useRef<HTMLDivElement>(null)
  const mjInputRef = useRef<HTMLTextAreaElement>(null)
  const [modelOpen, setModelOpen] = useState(false)
  const [modelDropdownPos, setModelDropdownPos] = useState<{
    top: number
    left: number
  } | null>(null)

  const {
    state: slashState,
    onInputChange,
    handleKeyDown: slashKeyDown,
    selectSkill,
  } = useSlashCommand(skills)

  return (
    <div ref={panelRef} className="mj-panel" style={{ width: majordomoWidth }}>
      {/* Header — single row: icon + title + model chip + clear */}
      <div className="mj-head">
        <div className="mj-head-row">
          <div className="mj-icon">✦</div>
          <span className="mj-title">Majordomo</span>

          {/* Model selector — inline chip, dropdown uses position:fixed to escape overflow:hidden */}
          <div className="mj-model-wrap" ref={modelWrapRef}>
            <button
              className="mj-model-chip"
              onClick={() => {
                if (modelOpen) {
                  setModelOpen(false)
                  return
                }
                const rect = modelWrapRef.current?.getBoundingClientRect()
                if (rect) setModelDropdownPos({ top: rect.bottom + 4, left: rect.left })
                setModelOpen(true)
              }}
              title={modelLabel}
            >
              <span className="mj-model-name">{modelLabel}</span>
              <ChevronDown size={9} style={{ flexShrink: 0 }} />
            </button>
            {modelOpen && modelDropdownPos && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 9 }}
                  onClick={() => setModelOpen(false)}
                />
                <div
                  className="model-dropdown"
                  style={{
                    position: "fixed",
                    top: modelDropdownPos.top,
                    left: modelDropdownPos.left,
                    right: "auto",
                  }}
                  role="listbox"
                >
                  {providers.map((provider) => (
                    <div key={provider.id}>
                      <div className="model-group-label">{provider.name}</div>
                      {(provider.models ?? []).map((model: Model) => (
                        <button
                          key={model.id}
                          role="option"
                          aria-selected={
                            provider.id === selectedProviderId &&
                            model.id === selectedModelId
                          }
                          className={`model-option ${
                            provider.id === selectedProviderId &&
                            model.id === selectedModelId
                              ? "on"
                              : ""
                          }`}
                          onClick={() => {
                            setModel(provider.id, model.id)
                            setModelOpen(false)
                          }}
                        >
                          {model.name}
                        </button>
                      ))}
                      {(provider.models ?? []).length === 0 && (
                        <div className="model-option-empty">No models loaded</div>
                      )}
                    </div>
                  ))}
                  {providers.length === 0 && (
                    <div className="model-option-empty">No providers configured</div>
                  )}
                </div>
              </>
            )}
          </div>

          <button
            className="mj-clear-btn"
            onClick={() => setConfirmClear(true)}
            title="Clear conversation history"
            disabled={isStreaming || messages.length === 0}
          >
            <Eraser size={10} />
          </button>
        </div>
      </div>

      {/* Workspace list */}
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
            // Snippet: active task content, else last result summary, else empty
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

                  {/* Task count chips */}
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

                {/* Expandable task list: all active + most recent 3 */}
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

      {/* Chat messages */}
      <div ref={msgsContainerRef} className="mj-messages" onScroll={handleMjScroll}>
        {messages.length === 0 && (
          <div style={{ padding: "12px 16px", color: "var(--color-t2)", fontSize: 12 }}>
            Ask me anything across all your workspaces.
          </div>
        )}
        {messages.map((msg, idx) => {
          const isLastMsg = idx === messages.length - 1
          // Workspace result card (system message with isResultCard metadata)
          if (msg.role === "system" && msg.metadata?.isResultCard) {
            const wsId = msg.metadata.workspaceId as string | undefined
            const ws = wsId ? workspaces.find((w) => w.id === wsId) : undefined
            const label = ws?.name ?? wsId ?? "Workspace"
            const fullResult =
              (msg.metadata.fullResult as string | undefined) ??
              msg.content.replace("[Workspace result] ", "")
            return (
              <div key={msg.id} className="mj-result-card">
                <div className="mj-result-card-header">
                  <span className="mj-result-card-icon">📋</span>
                  <span className="mj-result-card-label">{label} reported</span>
                  <span className="mj-result-card-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="mj-result-card-body">
                  <div className="msg-markdown">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkBreaks]}
                      rehypePlugins={[rehypeHighlight]}
                    >
                      {fullResult}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )
          }

          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              variant="mj"
              isStreaming={isStreaming && isLastMsg && msg.role === "assistant"}
            />
          )
        })}
        <div ref={msgsEndRef} />
      </div>

      {/* Tool activity bar — shown at bottom when tools are running */}
      {activeToolActivities.some((a) => a.status === "running") && (
        <div className="mj-tool-activities">
          {activeToolActivities
            .filter((a) => a.status === "running")
            .map((a) => (
              <ToolActivityRow key={a.id} activity={a} />
            ))}
        </div>
      )}

      {/* Pending permission requests */}
      {pendingPermissions.length > 0 && (
        <div className="mj-pending-actions">
          <div className="mj-pending-header">
            <span className="mj-pending-title">
              <ShieldAlert size={10} />
              {pendingPermissions.length === 1
                ? "Permission required"
                : `${pendingPermissions.length} permissions required`}
            </span>
            {pendingPermissions.length > 1 && (
              <div className="mj-pending-bulk">
                <button
                  className="mj-perm-deny-all"
                  onClick={() => resolveAllPermissions(false)}
                >
                  Deny all
                </button>
                <button
                  className="mj-perm-grant-all"
                  onClick={() => resolveAllPermissions(true)}
                >
                  Allow all
                </button>
              </div>
            )}
          </div>
          {pendingPermissions.map((req) => (
            <div key={req.id} className="mj-permission-card">
              <div className="mj-perm-head">
                <span className="mj-perm-type-badge">{req.type}</span>
                <span className="mj-perm-label">{req.label}</span>
                {req.requestedBy && (
                  <span className="mj-perm-requester">
                    <span className="mj-perm-requester-dot" />
                    {req.requestedBy}
                  </span>
                )}
              </div>
              <div className="mj-perm-body">
                <pre className="mj-perm-details">{req.details}</pre>
                <div className="mj-perm-actions">
                  <button
                    className="mj-perm-deny"
                    onClick={() => resolvePermission(req.id, false)}
                  >
                    Deny
                  </button>
                  <button
                    className="mj-perm-allow"
                    onClick={() => resolvePermission(req.id, true)}
                  >
                    Allow
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="mj-foot">
        <div className="mj-input-box">
          {slashState.query !== null && slashState.matches.length > 0 && (
            <SlashCommandDropdown
              skills={slashState.matches}
              selectedIndex={slashState.selectedIndex}
              onSelect={(skill) => {
                selectSkill(skill, () => {
                  setEphemeralSkills((prev) =>
                    prev.some((s) => s.id === skill.id) ? prev : [...prev, skill]
                  )
                })
                setInput("")
                mjInputRef.current?.focus()
              }}
              anchorRef={mjInputRef}
            />
          )}
          {ephemeralSkills.length > 0 && (
            <div className="input-chips">
              <SkillChips
                skills={ephemeralSkills}
                onRemove={(id) =>
                  setEphemeralSkills((prev) => prev.filter((s) => s.id !== id))
                }
                variant="mj"
              />
            </div>
          )}
          <textarea
            ref={mjInputRef}
            className="mj-ta"
            placeholder={
              ephemeralSkills.length > 0
                ? "Add a message…"
                : "Ask anything, across all workspaces…"
            }
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              onInputChange(e.target.value)
            }}
            onKeyDown={onKeyDown}
            disabled={isStreaming}
          />
          <div className="mj-bar-row">
            <button className="mj-send" onClick={handleSend} disabled={isStreaming}>
              <SendHorizontal size={11} />
              Ask
            </button>
          </div>
        </div>
      </div>

      {/* Clear confirm dialog */}
      {confirmClear && (
        <div className="mj-confirm-overlay" onClick={() => setConfirmClear(false)}>
          <div className="mj-confirm" onClick={(e) => e.stopPropagation()}>
            <p className="mj-confirm-msg">Clear Majordomo's conversation history?</p>
            <div className="mj-confirm-actions">
              <button
                className="mj-confirm-cancel"
                onClick={() => setConfirmClear(false)}
              >
                Cancel
              </button>
              <button className="mj-confirm-delete" onClick={executeClearContext}>
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  )
}
