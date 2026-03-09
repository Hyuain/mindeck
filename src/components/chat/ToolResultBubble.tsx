import { useState } from "react"
import { detectInjection } from "@/services/prompt-injection"
import type { InjectionDetection, Message } from "@/types"

interface ToolResultBubbleProps {
  message: Message
  /** Pre-computed injection warning; if omitted, detection runs on message content */
  injectionWarning?: InjectionDetection
}

/**
 * Renders a role:"tool" message as a collapsible panel showing the tool
 * name, call arguments, and result. Failed results are highlighted in red.
 * Shows a prompt-injection warning banner when a pattern is detected.
 */
export function ToolResultBubble({ message, injectionWarning }: ToolResultBubbleProps) {
  const [open, setOpen] = useState(false)

  const toolName = message.toolName ?? "tool"
  const isError = message.content.startsWith("Error:") || message.content.startsWith("error:")

  // Detect injection if not pre-computed by the caller
  const warning = injectionWarning ?? detectInjection(message.content)

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
      {warning && (
        <div className={`tool-result-injection tool-result-injection--${warning.severity}`}>
          <span className="tool-result-injection-icon">
            {warning.severity === "high" ? "⛔" : warning.severity === "medium" ? "⚠️" : "ℹ️"}
          </span>
          <span className="tool-result-injection-label">
            Injection detected ({warning.severity}):
          </span>
          <span className="tool-result-injection-snippet">{warning.snippet}</span>
        </div>
      )}
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
