import { X, Info, Plug, Shield, Zap } from "lucide-react"
import { useAgentAppsStore } from "@/stores/agent-apps"

interface AgentAppSettingsProps {
  instanceId: string
  appId: string
  onClose: () => void
}

export function AgentAppSettings({ instanceId, appId, onClose }: AgentAppSettingsProps) {
  const manifest = useAgentAppsStore((s) => s.installedApps.find((a) => a.id === appId))

  if (!manifest) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-panel" style={{ width: 400, padding: 20 }}>
          <div className="orch-settings-empty">App not found: {appId}</div>
        </div>
      </div>
    )
  }

  const mcpDeps = manifest.mcpDependencies ?? []
  const triggers = manifest.harness?.triggers ?? []

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" style={{ width: 480, maxHeight: "80vh" }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Info size={14} />
            <span className="modal-title">{manifest.name}</span>
            <span className="agent-app-kind-badge" style={{ marginLeft: 4 }}>
              {manifest.kind}
            </span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="orch-settings-content">
          {/* Info section */}
          <div className="orch-settings-section">
            <div className="orch-settings-label">
              <Info size={11} style={{ display: "inline", marginRight: 4 }} />
              Info
            </div>
            <div className="orch-settings-info-grid">
              <div className="orch-settings-info-row">
                <span className="orch-settings-info-key">ID</span>
                <span className="orch-settings-info-val">{manifest.id}</span>
              </div>
              <div className="orch-settings-info-row">
                <span className="orch-settings-info-key">Version</span>
                <span className="orch-settings-info-val">{manifest.version}</span>
              </div>
              <div className="orch-settings-info-row">
                <span className="orch-settings-info-key">Kind</span>
                <span className="orch-settings-info-val">{manifest.kind}</span>
              </div>
              {manifest.description && (
                <div className="orch-settings-info-row">
                  <span className="orch-settings-info-key">Description</span>
                  <span className="orch-settings-info-val" style={{ fontFamily: "var(--font-sans)" }}>
                    {manifest.description}
                  </span>
                </div>
              )}
              <div className="orch-settings-info-row">
                <span className="orch-settings-info-key">Instance</span>
                <span className="orch-settings-info-val">{instanceId}</span>
              </div>
            </div>
          </div>

          {/* MCP Servers */}
          {mcpDeps.length > 0 && (
            <div className="orch-settings-section" style={{ marginTop: 16 }}>
              <div className="orch-settings-label">
                <Plug size={11} style={{ display: "inline", marginRight: 4 }} />
                MCP Servers
              </div>
              <div className="orch-settings-mcp-list">
                {mcpDeps.map((dep, i) => (
                  <div key={i} className="orch-settings-mcp-item">
                    <div className="orch-settings-mcp-name">
                      {dep.command ?? dep.url ?? "unknown"}
                    </div>
                    <div className="orch-settings-mcp-meta">
                      {dep.transport}
                      {dep.discoveredTools
                        ? ` · ${dep.discoveredTools.length} tools`
                        : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Permissions */}
          <div className="orch-settings-section" style={{ marginTop: 16 }}>
            <div className="orch-settings-label">
              <Shield size={11} style={{ display: "inline", marginRight: 4 }} />
              Permissions
            </div>
            <div className="orch-settings-info-grid">
              <div className="orch-settings-info-row">
                <span className="orch-settings-info-key">Filesystem</span>
                <span className="orch-settings-info-val">{manifest.permissions.filesystem}</span>
              </div>
              <div className="orch-settings-info-row">
                <span className="orch-settings-info-key">Network</span>
                <span className="orch-settings-info-val">{manifest.permissions.network}</span>
              </div>
              <div className="orch-settings-info-row">
                <span className="orch-settings-info-key">Shell</span>
                <span className="orch-settings-info-val">
                  {manifest.permissions.shell ? "yes" : "no"}
                </span>
              </div>
            </div>
          </div>

          {/* Harness / Triggers */}
          {triggers.length > 0 && (
            <div className="orch-settings-section" style={{ marginTop: 16 }}>
              <div className="orch-settings-label">
                <Zap size={11} style={{ display: "inline", marginRight: 4 }} />
                Harness Triggers
              </div>
              <div className="orch-settings-mcp-list">
                {triggers.map((t, i) => (
                  <div key={i} className="orch-settings-mcp-item">
                    <div className="orch-settings-mcp-name">{t.event}</div>
                    {t.pattern && (
                      <div className="orch-settings-mcp-meta">{t.pattern}</div>
                    )}
                    {t.toolName && (
                      <div className="orch-settings-mcp-meta">{t.toolName}</div>
                    )}
                  </div>
                ))}
              </div>
              <div className="orch-settings-info-row" style={{ marginTop: 4 }}>
                <span className="orch-settings-info-key">Feedback</span>
                <span className="orch-settings-info-val">
                  {manifest.harness?.feedbackToAgent ? "enabled" : "disabled"}
                </span>
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
    </div>
  )
}
