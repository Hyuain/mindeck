import { useState } from "react"
import { ChevronRight, ChevronDown, LayoutGrid, Unplug } from "lucide-react"
import { useAgentAppsStore } from "@/stores/agent-apps"
import type { AgentAppManifest, AppInstance } from "@/types"
import { getAppRoleLabel } from "@/services/agent-apps/labels"

// ---- AgentAppNode ----

interface AgentAppNodeProps {
  instance: AppInstance
  manifest: AgentAppManifest
  workspaceId: string
  onPointerDown?: (e: React.PointerEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export function AgentAppNode({
  instance,
  manifest,
  workspaceId,
  onPointerDown,
  onContextMenu,
}: AgentAppNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const { deactivateApp } = useAgentAppsStore()

  const label = instance.label ? `${manifest.name} (${instance.label})` : manifest.name

  const mcpCount = manifest.mcpDependencies?.length ?? 0
  const triggerSummary = manifest.harness?.triggers
    .map((t) => {
      if (t.event === "file_written" && t.pattern) return `file_written ${t.pattern}`
      return t.event
    })
    .join(", ")

  return (
    <div className="agent-app-node">
      <div
        className="agent-tree-item agent-app-node-row"
        onClick={() => setExpanded((e) => !e)}
        onPointerDown={onPointerDown}
        onContextMenu={onContextMenu}
        style={{ userSelect: "none", cursor: onPointerDown ? "grab" : "pointer" }}
      >
        <div className="agent-tree-connector" />
        <div className="agent-tree-icon sub-agent">
          <LayoutGrid size={10} />
        </div>
        <span className="agent-tree-label">{label}</span>
        {instance.label && (
          <span className="agent-app-instance-label">{instance.label}</span>
        )}
        <span className="agent-app-kind-badge">{getAppRoleLabel(manifest)}</span>
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </div>

      {expanded && (
        <div className="agent-app-node-detail">
          {manifest.nativeComponent && (
            <div className="agent-app-node-detail-row">
              <span className="agent-app-node-detail-label">Type:</span>
              <span>Built-in · {manifest.nativeComponent}</span>
            </div>
          )}
          {mcpCount > 0 && (
            <div className="agent-app-node-detail-row">
              <span className="agent-app-node-detail-label">MCPs:</span>
              <span>
                {mcpCount} server{mcpCount !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          {triggerSummary && (
            <div className="agent-app-node-detail-row">
              <span className="agent-app-node-detail-label">Triggers:</span>
              <span className="agent-app-node-detail-trigger">{triggerSummary}</span>
            </div>
          )}
          <button
            className="agent-app-node-deactivate"
            onClick={(e) => {
              e.stopPropagation()
              deactivateApp(workspaceId, instance.instanceId)
            }}
          >
            <Unplug size={9} /> Deactivate
          </button>
        </div>
      )}
    </div>
  )
}
