import { useRef, useState, useEffect, type KeyboardEvent } from "react"
import { invoke } from "@tauri-apps/api/core"
import { ChevronDown, FolderOpen, Plus, SendHorizontal, X } from "lucide-react"
import { useMajordomoStore } from "@/stores/majordomo"
import { useWorkspaceStore } from "@/stores/workspace"
import { useProviderStore } from "@/stores/provider"
import { providerManager } from "@/services/providers/manager"
import { makeMessage } from "@/services/conversation"
import {
  createWorkspace,
  deleteWorkspace,
  importWorkspace,
  newWorkspace,
} from "@/services/workspace"
import type { WorkspaceSummary, Model } from "@/types"

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
    updateLastMessage,
    setStreaming,
    workspaceSummaries,
    selectedProviderId,
    selectedModelId,
    setModel,
  } = useMajordomoStore()
  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspace,
    addWorkspace,
    removeWorkspace,
  } = useWorkspaceStore()
  const { providers } = useProviderStore()

  const [input, setInput] = useState("")
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string } | null>(
    null
  )
  const abortRef = useRef<AbortController | null>(null)
  const msgsEndRef = useRef<HTMLDivElement>(null)

  // Auto-select the first provider/model when providers load and nothing is selected
  useEffect(() => {
    if (selectedProviderId || providers.length === 0) return
    const p = providers[0]
    const m = p.defaultModel ?? p.models?.[0]?.id ?? ""
    if (p.id && m) setModel(p.id, m)
  }, [providers, selectedProviderId, setModel])

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

  async function handleSend() {
    const content = input.trim()
    if (!content || isStreaming) return
    setInput("")

    const summaryText = workspaces
      .map((ws) => {
        const sum = workspaceSummaries.find((s) => s.workspaceId === ws.id)
        return `[${ws.name}] status=${ws.status} summary="${sum?.snippet ?? ws.stateSummary ?? "no activity yet"}"`
      })
      .join("\n")

    const systemPrompt = `You are Majordomo, a global cross-workspace assistant for Mindeck. You have visibility into all workspaces.\n\nCurrent workspace states:\n${summaryText}\n\nBe concise. Reference workspaces by name. Help the user orchestrate their work.`

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

    const history = [
      { role: "system" as const, content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content },
    ]

    const modelId =
      (selectedModelId || provider.defaultModel) ?? provider.models?.[0]?.id ?? "llama3.2"
    const aiMsg = makeMessage("assistant", "", modelId, provider.id)
    appendMessage(aiMsg)
    setStreaming(true)

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    let full = ""

    try {
      for await (const chunk of providerManager.chat(
        provider.id,
        modelId,
        history,
        abortRef.current.signal
      )) {
        full += chunk.delta
        updateLastMessage({ content: full })
        msgsEndRef.current?.scrollIntoView({ behavior: "smooth" })
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        updateLastMessage({ content: `Error: ${(err as Error).message}` })
      }
    } finally {
      setStreaming(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
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

  return (
    <div className="mj-panel">
      {/* Header — two rows */}
      <div className="mj-head">
        {/* Row 1: icon + title + global */}
        <div className="mj-head-row">
          <div className="mj-icon">✦</div>
          <span className="mj-title">Majordomo</span>
          <span className="mj-global">global</span>
        </div>
        {/* Row 2: model selector */}
        <div className="mj-head-row" style={{ position: "relative" }}>
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
        {messages.map((msg, i) => (
          <div key={msg.id} className={`mj-msg ${msg.role === "user" ? "user" : "ai"}`}>
            <div className="mj-msg-lbl">{msg.role === "user" ? "You" : "Majordomo"}</div>
            <div className="mj-msg-body">
              {msg.content}
              {isStreaming && i === messages.length - 1 && msg.role === "assistant" && (
                <span className="mj-cursor" aria-hidden />
              )}
            </div>
          </div>
        ))}
        <div ref={msgsEndRef} />
      </div>

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
