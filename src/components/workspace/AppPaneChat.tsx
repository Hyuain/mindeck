import { useState, useRef, useEffect, useCallback } from "react"

interface AppPaneChatProps {
  appId: string
  title: string
}

interface PaneChatMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
}

export function AppPaneChat({ appId, title }: AppPaneChatProps) {
  const [messages, setMessages] = useState<PaneChatMessage[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const currentAssistantIdRef = useRef<string | null>(null)

  // Auto-scroll when messages change
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = useCallback(() => {
    if (!input.trim() || streaming) return
    const userMsg: PaneChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    window.dispatchEvent(
      new CustomEvent(`app-pane-user-msg:${appId}`, { detail: input.trim() })
    )
  }, [input, streaming, appId])

  // Listen for app chunks and messages
  useEffect(() => {
    function handleChunk(e: Event) {
      const text = (e as CustomEvent).detail as string
      setStreaming(true)
      setMessages((prev) => {
        if (!currentAssistantIdRef.current) {
          currentAssistantIdRef.current = crypto.randomUUID()
          return [
            ...prev,
            { id: currentAssistantIdRef.current, role: "assistant" as const, content: text },
          ]
        }
        return prev.map((m) =>
          m.id === currentAssistantIdRef.current
            ? { ...m, content: m.content + text }
            : m
        )
      })
    }

    function handleMessage(e: Event) {
      const msg = (e as CustomEvent).detail as {
        role: "assistant" | "system"
        content: string
      }
      currentAssistantIdRef.current = null
      setStreaming(false)
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), ...msg }])
    }

    function handleDone() {
      currentAssistantIdRef.current = null
      setStreaming(false)
    }

    window.addEventListener(`app-pane-chunk:${appId}`, handleChunk)
    window.addEventListener(`app-pane-msg:${appId}`, handleMessage)
    window.addEventListener(`app-pane-done:${appId}`, handleDone)

    return () => {
      window.removeEventListener(`app-pane-chunk:${appId}`, handleChunk)
      window.removeEventListener(`app-pane-msg:${appId}`, handleMessage)
      window.removeEventListener(`app-pane-done:${appId}`, handleDone)
    }
  }, [appId])

  return (
    <div className="app-pane-chat">
      <div className="app-pane-chat-header">{title}</div>
      <div
        className="app-pane-chat-messages"
        ref={listRef}
        role="log"
        aria-live="polite"
      >
        {messages.map((m) => (
          <div key={m.id} className={`app-pane-msg app-pane-msg-${m.role}`}>
            <div className="app-pane-msg-content">{m.content}</div>
          </div>
        ))}
      </div>
      <div className="app-pane-chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Type your thoughts..."
          rows={1}
          disabled={streaming}
        />
      </div>
    </div>
  )
}
