import { useEffect, useRef, useCallback } from "react"
import { useChatStore } from "@/stores/chat"
import { useProviderStore } from "@/stores/provider"
import { useWorkspaceStore } from "@/stores/workspace"
import { providerManager } from "@/services/providers/manager"
import { loadMessages, appendMessage, makeMessage } from "@/services/conversation"
import { ModelSelector } from "@/components/provider/ModelSelector"
import { MessageList } from "./MessageList"
import { ChatInput } from "./ChatInput"
import type { Workspace } from "@/types"

interface ChatPanelProps {
  workspace: Workspace
  onPreview?: (content: string) => void
}

export function ChatPanel({ workspace, onPreview }: ChatPanelProps) {
  const {
    messages,
    streaming,
    setMessages,
    appendMessage: storeAppend,
    updateLastMessage,
    setStreaming,
  } = useChatStore()
  const { providers } = useProviderStore()
  const { updateWorkspace } = useWorkspaceStore()
  const abortRef = useRef<AbortController | null>(null)

  const msgs = messages[workspace.id] ?? []
  const isStreaming = streaming[workspace.id] ?? false

  // Load persisted messages on workspace open
  useEffect(() => {
    if (messages[workspace.id]) return // already loaded
    loadMessages(workspace.id)
      .then((loaded) => setMessages(workspace.id, loaded))
      .catch((err: unknown) =>
        console.warn("Could not load messages (browser mode):", err)
      )
  }, [workspace.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(
    async (content: string) => {
      const { providerId, modelId } = workspace.agentConfig

      // 1. Append + persist user message
      const userMsg = makeMessage("user", content)
      storeAppend(workspace.id, userMsg)
      appendMessage(workspace.id, userMsg).catch(console.warn)

      // 2. Prepare conversation history for the request
      const history = [...(messages[workspace.id] ?? []), userMsg].map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }))

      // 3. Append placeholder AI message
      const aiMsg = makeMessage("assistant", "", modelId, providerId)
      storeAppend(workspace.id, aiMsg)
      setStreaming(workspace.id, true)

      // 4. Stream via Rust — API key is fetched from OS Keychain inside Rust
      abortRef.current?.abort()
      abortRef.current = new AbortController()
      let fullContent = ""

      try {
        for await (const chunk of providerManager.chat(
          providerId,
          modelId,
          history,
          abortRef.current.signal,
        )) {
          fullContent += chunk.delta
          updateLastMessage(workspace.id, { content: fullContent })
        }
      } catch (err: unknown) {
        if ((err as Error)?.name !== "AbortError") {
          const errText = err instanceof Error ? err.message : "Unknown error"
          updateLastMessage(workspace.id, { content: `Error: ${errText}` })
        }
      } finally {
        setStreaming(workspace.id, false)
      }

      // 5. Persist complete AI message & emit preview
      const finalAiMsg = { ...aiMsg, content: fullContent }
      appendMessage(workspace.id, finalAiMsg).catch(console.warn)

      // 6. Update workspace status summary
      updateWorkspace(workspace.id, {
        status: "idle",
        stateSummary: fullContent.slice(0, 200),
        updatedAt: new Date().toISOString(),
      })

      // 7. Auto-preview if response is substantial
      if (fullContent.length > 50 && onPreview) {
        onPreview(fullContent)
      }
    },
    [
      workspace,
      messages,
      storeAppend,
      updateLastMessage,
      setStreaming,
      updateWorkspace,
      onPreview,
    ] // eslint-disable-line react-hooks/exhaustive-deps
  )

  function handleModelChange(providerId: string, modelId: string) {
    updateWorkspace(workspace.id, {
      agentConfig: { ...workspace.agentConfig, providerId, modelId },
      updatedAt: new Date().toISOString(),
    })
  }

  return (
    <div className="chat-panel">
      <div className="chat-head">
        <ModelSelector
          providers={providers}
          selectedProviderId={workspace.agentConfig.providerId}
          selectedModelId={workspace.agentConfig.modelId}
          onChange={handleModelChange}
        />
      </div>
      <MessageList messages={msgs} isStreaming={isStreaming} />
      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </div>
  )
}
