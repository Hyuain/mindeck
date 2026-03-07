import { useState } from "react"
import type { ToolActivity } from "@/types"

interface ToolActivityRowProps {
  activity: ToolActivity
}

function statusIcon(status: ToolActivity["status"]): string {
  if (status === "running") return "⏳"
  if (status === "done") return "✓"
  return "✗"
}

function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args)
  if (entries.length === 0) return "()"
  const short = entries
    .slice(0, 2)
    .map(([k, v]) => {
      const val = typeof v === "string" ? `"${v.slice(0, 40)}"` : String(v)
      return `${k}: ${val}`
    })
    .join(", ")
  return `(${short}${entries.length > 2 ? ", …" : ""})`
}

function formatResult(result: unknown): string {
  if (result === undefined || result === null) return ""
  if (typeof result === "string") return result.slice(0, 400)
  try {
    const s = JSON.stringify(result, null, 2)
    return s.slice(0, 400) + (s.length > 400 ? "\n…" : "")
  } catch {
    return String(result)
  }
}

function formatArgsFull(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, null, 2)
  } catch {
    return String(args)
  }
}

export function ToolActivityRow({ activity }: ToolActivityRowProps) {
  const [expanded, setExpanded] = useState(false)
  const isRunning = activity.status === "running"
  const isError = activity.status === "error"
  const isSubAgent = Boolean(activity.subAgent)
  // Top-level sub-agent marker (name starts with "[") vs a tool call inside a sub-agent
  const isSubAgentBadge = isSubAgent && activity.name.startsWith("[")
  const hasDetails =
    Object.keys(activity.args).length > 0 || activity.result !== undefined

  const accentColor = isSubAgentBadge
    ? "var(--color-ac)" // emerald for sub-agent lifecycle
    : isSubAgent
      ? "color-mix(in srgb, var(--color-sa) 70%, var(--color-ac))" // muted violet for sub-agent tool calls
      : "var(--color-sa)" // standard violet

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "4px 8px",
        paddingLeft: isSubAgent && !isSubAgentBadge ? 20 : 8,
        borderRadius: 4,
        background: isSubAgentBadge
          ? "color-mix(in srgb, var(--color-ac) 10%, transparent)"
          : "color-mix(in srgb, var(--color-sa) 12%, transparent)",
        borderLeft: `2px solid ${accentColor}`,
        fontSize: 11,
        fontFamily: "var(--font-mono)",
        color: isError ? "var(--color-red, #f87171)" : "var(--color-t1)",
        opacity: isRunning ? 0.8 : 1,
      }}
    >
      {/* Header row — always visible */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          cursor: hasDetails ? "pointer" : "default",
          userSelect: "none",
        }}
        onClick={() => hasDetails && setExpanded((v) => !v)}
        title={hasDetails ? (expanded ? "Collapse" : "Expand") : undefined}
      >
        <span
          style={{
            animation: isRunning ? "mj-pulse 1.2s ease-in-out infinite" : undefined,
            flexShrink: 0,
          }}
        >
          {statusIcon(activity.status)}
        </span>
        <span style={{ color: accentColor, fontWeight: 600 }}>{activity.name}</span>
        {!expanded && (
          <span style={{ color: "var(--color-t2)" }}>{formatArgs(activity.args)}</span>
        )}
        {hasDetails && (
          <span
            style={{
              marginLeft: "auto",
              color: "var(--color-t2)",
              fontSize: 9,
              flexShrink: 0,
            }}
          >
            {expanded ? "▲" : "▼"}
          </span>
        )}
      </div>

      {/* Expandable detail panel */}
      {expanded && (
        <div
          style={{
            paddingLeft: 18,
            paddingTop: 4,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {Object.keys(activity.args).length > 0 && (
            <div>
              <div style={{ color: "var(--color-t2)", marginBottom: 2, fontSize: 10 }}>
                args
              </div>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  color: "var(--color-t1)",
                  background: "color-mix(in srgb, var(--color-bg-2) 80%, transparent)",
                  padding: "4px 6px",
                  borderRadius: 3,
                  fontSize: 10,
                }}
              >
                {formatArgsFull(activity.args)}
              </pre>
            </div>
          )}
          {activity.result !== undefined && !isRunning && (
            <div>
              <div
                style={{
                  color: isError ? "var(--color-red, #f87171)" : "var(--color-t2)",
                  marginBottom: 2,
                  fontSize: 10,
                }}
              >
                → result
              </div>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  color: isError ? "var(--color-red, #f87171)" : "var(--color-t1)",
                  background: "color-mix(in srgb, var(--color-bg-2) 80%, transparent)",
                  padding: "4px 6px",
                  borderRadius: 3,
                  fontSize: 10,
                }}
              >
                {formatResult(activity.result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
