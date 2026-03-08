import { useState } from "react"
import type { Message } from "@/types"

interface ToolResultBubbleProps {
  message: Message
}

/**
 * Renders a role:"tool" message as a collapsible panel showing the tool
 * name, call arguments, and result. Failed results are highlighted in red.
 */
export function ToolResultBubble({ message }: ToolResultBubbleProps) {
  const [open, setOpen] = useState(false)

  const toolName = message.toolName ?? "tool"
  const isError = message.content.startsWith("Error:") || message.content.startsWith("error:")

  // Try to pretty-print JSON result; fall back to raw text
  let resultDisplay = message.content
  try {
    const parsed = JSON.parse(message.content)
    resultDisplay = JSON.stringify(parsed, null, 2)
  } catch {
    // keep raw
  }

  return (
    <div className={`tool-result-bubble${isError ? " tool-result-error" : ""}`}>
      <button
        className="tool-result-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="tool-result-icon">{isError ? "✗" : "✓"}</span>
        <span className="tool-result-name">{toolName}</span>
        <span className="tool-result-chevron">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="tool-result-body">
          <pre className="tool-result-content">{resultDisplay}</pre>
        </div>
      )}
    </div>
  )
}
