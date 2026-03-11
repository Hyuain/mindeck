import { useState } from "react"
import { X, Plug, Shield, Brain, Settings2 } from "lucide-react"
import { useWorkspaceStore } from "@/stores/workspace"
import { useProviderStore } from "@/stores/provider"
import { MCPServerForm } from "./MCPServerForm"
import type { MCPDependency, SandboxMode } from "@/types"

interface OrchestratorSettingsProps {
  workspaceId: string
  onClose: () => void
}

type TabId = "model" | "mcp" | "sandbox"

const TABS: { id: TabId; label: string; Icon: typeof Plug }[] = [
  { id: "model", label: "Model", Icon: Brain },
  { id: "mcp", label: "MCP Servers", Icon: Plug },
  { id: "sandbox", label: "Sandbox", Icon: Shield },
]

export function OrchestratorSettings({ workspaceId, onClose }: OrchestratorSettingsProps) {
  const [tab, setTab] = useState<TabId>("model")
  const [showMCPForm, setShowMCPForm] = useState(false)
  const [editingDep, setEditingDep] = useState<MCPDependency | undefined>()

  const workspace = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === workspaceId))
  const { updateWorkspace } = useWorkspaceStore()
  const { providers } = useProviderStore()

  if (!workspace) return null

  const orchestratorConfig = workspace.orchestratorConfig ?? {}
  const mcpDeps = orchestratorConfig.mcpDependencies ?? workspace.mcpDependencies ?? []
  const sandboxMode = orchestratorConfig.sandboxMode ?? workspace.sandboxMode ?? "full"

  function updateOrchestratorConfig(patch: Record<string, unknown>) {
    updateWorkspace(workspaceId, {
      orchestratorConfig: { ...orchestratorConfig, ...patch },
    })
  }

  function handleAddMCP(dep: MCPDependency) {
    const existing = mcpDeps.filter((d) => d.name !== dep.name)
    updateOrchestratorConfig({ mcpDependencies: [...existing, dep] })
    setShowMCPForm(false)
    setEditingDep(undefined)
  }

  function handleRemoveMCP(name: string) {
    updateOrchestratorConfig({ mcpDependencies: mcpDeps.filter((d) => d.name !== name) })
  }

  function handleSandboxChange(mode: SandboxMode) {
    updateOrchestratorConfig({ sandboxMode: mode })
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" style={{ width: 520, maxHeight: "80vh" }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Settings2 size={14} />
            <span className="modal-title">Orchestrator Settings</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className="orch-settings-tabs">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`orch-settings-tab${tab === id ? " active" : ""}`}
              onClick={() => setTab(id)}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="orch-settings-content">
          {tab === "model" && (
            <div className="orch-settings-section">
              <div className="orch-settings-label">Provider & Model</div>
              <div className="orch-settings-desc">
                The model configuration is inherited from the workspace Agent Config.
                Change it in the workspace settings.
              </div>
              <div className="orch-settings-info-grid">
                <div className="orch-settings-info-row">
                  <span className="orch-settings-info-key">Provider</span>
                  <span className="orch-settings-info-val">
                    {providers.find((p) => p.id === workspace.agentConfig.providerId)?.name ??
                      workspace.agentConfig.providerId}
                  </span>
                </div>
                <div className="orch-settings-info-row">
                  <span className="orch-settings-info-key">Model</span>
                  <span className="orch-settings-info-val">
                    {workspace.agentConfig.modelId}
                  </span>
                </div>
                {workspace.agentConfig.planningModel && (
                  <div className="orch-settings-info-row">
                    <span className="orch-settings-info-key">Planning</span>
                    <span className="orch-settings-info-val">
                      {workspace.agentConfig.planningModel.modelId}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "mcp" && (
            <div className="orch-settings-section">
              <div className="orch-settings-label">MCP Servers</div>
              <div className="orch-settings-desc">
                MCP servers owned by the Orchestrator for this workspace.
              </div>

              {mcpDeps.length === 0 ? (
                <div className="orch-settings-empty">No MCP servers configured.</div>
              ) : (
                <div className="orch-settings-mcp-list">
                  {mcpDeps.map((dep) => (
                    <div key={dep.name} className="orch-settings-mcp-item">
                      <div className="orch-settings-mcp-name">{dep.name}</div>
                      <div className="orch-settings-mcp-meta">
                        {dep.transport}
                        {dep.discoveredTools
                          ? ` · ${dep.discoveredTools.length} tools`
                          : ""}
                      </div>
                      <div className="orch-settings-mcp-actions">
                        <button
                          className="btn-ghost-sm"
                          onClick={() => {
                            setEditingDep(dep)
                            setShowMCPForm(true)
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-ghost-sm danger"
                          onClick={() => handleRemoveMCP(dep.name)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                className="btn-ghost-sm"
                onClick={() => {
                  setEditingDep(undefined)
                  setShowMCPForm(true)
                }}
                style={{ marginTop: 8 }}
              >
                + Add MCP Server
              </button>
            </div>
          )}

          {tab === "sandbox" && (
            <div className="orch-settings-section">
              <div className="orch-settings-label">Sandbox Mode</div>
              <div className="orch-settings-desc">
                Controls what the Orchestrator agent can do in this workspace.
              </div>
              <div className="orch-settings-sandbox-options">
                {(["full", "workspace-write", "read-only"] as SandboxMode[]).map((mode) => (
                  <label key={mode} className="orch-settings-radio">
                    <input
                      type="radio"
                      name="sandbox"
                      value={mode}
                      checked={sandboxMode === mode}
                      onChange={() => handleSandboxChange(mode)}
                    />
                    <span className="orch-settings-radio-label">{mode}</span>
                    <span className="orch-settings-radio-desc">
                      {mode === "full" && "No restrictions on file and shell operations"}
                      {mode === "workspace-write" && "Can only write within workspace directory"}
                      {mode === "read-only" && "Cannot write files or run shell commands"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {showMCPForm && (
        <MCPServerForm
          initial={editingDep}
          onSave={handleAddMCP}
          onCancel={() => {
            setShowMCPForm(false)
            setEditingDep(undefined)
          }}
        />
      )}
    </div>
  )
}
