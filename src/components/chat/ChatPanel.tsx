import { useEffect, useRef, useCallback, useState } from "react"
import { Eraser } from "lucide-react"
import { useChatStore } from "@/stores/chat"
import { useProviderStore } from "@/stores/provider"
import { useWorkspaceStore } from "@/stores/workspace"
import { loadMessages, clearMessages } from "@/services/conversation"
import { WorkspaceAgent } from "@/services/workspace-agent"
import { ModelSelector } from "@/components/provider/ModelSelector"
import { MessageList } from "./MessageList"
import { ChatInput } from "./ChatInput"
import { ToolActivityRow } from "@/components/majordomo/ToolActivityRow"
import type { ToolActivity, Workspace } from "@/types"

interface ChatPanelProps {
  workspace: Workspace
  onPreview?: (content: string) => void
}

export function ChatPanel({ workspace, onPreview }: ChatPanelProps) {
  const {
    messages,
    streaming,
    setMessages,
    clearMessages: clearChatMessages,
  } = useChatStore()
  const { providers } = useProviderStore()
  const { updateWorkspace } = useWorkspaceStore()

  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([])
  const [pendingDispatch, setPendingDispatch] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const agentRef = useRef<WorkspaceAgent | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const msgs = messages[workspace.id] ?? []
  const isStreaming = streaming[workspace.id] ?? false

  // Load persisted messages on workspace open
  useEffect(() => {
    if (messages[workspace.id] !== undefined) return // already loaded
    loadMessages(workspace.id)
      .then((loaded) => {
        // Guard against race: if messages were added during loading (e.g., from a
        // Majordomo dispatch), don't overwrite them — those are more current.
        if (useChatStore.getState().messages[workspace.id] === undefined) {
          setMessages(workspace.id, loaded)
        }
      })
      .catch((err: unknown) =>
        console.warn("Could not load messages (browser mode):", err)
      )
  }, [workspace.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Create / reconnect the workspace agent whenever workspace changes
  useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = new AbortController()

    const { setStreaming } = useChatStore.getState()

    const agent = new WorkspaceAgent({
      workspace,
      signal: abortRef.current.signal,
      onChunk: (delta) => {
        if (onPreview && delta.length > 0) {
          // Accumulate for preview (handled via full content in process())
        }
      },
      onToolStart: (activity) => {
        setToolActivities((prev) => {
          const exists = prev.some((a) => a.id === activity.id)
          return exists
            ? prev.map((a) => (a.id === activity.id ? activity : a))
            : [...prev, activity]
        })
      },
      onToolEnd: (activity) => {
        setToolActivities((prev) =>
          prev.map((a) => (a.id === activity.id ? activity : a))
        )
      },
      onStreamingChange: (isStreamingNow) => {
        setStreaming(workspace.id, isStreamingNow)
        if (!isStreamingNow) {
          setPendingDispatch(null)
          // Auto-preview on completion
          const { messages: currentMessages } = useChatStore.getState()
          const currentMsgs = currentMessages[workspace.id] ?? []
          const lastMsg = currentMsgs[currentMsgs.length - 1]
          if (lastMsg?.role === "assistant" && lastMsg.content.length > 50 && onPreview) {
            onPreview(lastMsg.content)
          }
          // Clear tool activities after a short delay
          setTimeout(() => setToolActivities([]), 3000)
        }
      },
      onDispatchReceived: (task) => {
        setPendingDispatch(task)
      },
    })

    agent.connect()
    agentRef.current = agent

    return () => {
      agent.disconnect()
      abortRef.current?.abort()
    }
  }, [workspace.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep agent config in sync with workspace changes (model changes, etc.)
  useEffect(() => {
    agentRef.current?.updateConfig(workspace)
  }, [workspace])

  const handleSend = useCallback((content: string) => {
    agentRef.current?.send(content)
  }, [])

  const handleClearContext = useCallback(() => {
    clearChatMessages(workspace.id)
    clearMessages(workspace.id).catch(console.warn)
  }, [workspace.id, clearChatMessages])

  function handleModelChange(providerId: string, modelId: string) {
    updateWorkspace(workspace.id, {
      agentConfig: { ...workspace.agentConfig, providerId, modelId },
      updatedAt: new Date().toISOString(),
    })
  }

  // Active tool activities (those still running or recently finished)
  const activeActivities = toolActivities.filter((a) => a.status === "running")

  return (
    <>
      <div className="chat-panel">
        <div className="chat-head">
          <ModelSelector
            providers={providers}
            selectedProviderId={workspace.agentConfig.providerId}
            selectedModelId={workspace.agentConfig.modelId}
            onChange={handleModelChange}
          />
          <button
            className="chat-clear-btn"
            onClick={() => setConfirmClear(true)}
            title="Clear conversation history"
            disabled={isStreaming || msgs.length === 0}
          >
            <Eraser size={11} />
          </button>
        </div>
        <MessageList messages={msgs} isStreaming={isStreaming} />
        {pendingDispatch && (
          <div className="chat-dispatch-incoming">
            <span className="chat-dispatch-label">↓ Majordomo</span>
            <span className="chat-dispatch-task">{pendingDispatch}</span>
          </div>
        )}
        {activeActivities.length > 0 && (
          <div className="chat-tool-activities">
            {activeActivities.map((a) => (
              <ToolActivityRow key={a.id} activity={a} />
            ))}
          </div>
        )}
        <ChatInput onSend={handleSend} disabled={isStreaming} />
      </div>
      {confirmClear && (
        <div className="mj-confirm-overlay" onClick={() => setConfirmClear(false)}>
          <div className="mj-confirm" onClick={(e) => e.stopPropagation()}>
            <p className="mj-confirm-msg">
              Clear conversation history for &ldquo;{workspace.name}&rdquo;?
            </p>
            <div className="mj-confirm-actions">
              <button
                className="mj-confirm-cancel"
                onClick={() => setConfirmClear(false)}
              >
                Cancel
              </button>
              <button className="mj-confirm-delete" onClick={handleClearContext}>
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
