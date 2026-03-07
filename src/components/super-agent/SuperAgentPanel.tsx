import { useRef, useState, type KeyboardEvent } from "react"
import { SendHorizontal } from "lucide-react"
import { useSuperAgentStore } from "@/stores/super-agent"
import { useWorkspaceStore } from "@/stores/workspace"
import { useProviderStore } from "@/stores/provider"
import { providerManager } from "@/services/providers/manager"
import { makeMessage } from "@/services/conversation"
import type { WorkspaceSummary } from "@/types"

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

export function SuperAgentPanel() {
  const {
    messages,
    isStreaming,
    appendMessage,
    updateLastMessage,
    setStreaming,
    workspaceSummaries,
  } = useSuperAgentStore()
  const { workspaces, activeWorkspaceId, setActiveWorkspace } = useWorkspaceStore()
  const { providers } = useProviderStore()

  const [input, setInput] = useState("")
  const abortRef = useRef<AbortController | null>(null)
  const msgsEndRef = useRef<HTMLDivElement>(null)

  async function handleSend() {
    const content = input.trim()
    if (!content || isStreaming) return
    setInput("")

    // Build system prompt with workspace state
    const summaryText = workspaces
      .map((ws) => {
        const sum = workspaceSummaries.find((s) => s.workspaceId === ws.id)
        return `[${ws.name}] status=${ws.status} summary="${sum?.snippet ?? ws.stateSummary ?? "no activity yet"}"`
      })
      .join("\n")

    const systemPrompt = `You are Super Agent, a global cross-workspace assistant for Mindeck. You have visibility into all workspaces.\n\nCurrent workspace states:\n${summaryText}\n\nBe concise. Reference workspaces by name. Help the user orchestrate their work.`

    const userMsg = makeMessage("user", content)
    appendMessage(userMsg)

    // Pick first available provider
    const provider = providers[0]
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

    const modelId = provider.defaultModel ?? provider.models?.[0]?.id ?? "llama3.2"
    const aiMsg = makeMessage("assistant", "", modelId, provider.id)
    appendMessage(aiMsg)
    setStreaming(true)

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    let full = ""

    try {
      // Rust fetches the API key from OS Keychain internally
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

  // Build summaries from store, falling back to workspace state
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

  return (
    <div className="sa-panel">
      {/* Header */}
      <div className="sa-head">
        <div className="sa-icon">✦</div>
        <span className="sa-title">Super Agent</span>
        <span className="sa-global">global</span>
      </div>

      {/* Workspace status rows */}
      {summaries.length > 0 && (
        <div className="sa-ws-section">
          <div className="sa-ws-label">Workspaces</div>
          {summaries.map((s) => (
            <button
              key={s.workspaceId}
              className={`sa-ws-item${s.workspaceId === activeWorkspaceId ? " on" : ""}`}
              onClick={() => setActiveWorkspace(s.workspaceId)}
            >
              <div
                className="sa-ws-dot"
                style={{ background: STATUS_COLOR[s.status] ?? "var(--color-t2)" }}
              />
              <div className="sa-ws-info">
                <div className="sa-ws-name">{s.workspaceName}</div>
                <div className="sa-ws-snip">{s.snippet}</div>
              </div>
              <span className={`sa-ws-badge ${s.status}`}>
                {STATUS_LABEL[s.status] ?? s.status}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Chat messages */}
      <div className="sa-messages">
        {messages.length === 0 && (
          <div style={{ padding: "12px 16px", color: "var(--color-t2)", fontSize: 12 }}>
            Ask me anything across all your workspaces.
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={msg.id} className={`sa-msg ${msg.role === "user" ? "user" : "ai"}`}>
            <div className="sa-msg-lbl">
              {msg.role === "user" ? "You" : "Super Agent"}
            </div>
            <div className="sa-msg-body">
              {msg.content}
              {isStreaming && i === messages.length - 1 && msg.role === "assistant" && (
                <span className="sa-cursor" aria-hidden />
              )}
            </div>
          </div>
        ))}
        <div ref={msgsEndRef} />
      </div>

      {/* Input */}
      <div className="sa-foot">
        <div className="sa-input-box">
          <textarea
            className="sa-ta"
            placeholder="Ask anything, across all workspaces…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={isStreaming}
          />
          <div className="sa-bar-row">
            <span className="sa-hint">always available</span>
            <button className="sa-send" onClick={handleSend} disabled={isStreaming}>
              <SendHorizontal size={11} />
              Ask
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
