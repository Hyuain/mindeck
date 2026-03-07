import { useRef, useState, useEffect, type KeyboardEvent } from "react"
import { invoke } from "@tauri-apps/api/core"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import {
  ChevronDown,
  FolderOpen,
  Pencil,
  Plus,
  SendHorizontal,
  Trash2,
  X,
  Eraser,
} from "lucide-react"
import { useMajordomoStore } from "@/stores/majordomo"
import { useWorkspaceStore } from "@/stores/workspace"
import { useProviderStore } from "@/stores/provider"
import { useSkillsStore } from "@/stores/skills"
import {
  makeMessage,
  appendMajordomoMessage,
  clearMajordomoMessages,
} from "@/services/conversation"
import { runAgentLoop } from "@/services/agentic-loop"
import { getToolDefinitions } from "@/services/tools/registry"
import { eventBus } from "@/services/event-bus"
import {
  createWorkspace,
  deleteWorkspace,
  importWorkspace,
  newWorkspace,
} from "@/services/workspace"
import { saveSkill, deleteSkill } from "@/services/skills"
import { ToolActivityRow } from "./ToolActivityRow"
import { SkillEditorModal } from "./SkillEditorModal"
import type { WorkspaceSummary, Model, Skill, TaskResultEvent } from "@/types"

const STATUS_COLOR: Record<string, string> = {
  active: "var(--color-ac)",
  pending: "var(--color-yellow)",
  idle: "var(--color-t2)",
}

const STATUS_LABEL: Record<string, string> = {
  active: "active",
  pending: "pending",
  idle: "idle",
}

export function MajordomoPanel() {
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

  const [input, setInput] = useState("")
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(
    null
  )
  const abortRef = useRef<AbortController | null>(null)
  const msgsEndRef = useRef<HTMLDivElement>(null)
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

  // Auto-scroll to bottom whenever messages change (includes async result cards)
  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: "smooth" })
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
    const defaultSystem = `You are Majordomo, a global cross-workspace assistant for Mindeck. You have visibility into all workspaces.\n\nCurrent workspace states:\n${summaryText}\n\nBe concise. Reference workspaces by name. Help the user orchestrate their work.`
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
    extraUserContent?: string
  ): Promise<void> {
    const provider = providers.find((p) => p.id === selectedProviderId) ?? providers[0]
    if (!provider) return

    const modelId =
      (selectedModelId || provider.defaultModel) ?? provider.models?.[0]?.id ?? "llama3.2"

    // Use FRESH store state so we never have stale-closure history issues
    const freshMessages = useMajordomoStore.getState().messages
    const history = [
      { role: "system" as const, content: systemPrompt },
      ...freshMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
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
    try {
      await runAgentLoop({
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
      if (full.trim()) {
        appendMajordomoMessage({ ...aiMsg, content: full }).catch(console.warn)
      } else if (isDigest) {
        // Digest turn produced no response — remove the empty draft silently
        removeDraftIfEmpty()
      }
    }
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

  /**
   * Triggered automatically when a workspace reports results.
   * Runs a brief Majordomo digest turn — if the AI has nothing to add, the
   * empty draft is silently removed.
   */
  async function handleDigest(event: TaskResultEvent) {
    // Read isStreaming from store to avoid closure staleness
    if (useMajordomoStore.getState().isStreaming) return

    const { workspaces: ws } = useWorkspaceStore.getState()
    const workspaceName =
      ws.find((w) => w.id === event.workspaceId)?.name ?? event.workspaceId

    // Build system prompt from fresh workspace state
    const freshSummaryText = ws
      .map(
        (w) =>
          `[${w.name}] status=${w.status} summary="${w.stateSummary ?? "no activity yet"}"`
      )
      .join("\n")
    const digestPrompt =
      `You are Majordomo, a global cross-workspace assistant for Mindeck. You have visibility into all workspaces.\n\nCurrent workspace states:\n${freshSummaryText}\n\nBe concise. Reference workspaces by name. Help the user orchestrate their work.` +
      `\n\nA workspace just completed a delegated task and reported back. Review the result and respond briefly ONLY if it changes your plan or requires follow-up action. Otherwise output nothing (empty response).`

    // Inject the result as a synthetic user trigger into LLM context only — NOT rendered
    const triggerContent = `[System: "${workspaceName}" reported task results]\n\n${event.result}`

    clearToolActivities()
    // Digest turns don't use tools (no further dispatching in a digest)
    await runTurn(digestPrompt, [], true, triggerContent)
  }

  // Keep ref current on every render so the event listener always calls
  // the latest version (with fresh provider/model closure values)
  digestRef.current = handleDigest

  // Subscribe to workspace result events — only once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const unsub = eventBus.on("task:result", (event) => {
      digestRef.current(event)
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

  const summaries: WorkspaceSummary[] = workspaces.map((ws) => {
    const stored = workspaceSummaries.find((s) => s.workspaceId === ws.id)
    return {
      workspaceId: ws.id,
      workspaceName: ws.name,
      status: ws.status,
      snippet: stored?.snippet ?? ws.stateSummary ?? "No activity yet",
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
    <div className="mj-panel">
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
          summaries.map((s) => (
            <button
              key={s.workspaceId}
              className={`mj-ws-item${s.workspaceId === activeWorkspaceId ? " on" : ""}`}
              onClick={() => setActiveWorkspace(s.workspaceId)}
            >
              <div
                className="mj-ws-dot"
                style={{ background: STATUS_COLOR[s.status] ?? "var(--color-t2)" }}
              />
              <div className="mj-ws-info">
                <div className="mj-ws-name">{s.workspaceName}</div>
                <div className="mj-ws-snip">{s.snippet}</div>
              </div>
              <span className={`mj-ws-badge ${s.status}`}>
                {STATUS_LABEL[s.status] ?? s.status}
              </span>
              <span
                className="mj-ws-del"
                role="button"
                aria-label={`Delete ${s.workspaceName}`}
                onClick={(e) => requestDelete(s.workspaceId, s.workspaceName, e)}
              >
                <X size={9} />
              </span>
            </button>
          ))
        )}
      </div>

      {/* Chat messages */}
      <div className="mj-messages">
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
                      remarkPlugins={[remarkGfm]}
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
                      remarkPlugins={[remarkGfm]}
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
