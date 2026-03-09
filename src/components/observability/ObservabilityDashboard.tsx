/**
 * E4.5 — Observability Dashboard
 *
 * Per-workspace metrics: tool call count, success rate, estimated tokens,
 * loop count, and top tools CSS bar chart. No external chart library required.
 */
import { useState } from "react"
import { X } from "lucide-react"
import { useMetricsStore } from "@/services/observability/metrics-store"
import { useWorkspaceStore } from "@/stores/workspace"

interface Props {
  onClose: () => void
}

export function ObservabilityDashboard({ onClose }: Props) {
  const byWorkspace = useMetricsStore((s) => s.byWorkspace)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Aggregate tool call counts across all workspaces for the top-tools bar chart
  const allWorkspaceIds = Object.keys(byWorkspace)
  const activeId = selectedId ?? allWorkspaceIds[0] ?? null

  const metrics = activeId ? byWorkspace[activeId] : null

  // Count by tool name for bar chart
  const toolCounts: Record<string, { total: number; errors: number }> = {}
  if (metrics) {
    for (const tc of metrics.toolCalls) {
      const entry = toolCounts[tc.toolName] ?? { total: 0, errors: 0 }
      toolCounts[tc.toolName] = {
        total: entry.total + 1,
        errors: entry.errors + (tc.success ? 0 : 1),
      }
    }
  }
  const sortedTools = Object.entries(toolCounts).sort((a, b) => b[1].total - a[1].total)
  const maxCount = sortedTools[0]?.[1].total ?? 1

  const totalCalls = metrics?.toolCalls.length ?? 0
  const successCount = metrics?.toolCalls.filter((t) => t.success).length ?? 0
  const successRate = totalCalls > 0 ? Math.round((successCount / totalCalls) * 100) : 0
  const totalTokens = metrics?.loopCompletions.reduce((s, l) => s + l.estimatedTokens, 0) ?? 0
  const loopCount = metrics?.loopCompletions.length ?? 0

  const workspaceName =
    workspaces.find((w) => w.id === activeId)?.name ?? activeId ?? "—"

  return (
    <div className="obs-overlay" onClick={onClose}>
      <div className="obs-panel" onClick={(e) => e.stopPropagation()}>
        <div className="obs-header">
          <span className="obs-title">Observability</span>
          <button className="obs-close" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {/* Workspace selector */}
        {allWorkspaceIds.length > 1 && (
          <div className="obs-ws-tabs">
            {allWorkspaceIds.map((id) => {
              const name = workspaces.find((w) => w.id === id)?.name ?? id
              return (
                <button
                  key={id}
                  className={`obs-ws-tab${id === activeId ? " active" : ""}`}
                  onClick={() => setSelectedId(id)}
                >
                  {name}
                </button>
              )
            })}
          </div>
        )}

        <div className="obs-workspace-label">{workspaceName}</div>

        {!metrics || totalCalls === 0 ? (
          <p className="obs-empty">No metrics recorded yet for this workspace.</p>
        ) : (
          <>
            {/* Summary stats */}
            <div className="obs-stats">
              <div className="obs-stat">
                <span className="obs-stat-value">{totalCalls}</span>
                <span className="obs-stat-label">Tool Calls</span>
              </div>
              <div className="obs-stat">
                <span className="obs-stat-value">{successRate}%</span>
                <span className="obs-stat-label">Success Rate</span>
              </div>
              <div className="obs-stat">
                <span className="obs-stat-value">~{totalTokens.toLocaleString()}</span>
                <span className="obs-stat-label">Est. Tokens</span>
              </div>
              <div className="obs-stat">
                <span className="obs-stat-value">{loopCount}</span>
                <span className="obs-stat-label">Loops</span>
              </div>
            </div>

            {/* Top tools bar chart */}
            {sortedTools.length > 0 && (
              <div className="obs-chart-section">
                <div className="obs-chart-title">Top Tools</div>
                <div className="obs-chart">
                  {sortedTools.slice(0, 8).map(([name, counts]) => (
                    <div key={name} className="obs-bar-row">
                      <span className="obs-bar-label">{name}</span>
                      <div className="obs-bar-track">
                        <div
                          className="obs-bar-fill"
                          style={{ width: `${(counts.total / maxCount) * 100}%` }}
                        />
                        {counts.errors > 0 && (
                          <div
                            className="obs-bar-error"
                            style={{ width: `${(counts.errors / maxCount) * 100}%` }}
                          />
                        )}
                      </div>
                      <span className="obs-bar-count">{counts.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
