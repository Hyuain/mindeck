import { useEffect, useCallback, useState } from "react"
import { Eraser, X } from "lucide-react"
import { useChatStore } from "@/stores/chat"
import { useProviderStore } from "@/stores/provider"
import { useWorkspaceStore } from "@/stores/workspace"
import { loadMessages, clearMessages } from "@/services/conversation"
import {
  agentPool,
  registerChatCallbacks,
  clearChatCallbacks,
} from "@/services/agent-pool"
import { ModelSelector } from "@/components/provider/ModelSelector"
import { MessageList } from "./MessageList"
import { ChatInput } from "./ChatInput"
import { ToolActivityRow } from "@/components/majordomo/ToolActivityRow"
import { useAgentsStore } from "@/stores/agents"
import type { ToolActivity, Workspace } from "@/types"

interface ChatPanelProps {
  workspace: Workspace
  onPreview?: (content: string) => void
  onClose?: () => void
}

export function ChatPanel({ workspace, onPreview, onClose }: ChatPanelProps) {
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

  const msgs = messages[workspace.id] ?? []
  const isStreaming = streaming[workspace.id] ?? false

  // Load persisted messages on workspace open
  useEffect(() => {
    if (messages[workspace.id] !== undefined) return
    loadMessages(workspace.id)
      .then((loaded) => {
        if (useChatStore.getState().messages[workspace.id] === undefined) {
          setMessages(workspace.id, loaded)
        }
      })
      .catch((err: unknown) =>
        console.warn("Could not load messages (browser mode):", err)
      )
  }, [workspace.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Register UI callbacks with the pool agent on mount; clear on unmount
  useEffect(() => {
    const { setStreaming } = useChatStore.getState()

    registerChatCallbacks(workspace.id, {
      onChunk: (_delta) => {
        // message content already updated by agent via Zustand — no extra work needed
      },
      onToolStart: (activity) => {
        setToolActivities((prev) => {
          const exists = prev.some((a) => a.id === activity.id)
          return exists
            ? prev.map((a) => (a.id === activity.id ? activity : a))
            : [...prev, activity]
        })
        // Track sub-agents in global store for AgentsPanel tree
        if (activity.name.startsWith("[") && activity.name.endsWith("]")) {
          const name = activity.name.slice(1, -1)
          useAgentsStore.getState().upsertSubAgent(workspace.id, name, "running")
        }
      },
      onToolEnd: (activity) => {
        setToolActivities((prev) =>
          prev.map((a) => (a.id === activity.id ? activity : a))
        )
        // Update sub-agent status in global store
        if (activity.name.startsWith("[") && activity.name.endsWith("]")) {
          const name = activity.name.slice(1, -1)
          const status = activity.status === "error" ? "error" : "done"
          useAgentsStore.getState().upsertSubAgent(workspace.id, name, status)
        }
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
          setTimeout(() => {
            setToolActivities([])
            useAgentsStore.getState().clearSubAgents(workspace.id)
          }, 3000)
        }
      },
      onDispatchReceived: (task) => {
        setPendingDispatch(task)
      },
    })

    return () => {
      clearChatCallbacks(workspace.id)
    }
  }, [workspace.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep pool agent config in sync with workspace changes (model changes, etc.)
  useEffect(() => {
    agentPool.update(workspace)
  }, [workspace])

  const handleSend = useCallback(
    (content: string, ephemeralSkillIds: string[]) => {
      agentPool.get(workspace.id)?.send(content, ephemeralSkillIds)
    },
    [workspace.id]
  )

  const handleClearContext = useCallback(() => {
    setConfirmClear(false)
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
          <div className="chat-head-actions">
            <button
              className="chat-clear-btn"
              onClick={() => setConfirmClear(true)}
              title="Clear conversation history"
              disabled={isStreaming || msgs.length === 0}
            >
              <Eraser size={11} />
            </button>
            {onClose && (
              <button className="pane-close-btn" onClick={onClose} title="Close pane">
                <X size={12} />
              </button>
            )}
          </div>
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
        <ChatInput
          workspaceId={workspace.id}
          onSend={handleSend}
          disabled={isStreaming}
        />
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
