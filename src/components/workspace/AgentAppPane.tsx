import { X, Plug, AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { useAgentAppsStore } from "@/stores/agent-apps"
import { MCPAppFrame } from "./MCPAppFrame"
import type { AgentAppManifest } from "@/types"

interface AgentAppPaneProps {
  appId?: string
  workspaceId: string
  onClose?: () => void
}

function StatusBadge({ status }: { status?: string }) {
  if (status === "connected")
    return (
      <span className="agent-app-badge agent-app-badge--connected">
        <CheckCircle2 size={10} />
        connected
      </span>
    )
  if (status === "connecting")
    return (
      <span className="agent-app-badge agent-app-badge--connecting">
        <Loader2 size={10} className="spin" />
        connecting
      </span>
    )
  if (status === "error")
    return (
      <span className="agent-app-badge agent-app-badge--error">
        <AlertCircle size={10} />
        error
      </span>
    )
  return (
    <span className="agent-app-badge agent-app-badge--disconnected">disconnected</span>
  )
}

function AppDetail({ manifest }: { manifest: AgentAppManifest }) {
  const hasMCPApp =
    manifest.capabilities.ui?.renderer.type === "mcp-app"

  return (
    <div className="agent-app-detail">
      <div className="agent-app-meta">
        <span className="agent-app-kind">{manifest.kind}</span>
        <span className="agent-app-version">v{manifest.version}</span>
      </div>
      <p className="agent-app-description">{manifest.description}</p>

      {manifest.capabilities.tools && manifest.capabilities.tools.length > 0 && (
        <div className="agent-app-tools">
          <h4>Tools ({manifest.capabilities.tools.length})</h4>
          <ul>
            {manifest.capabilities.tools.map((t) => (
              <li key={t.name}>
                <code>{t.name}</code>
                {t.description && <span> — {t.description}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasMCPApp && manifest.capabilities.ui?.renderer.type === "mcp-app" && (
        <MCPAppFrame
          resourceUri={manifest.capabilities.ui.renderer.resourceUri}
          workspaceId=""
          appId={manifest.id}
        />
      )}
    </div>
  )
}

export function AgentAppPane({ appId, workspaceId, onClose }: AgentAppPaneProps) {
  const { workspaceDeps, workspaceApps } = useAgentAppsStore()

  const deps = workspaceDeps[workspaceId] ?? []
  const apps = workspaceApps[workspaceId] ?? []

  // Find manifest by appId if provided
  const manifest = appId ? apps.find((a) => a.id === appId) : undefined

  if (manifest) {
    return (
      <div className="agent-app-pane">
        <div className="agent-app-header">
          <Plug size={14} />
          <span>{manifest.name}</span>
          {onClose && (
            <button className="icon-btn" onClick={onClose}>
              <X size={12} />
            </button>
          )}
        </div>
        <AppDetail manifest={manifest} />
      </div>
    )
  }

  // Show all MCP deps for this workspace
  return (
    <div className="agent-app-pane">
      <div className="agent-app-header">
        <Plug size={14} />
        <span>Agent Apps</span>
        {onClose && (
          <button className="icon-btn" onClick={onClose}>
            <X size={12} />
          </button>
        )}
      </div>

      {deps.length === 0 && apps.length === 0 ? (
        <div className="agent-app-empty">
          <p>No MCP servers or Agent Apps configured for this workspace.</p>
          <p>
            Add <code>mcpDependencies</code> to your workspace settings to connect MCP
            tool servers.
          </p>
        </div>
      ) : (
        <div className="agent-app-list">
          {deps.map((dep) => (
            <div key={dep.name} className="agent-app-row">
              <div className="agent-app-row-name">
                <code>{dep.name}</code>
                <span className="agent-app-transport">{dep.transport}</span>
              </div>
              <StatusBadge status={dep.status} />
              {dep.discoveredTools && dep.discoveredTools.length > 0 && (
                <div className="agent-app-row-tools">
                  {dep.discoveredTools.length} tool
                  {dep.discoveredTools.length !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
