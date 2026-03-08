import { useRef, useState, useEffect, type KeyboardEvent, type RefObject } from "react"
import { invoke } from "@tauri-apps/api/core"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkBreaks from "remark-breaks"
import rehypeHighlight from "rehype-highlight"
import {
  ChevronDown,
  FolderOpen,
  Pencil,
  Plus,
  RotateCcw,
  SendHorizontal,
  ShieldAlert,
  Trash2,
  X,
  Eraser,
} from "lucide-react"
import { useMajordomoStore } from "@/stores/majordomo"
import { useWorkspaceStore } from "@/stores/workspace"
import { useProviderStore } from "@/stores/provider"
import { useSkillsStore } from "@/stores/skills"
import { useLayoutStore } from "@/stores/layout"
import { useTaskStore } from "@/stores/tasks"
import {
  makeMessage,
  appendMajordomoMessage,
  clearMajordomoMessages,
} from "@/services/conversation"
import { runAgentLoop, type AgentLoopResult } from "@/services/agentic-loop"
import { getToolDefinitions } from "@/services/tools/registry"
import { eventBus } from "@/services/event-bus"
import { createLogger } from "@/services/logger"
import { resolvePermission, resolveAllPermissions } from "@/services/permissions"
import { retryTask } from "@/services/task-manager"
import {
  createWorkspace,
  deleteWorkspace,
  importWorkspace,
  newWorkspace,
} from "@/services/workspace"
import { saveSkill, deleteSkill } from "@/services/skills"
import { ToolActivityRow } from "./ToolActivityRow"
import { SkillEditorModal } from "./SkillEditorModal"
import type { Task, WorkspaceSummary, Model, Skill, TaskResultEvent } from "@/types"

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
    messages,
    isStreaming,
    appendMessage,
    pushMessageDraft,
    updateLastMessage,
    removeDraftIfEmpty,
    setStreaming,
    clearMessages: clearMjMessages,
    workspaceSummaries,
    selectedProviderId,
    selectedModelId,
    setModel,
    activeToolActivities,
    pendingPermissions,
    setToolActivity,
    clearToolActivities,
  } = useMajordomoStore()
  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspace,
    addWorkspace,
    removeWorkspace,
  } = useWorkspaceStore()
  const { providers } = useProviderStore()
  const { skills, activeSkillId, setActiveSkill, addSkill, updateSkill, removeSkill } =
    useSkillsStore()
  const { majordomoWidth } = useLayoutStore()
  const allTasks = useTaskStore((state) => state.tasks)

  const [input, setInput] = useState("")
  const [confirmClear, setConfirmClear] = useState(false)
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string> | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(
    null
  )
  const abortRef = useRef<AbortController | null>(null)
  const msgsEndRef = useRef<HTMLDivElement>(null)
  const msgsContainerRef = useRef<HTMLDivElement>(null)
  const isMjNearBottomRef = useRef(true)
  // Ref keeps the digest handler stable for event subscription while
  // always calling the latest closure (fresh provider/model state).
  const digestRef = useRef<(event: TaskResultEvent) => Promise<void>>(async () => {})

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
    } catch (err) {
      console.error("Failed to delete workspace:", err)
    }
  }

  function buildSystemPrompt(customPrompt?: string): string {
    const summaryText = workspaces
      .map((ws) => {
        const sum = workspaceSummaries.find((s) => s.workspaceId === ws.id)
        return `[${ws.name}] status=${ws.status} summary="${sum?.snippet ?? ws.stateSummary ?? "no activity yet"}"`
      })
      .join("\n")
    const defaultSystem = `You are Majordomo, a global cross-workspace assistant for Mindeck. You have visibility into all workspaces.\n\nCurrent workspace states:\n${summaryText}\n\nBe concise. Reference workspaces by name. Help the user orchestrate their work.\n\nCRITICAL TOOL-USE RULES — VIOLATIONS WILL BE CAUGHT AND REJECTED:\n1. To send work to a workspace, you MUST produce a tool function call for \`dispatch_to_workspace\`. Writing text about dispatching does NOT dispatch — only a real tool call does. The system audits every turn; fake dispatches are automatically detected and rejected.\n2. NEVER write "已派发", "I've dispatched", "task sent", "re-dispatching", "taskId:" or similar UNLESS a tool call was actually produced in this turn. If you describe dispatching without calling the tool, the system will force a retry.\n3. When you want to dispatch, respond ONLY with the tool call — do NOT also write confirmation text. The tool result will confirm success.\n4. If you cannot produce a tool call for any reason, say "I was unable to call the tool" — never pretend you did.\n5. NEVER reproduce system audit lines like "[audit]" or "[Tools actually called:]" in your output.`
    return customPrompt ?? defaultSystem
  }

  /**
   * Core: run a Majordomo turn with a given history.
   * Handles streaming, tool calls, and persistence.
   * @param extraUserContent - injected into history as a user message but NOT rendered in UI
   */
  async function runTurn(
    systemPrompt: string,
    tools: ReturnType<typeof getToolDefinitions>,
    isDigest = false,
    extraUserContent?: string,
    retryCount = 0
  ): Promise<void> {
    const provider = providers.find((p) => p.id === selectedProviderId) ?? providers[0]
    if (!provider) return

    const modelId =
      (selectedModelId || provider.defaultModel) ?? provider.models?.[0]?.id ?? "llama3.2"

    // Use FRESH store state so we never have stale-closure history issues
    const freshMessages = useMajordomoStore.getState().messages
    const mapped = freshMessages
      .filter(
        (m) =>
          m.role === "user" ||
          m.role === "assistant" ||
          (m.role === "system" && m.metadata?.isResultCard)
      )
      .map((m) => {
        // Map result cards into user-role context so the LLM remembers past task results
        if (m.role === "system" && m.metadata?.isResultCard) {
          const wsId = m.metadata.workspaceId as string | undefined
          const wsLabel =
            useWorkspaceStore.getState().workspaces.find((w) => w.id === wsId)?.name ??
            wsId ??
            "Workspace"
          const summary =
            (m.metadata.fullResult as string | undefined)?.slice(0, 600) ??
            m.content.slice(0, 600)
          return {
            role: "user" as const,
            content: `[System: "${wsLabel}" completed task and reported result]\n${summary}`,
          }
        }
        // Strip any fake tool-audit annotations the model may have mimicked
        const content = m.content.replace(/\n?\[Tools actually called:[^\]]*\]/g, "")
        return {
          role: m.role as "user" | "assistant",
          content,
        }
      })

    // Inject tool-use audit as a separate system reminder between turns so the
    // model cannot easily mimic it (it never appears inside assistant text).
    const withAudit: Array<{ role: "system" | "user" | "assistant"; content: string }> =
      []
    let msgIdx = 0
    for (const entry of mapped) {
      withAudit.push(entry)
      // After each assistant turn, check if tools were actually called
      if (entry.role === "assistant") {
        const orig = freshMessages.filter(
          (fm) =>
            fm.role === "user" ||
            fm.role === "assistant" ||
            (fm.role === "system" && fm.metadata?.isResultCard)
        )[msgIdx]
        if (orig?.role === "assistant" && orig.metadata) {
          const called = orig.metadata.toolsCalled as string[] | undefined
          if (called && called.length > 0) {
            withAudit.push({
              role: "system" as const,
              content: `[audit] The preceding assistant turn executed tool calls: ${called.join(", ")}. This audit line is injected by the system — do NOT reproduce it.`,
            })
          }
        }
      }
      msgIdx++
    }

    const history = [
      { role: "system" as const, content: systemPrompt },
      ...withAudit,
      // Extra user message injected for LLM context only — not stored/displayed
      ...(extraUserContent ? [{ role: "user" as const, content: extraUserContent }] : []),
    ]

    const aiMsg = makeMessage("assistant", "", modelId, provider.id)
    pushMessageDraft(aiMsg)
    setStreaming(true)

    abortRef.current?.abort()
    abortRef.current = new AbortController()

    const providerType =
      providers.find((p) => p.id === selectedProviderId)?.type ?? provider.type ?? ""

    let full = ""
    let loopResult: AgentLoopResult | undefined
    try {
      loopResult = await runAgentLoop({
        providerId: provider.id,
        providerType,
        modelId,
        history,
        tools,
        signal: abortRef.current.signal,
        onChunk: (delta) => {
          full += delta
          updateLastMessage({ content: full })
        },
        onToolStart: (activity) => setToolActivity(activity),
        onToolEnd: (activity) => setToolActivity(activity),
      })
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        updateLastMessage({ content: `Error: ${(err as Error).message}` })
        full = `Error: ${(err as Error).message}`
      }
    } finally {
      setStreaming(false)

      // Strip any fake tool-audit annotations the model reproduced
      full = full.replace(/\n?\[Tools actually called:[^\]]*\]/g, "")
      full = full.replace(/\n?\[audit\][^\n]*/g, "")

      // Detect fake dispatches: text mentions dispatching but no tool was called
      const dispatchMentioned =
        full &&
        /dispatch|派发|已派发|dispatched|re-dispatch/i.test(full) &&
        tools.length > 0
      const actuallyDispatched = loopResult?.toolsCalled.includes("dispatch_to_workspace")

      if (dispatchMentioned && !actuallyDispatched && !isDigest && retryCount < 1) {
        // Auto-retry: remove the draft, inject a correction, and retry once
        removeDraftIfEmpty()
        const correctionMsg = makeMessage(
          "user",
          "⚠️ Your previous response described dispatching but did NOT actually call the dispatch_to_workspace tool. Text alone does NOT dispatch. You MUST use the tool function call. Try again now — call the tool, do not just describe it."
        )
        appendMessage(correctionMsg)
        await appendMajordomoMessage(correctionMsg).catch(console.warn)
        retryCount++
        // Re-run the turn (recursive — retryCount prevents infinite loop)
        await runTurn(systemPrompt, tools, false, undefined, retryCount)
        return
      }

      if (dispatchMentioned && !actuallyDispatched && !isDigest) {
        full +=
          "\n\n⚠️ *The dispatch_to_workspace tool was not called. The task was NOT sent. This may be a model limitation — try a different model or resend your request.*"
        updateLastMessage({ content: full })
      }

      if (full.trim()) {
        const metadata: Record<string, unknown> = {}
        if (loopResult && loopResult.toolsCalled.length > 0) {
          metadata.toolsCalled = loopResult.toolsCalled
        }
        appendMajordomoMessage({ ...aiMsg, content: full, metadata }).catch(console.warn)
      } else if (isDigest) {
        removeDraftIfEmpty()
      }

      // Drain any digest events that queued while we were streaming
      drainPendingDigests()
    }
  }

  function drainPendingDigests() {
    const queued = pendingDigestRef.current.splice(0)
    if (queued.length === 0) return
    // Process sequentially to avoid overlapping LLM calls
    queued.reduce<Promise<void>>(
      (chain, ev) =>
        chain.then(() =>
          Promise.resolve(digestRef.current(ev)).catch((err: unknown) => {
            createLogger("MajordomoPanel").error("queued digest failed", err)
          })
        ),
      Promise.resolve()
    )
  }

  async function handleSend() {
    const content = input.trim()
    if (!content || isStreaming) return
    setInput("")
    clearToolActivities()

    const activeSkill = skills.find((s) => s.id === activeSkillId)
    const systemPrompt = buildSystemPrompt(activeSkill?.systemPrompt)

    // Persist + add user message BEFORE building history so fresh state includes it
    const userMsg = makeMessage("user", content)
    appendMessage(userMsg)

    const provider = providers.find((p) => p.id === selectedProviderId) ?? providers[0]
    if (!provider) {
      appendMessage(
        makeMessage(
          "assistant",
          "No providers configured. Open Settings (⌘,) to add a model."
        )
      )
      return
    }

    const toolNames = activeSkill?.tools
    const tools = getToolDefinitions(toolNames)
    await runTurn(systemPrompt, tools)
  }

  /** Pending digest events queued while Majordomo was streaming */
  const pendingDigestRef = useRef<TaskResultEvent[]>([])

  /**
   * Triggered automatically when a workspace reports results.
   * Generates a brief Majordomo summary of the completed task.
   * If Majordomo is currently streaming, the digest is queued and
   * drained when the stream finishes.
   */
  async function handleDigest(event: TaskResultEvent) {
    if (!event.result.trim()) return

    // Queue if currently streaming — will be drained in runTurn's finally block
    if (useMajordomoStore.getState().isStreaming) {
      pendingDigestRef.current.push(event)
      return
    }

    const { workspaces: ws } = useWorkspaceStore.getState()
    const workspaceName =
      ws.find((w) => w.id === event.workspaceId)?.name ?? event.workspaceId

    const freshSummaryText = ws
      .map(
        (w) =>
          `[${w.name}] status=${w.status} summary="${w.stateSummary ?? "no activity yet"}"`
      )
      .join("\n")
    const digestPrompt =
      `You are Majordomo, a global cross-workspace assistant for Mindeck. You have visibility into all workspaces.\n\nCurrent workspace states:\n${freshSummaryText}\n\nBe concise. Reference workspaces by name. Help the user orchestrate their work.` +
      `\n\nA workspace just completed a delegated task and reported back. Briefly summarize what was accomplished (1-3 sentences). Always acknowledge completion. Do NOT offer to dispatch more tasks or take actions — you have NO tools in this turn.`

    const triggerContent = `[System: "${workspaceName}" completed its task and reported results]\n\n${event.result}`

    clearToolActivities()
    await runTurn(digestPrompt, [], true, triggerContent)
  }

  // Keep ref current on every render so the event listener always calls
  // the latest version (with fresh provider/model closure values)
  digestRef.current = handleDigest

  // Subscribe to workspace result events — only once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const mjLog = createLogger("MajordomoPanel")
    const unsub = eventBus.on("task:result", (event) => {
      mjLog.debug("task:result received", { dispatchId: event.dispatchId })
      Promise.resolve(digestRef.current(event)).catch((err: unknown) => {
        mjLog.error("handleDigest failed", err)
      })
    })
    return unsub
  }, [])

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function executeClearContext() {
    setConfirmClear(false)
    clearMjMessages()
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

  const [modelOpen, setModelOpen] = useState(false)
  const [skillOpen, setSkillOpen] = useState(false)
  const [skillEditorOpen, setSkillEditorOpen] = useState(false)
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null)

  function openNewSkill() {
    setEditingSkill(null)
    setSkillOpen(false)
    setSkillEditorOpen(true)
  }

  function openEditSkill(skill: Skill) {
    setEditingSkill(skill)
    setSkillOpen(false)
    setSkillEditorOpen(true)
  }

  async function handleSkillSave(skill: Skill) {
    await saveSkill(skill)
    if (editingSkill) {
      updateSkill(skill)
    } else {
      addSkill(skill)
    }
    setSkillEditorOpen(false)
  }

  async function handleSkillDelete(id: string) {
    await deleteSkill(id)
    removeSkill(id)
  }

  const activeSkill = skills.find((s) => s.id === activeSkillId)
  const skillLabel = activeSkill?.name ?? "Default"

  return (
    <div ref={panelRef} className="mj-panel" style={{ width: majordomoWidth }}>
      {/* Header — two rows */}
      <div className="mj-head">
        {/* Row 1: icon + title + global */}
        <div className="mj-head-row">
          <div className="mj-icon">✦</div>
          <span className="mj-title">Majordomo</span>
          <span className="mj-global">global</span>
          <button
            className="mj-clear-btn"
            onClick={() => setConfirmClear(true)}
            title="Clear conversation history"
            disabled={isStreaming || messages.length === 0}
          >
            <Eraser size={10} />
          </button>
        </div>
        {/* Row 2: model selector + skill selector */}
        <div className="mj-head-row" style={{ position: "relative", gap: 6 }}>
          {/* Model selector */}
          <button
            className="mj-model-chip"
            onClick={() => setModelOpen((v) => !v)}
            title={modelLabel}
          >
            <span className="mj-model-name">{modelLabel}</span>
            <ChevronDown size={9} style={{ flexShrink: 0 }} />
          </button>
          {modelOpen && (
            <>
              <div
                style={{ position: "fixed", inset: 0, zIndex: 9 }}
                onClick={() => setModelOpen(false)}
              />
              <div
                className="model-dropdown"
                style={{ left: 0, right: "auto" }}
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

          {/* Skill selector — always visible */}
          <>
            <button
              className="mj-model-chip"
              onClick={() => setSkillOpen((v) => !v)}
              title={skillLabel}
              style={{ maxWidth: 110 }}
            >
              <span className="mj-model-name">{skillLabel}</span>
              <ChevronDown size={9} style={{ flexShrink: 0 }} />
            </button>
            {skillOpen && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 9 }}
                  onClick={() => setSkillOpen(false)}
                />
                <div
                  className="model-dropdown skill-dropdown"
                  style={{ left: 0, right: "auto" }}
                  role="listbox"
                >
                  <button
                    role="option"
                    aria-selected={activeSkillId === null}
                    className={`model-option ${activeSkillId === null ? "on" : ""}`}
                    onClick={() => {
                      setActiveSkill(null)
                      setSkillOpen(false)
                    }}
                  >
                    Default
                  </button>
                  {skills.map((skill) => (
                    <div key={skill.id} className="skill-option-row">
                      <button
                        role="option"
                        aria-selected={skill.id === activeSkillId}
                        className={`model-option skill-option-btn ${skill.id === activeSkillId ? "on" : ""}`}
                        onClick={() => {
                          setActiveSkill(skill.id)
                          setSkillOpen(false)
                        }}
                      >
                        {skill.name}
                      </button>
                      <div className="skill-option-acts">
                        <button
                          className="skill-act-btn"
                          title="Edit skill"
                          onClick={(e) => {
                            e.stopPropagation()
                            openEditSkill(skill)
                          }}
                        >
                          <Pencil size={10} />
                        </button>
                        <button
                          className="skill-act-btn skill-act-del"
                          title="Delete skill"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSkillDelete(skill.id)
                          }}
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="skill-dropdown-footer">
                    <button className="skill-new-btn" onClick={openNewSkill}>
                      <Plus size={10} />
                      New skill
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        </div>
      </div>

      {/* Skill editor modal */}
      <SkillEditorModal
        open={skillEditorOpen}
        skill={editingSkill}
        onSave={handleSkillSave}
        onClose={() => setSkillEditorOpen(false)}
      />

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
        {messages.map((msg) => {
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
            <div key={msg.id} className={`mj-msg ${msg.role === "user" ? "user" : "ai"}`}>
              <div className="mj-msg-lbl">
                {msg.role === "user" ? "You" : "Majordomo"}
              </div>
              <div className="mj-msg-body">
                {msg.role === "assistant" ? (
                  <div className="msg-markdown">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkBreaks]}
                      rehypePlugins={[rehypeHighlight]}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <>{msg.content}</>
                )}
              </div>
            </div>
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
          <textarea
            className="mj-ta"
            placeholder="Ask anything, across all workspaces…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={isStreaming}
          />
          <div className="mj-bar-row">
            <span className="mj-hint">always available</span>
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
