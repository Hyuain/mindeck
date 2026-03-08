import { useState } from "react"
import type { ToolActivity } from "@/types"

interface ToolActivityRowProps {
  activity: ToolActivity
}

function statusIcon(status: ToolActivity["status"]): string {
  if (status === "running") return "◌"
  if (status === "done") return "✓"
  return "✗"
}

function formatArgsShort(args: Record<string, unknown>): string {
  const entries = Object.entries(args)
  if (entries.length === 0) return ""
  const [k, v] = entries[0]
  const val = typeof v === "string" ? v.slice(0, 60) : String(v).slice(0, 60)
  const label = `${k}: ${val}${val.length >= 60 ? "…" : ""}${entries.length > 1 ? ` +${entries.length - 1}` : ""}`
  return label
}

function formatArgsFull(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, null, 2)
  } catch {
    return String(args)
  }
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

export function ToolActivityRow({ activity }: ToolActivityRowProps) {
  const [expanded, setExpanded] = useState(false)
  const isRunning = activity.status === "running"
  const isError = activity.status === "error"
  const isSubAgent = Boolean(activity.subAgent)
  // Top-level sub-agent lifecycle marker: name wrapped in brackets like "[agent-name]"
  const isSubAgentBadge = isSubAgent && activity.name.startsWith("[")
  const hasDetails =
    Object.keys(activity.args).length > 0 || activity.result !== undefined

  // Strip brackets for display
  const displayName = isSubAgentBadge
    ? activity.name.slice(1, -1)
    : activity.name

  const rowClass = [
    "tar",
    isSubAgentBadge ? "tar-sub-badge" : isSubAgent ? "tar-sub-tool" : "tar-main",
    isError ? "tar-error" : "",
    isRunning ? "tar-running" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className={rowClass}>
      {/* Header row */}
      <div
        className="tar-header"
        onClick={() => hasDetails && setExpanded((v) => !v)}
        style={{ cursor: hasDetails ? "pointer" : "default" }}
      >
        <span className={`tar-status ${isRunning ? "tar-spin" : ""}`}>
          {statusIcon(activity.status)}
        </span>
        <span className="tar-name">{displayName}</span>
        {!expanded && (
          <span className="tar-args-preview">{formatArgsShort(activity.args)}</span>
        )}
        {hasDetails && (
          <span className="tar-toggle">{expanded ? "▲" : "▼"}</span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="tar-detail">
          {Object.keys(activity.args).length > 0 && (
            <div className="tar-detail-block">
              <div className="tar-detail-label">args</div>
              <pre className="tar-detail-pre">{formatArgsFull(activity.args)}</pre>
            </div>
          )}
          {activity.result !== undefined && !isRunning && (
            <div className="tar-detail-block">
              <div className={`tar-detail-label ${isError ? "tar-detail-label-err" : ""}`}>
                → result
              </div>
              <pre className={`tar-detail-pre ${isError ? "tar-detail-pre-err" : ""}`}>
                {formatResult(activity.result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
