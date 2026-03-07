import { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeHighlight from "rehype-highlight"
import type { Message } from "@/types"
import { AgentTag } from "./AgentTag"

interface MessageBubbleProps {
  message: Message
  isStreaming?: boolean
}

interface ParsedContent {
  thinkingBlocks: string[]
  mainContent: string
}

/** Split out <think>...</think> or <thinking>...</thinking> blocks. */
function parseThinkingBlocks(content: string): ParsedContent {
  const thinkingBlocks: string[] = []
  const cleaned = content
    .replace(/<thinking>([\s\S]*?)<\/thinking>/gi, (_, inner: string) => {
      thinkingBlocks.push(inner.trim())
      return ""
    })
    .replace(/<think>([\s\S]*?)<\/think>/gi, (_, inner: string) => {
      thinkingBlocks.push(inner.trim())
      return ""
    })
  return { thinkingBlocks, mainContent: cleaned.trim() }
}

function getSenderLabel(message: Message): string {
  if (message.role === "user") {
    if (message.metadata?.source === "majordomo") return "Majordomo"
    return "You"
  }
  if (message.metadata?.agentId) {
    return message.metadata.agentId as string
  }
  return message.model ?? "Agent"
}

function ThinkingBlock({ content }: { content: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="thinking-block">
      <button
        className="thinking-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="thinking-icon">💭</span>
        <span className="thinking-label">Thinking</span>
        <span className="thinking-chevron">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="thinking-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user"
  const isFromMajordomo = isUser && message.metadata?.source === "majordomo"
  const isSubAgent = message.role === "assistant" && !!message.metadata?.agentId

  const senderLabel = getSenderLabel(message)

  const { thinkingBlocks, mainContent } = isUser
    ? { thinkingBlocks: [], mainContent: message.content }
    : parseThinkingBlocks(message.content)

  return (
    <div
      className={`msg ${isUser ? "user" : "ai"}${isFromMajordomo ? " msg-from-mj" : ""}${isSubAgent ? " msg-sub-agent" : ""}`}
    >
      <div className="msg-lbl">
        <span
          style={isFromMajordomo ? { color: "var(--color-mj)" } : undefined}
        >
          {senderLabel}
        </span>
        {isSubAgent && (
          <AgentTag
            label={message.metadata?.agentId as string}
            color="var(--color-ac)"
          />
        )}
      </div>
      <div className="msg-body">
        {isUser ? (
          <>
            {message.content}
            {isStreaming && <span className="stream-cursor" aria-hidden />}
          </>
        ) : (
          <div className="msg-markdown">
            {thinkingBlocks.map((block, i) => (
              <ThinkingBlock key={i} content={block} />
            ))}
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {mainContent}
            </ReactMarkdown>
            {isStreaming && <span className="stream-cursor" aria-hidden />}
          </div>
        )}
      </div>
    </div>
  )
}
