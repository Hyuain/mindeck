import { useState } from "react"
import {
  X,
  Plug,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react"
import { useAgentAppsStore } from "@/stores/agent-apps"
import { mcpManager } from "@/services/mcp/manager"
import { MCPAppFrame } from "./MCPAppFrame"
import { MCPServerForm } from "./MCPServerForm"
import type { AgentAppManifest, MCPDependency } from "@/types"

interface AgentAppPaneProps {
  appId?: string
  workspaceId: string
  onClose?: () => void
}

type FormMode =
  | { type: "closed" }
  | { type: "add" }
  | { type: "edit"; dep: MCPDependency }

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
  const hasMCPApp = manifest.capabilities.ui?.renderer.type === "mcp-app"

  return (
    <div className="agent-app-detail">
      <div className="agent-app-meta">
        <span className="agent-app-kind">{manifest.nativeComponent ?? "MCP"}</span>
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
  const { workspaceDeps, workspaceApps, addDep, removeDep, updateDep } =
    useAgentAppsStore()
  const [formMode, setFormMode] = useState<FormMode>({ type: "closed" })

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

  function handleSave(dep: MCPDependency) {
    if (formMode.type === "add") {
      addDep(workspaceId, dep)
      // Connect newly added MCP server
      mcpManager
        .connectWorkspaceDeps(workspaceId, [dep])
        .catch((err: unknown) => console.warn("[AgentAppPane] MCP connect failed", err))
    } else if (formMode.type === "edit") {
      const oldName = formMode.dep.name
      // Disconnect old, reconnect with updated config
      mcpManager
        .disconnectWorkspace(workspaceId)
        .catch(() => {})
        .finally(() => {
          updateDep(workspaceId, oldName, dep)
          const allDeps = deps.map((d) => (d.name === oldName ? dep : d))
          mcpManager
            .connectWorkspaceDeps(workspaceId, allDeps)
            .catch((err: unknown) =>
              console.warn("[AgentAppPane] MCP reconnect failed", err)
            )
        })
    }
    setFormMode({ type: "closed" })
  }

  function handleRemove(depName: string) {
    removeDep(workspaceId, depName)
    // Disconnect and reconnect remaining deps
    const remaining = deps.filter((d) => d.name !== depName)
    mcpManager
      .disconnectWorkspace(workspaceId)
      .catch(() => {})
      .finally(() => {
        if (remaining.length > 0) {
          mcpManager
            .connectWorkspaceDeps(workspaceId, remaining)
            .catch((err: unknown) =>
              console.warn("[AgentAppPane] MCP reconnect after remove failed", err)
            )
        }
      })
  }

  return (
    <>
      <div className="agent-app-pane">
        <div className="agent-app-header">
          <Plug size={14} />
          <span>Agent Apps</span>
          <button
            className="icon-btn agent-app-add-btn"
            onClick={() => setFormMode({ type: "add" })}
            title="Add MCP server"
          >
            <Plus size={12} />
          </button>
          {onClose && (
            <button className="icon-btn" onClick={onClose}>
              <X size={12} />
            </button>
          )}
        </div>

        {deps.length === 0 && apps.length === 0 ? (
          <div className="agent-app-empty">
            <p>No MCP servers or Agent Apps configured for this workspace.</p>
            <button
              className="agent-app-empty-btn"
              onClick={() => setFormMode({ type: "add" })}
            >
              <Plus size={12} /> Add MCP Server
            </button>
          </div>
        ) : (
          <div className="agent-app-list">
            {deps.map((dep) => (
              <div key={dep.name} className="agent-app-row">
                <div className="agent-app-row-main">
                  <div className="agent-app-row-name">
                    <code>{dep.name}</code>
                    <span className="agent-app-transport">{dep.transport}</span>
                  </div>
                  <div className="agent-app-row-meta">
                    <StatusBadge status={dep.status} />
                    {dep.discoveredTools && dep.discoveredTools.length > 0 && (
                      <span className="agent-app-row-tools">
                        {dep.discoveredTools.length} tool
                        {dep.discoveredTools.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    {dep.command && (
                      <span className="agent-app-row-cmd" title={dep.command}>
                        {dep.command.slice(0, 32)}
                        {dep.command.length > 32 ? "…" : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className="agent-app-row-actions">
                  <button
                    className="icon-btn"
                    title="Edit"
                    onClick={() => setFormMode({ type: "edit", dep })}
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    className="icon-btn icon-btn--danger"
                    title="Remove"
                    onClick={() => handleRemove(dep.name)}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {formMode.type !== "closed" && (
        <MCPServerForm
          initial={formMode.type === "edit" ? formMode.dep : undefined}
          onSave={handleSave}
          onCancel={() => setFormMode({ type: "closed" })}
        />
      )}
    </>
  )
}
