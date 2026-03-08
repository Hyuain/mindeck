import { useCallback, useEffect, useRef } from "react"
import type { Message } from "@/types"
import { MessageBubble } from "./MessageBubble"
import { DispatchDivider } from "./DispatchDivider"

const SCROLL_THRESHOLD = 80 // px from bottom — within this distance, auto-scroll kicks in

interface MessageListProps {
  messages: Message[]
  isStreaming: boolean
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isNearBottomRef.current = distFromBottom <= SCROLL_THRESHOLD
  }, [])

  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages.length, isStreaming])

  if (messages.length === 0) {
    return (
      <div ref={containerRef} className="chat-msgs chat-empty">
        <p>Start a conversation.</p>
      </div>
    )
  }

  const items: React.ReactNode[] = []
  let prevSource: string | undefined

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const source = msg.metadata?.source as string | undefined

    // Insert divider only when entering a majordomo task (not when leaving)
    if (source !== prevSource && source === "majordomo" && i > 0) {
      items.push(<DispatchDivider key={`div-${msg.id}`} label="Task from Majordomo" />)
    }

    items.push(
      <MessageBubble
        key={msg.id}
        message={msg}
        isStreaming={isStreaming && i === messages.length - 1 && msg.role === "assistant"}
      />
    )

    if (msg.role === "user") {
      prevSource = source
    }
  }

  return (
    <div
      ref={containerRef}
      className="chat-msgs"
      role="log"
      aria-live="polite"
      onScroll={handleScroll}
    >
      {items}
      <div ref={bottomRef} />
    </div>
  )
}
