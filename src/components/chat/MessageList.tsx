import { useEffect, useRef } from "react"
import type { Message } from "@/types"
import { MessageBubble } from "./MessageBubble"
import { DispatchDivider } from "./DispatchDivider"

interface MessageListProps {
  messages: Message[]
  isStreaming: boolean
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length, isStreaming])

  if (messages.length === 0) {
    return (
      <div className="chat-msgs chat-empty">
        <p>Start a conversation.</p>
      </div>
    )
  }

  const items: React.ReactNode[] = []
  let prevSource: string | undefined

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const source = msg.metadata?.source as string | undefined

    // Insert divider when source switches to/from "majordomo"
    if (
      source !== prevSource &&
      (source === "majordomo" || prevSource === "majordomo") &&
      i > 0
    ) {
      const label =
        source === "majordomo" ? "Task from Majordomo" : "Back to your conversation"
      items.push(<DispatchDivider key={`div-${msg.id}`} label={label} />)
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
    <div className="chat-msgs" role="log" aria-live="polite">
      {items}
      <div ref={bottomRef} />
    </div>
  )
}
