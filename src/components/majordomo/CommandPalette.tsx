import { useState, useEffect, useRef } from "react"
import { ArrowLeft, Plus, X } from "lucide-react"
import { useUIStore } from "@/stores/ui"
import { useWorkspaceStore } from "@/stores/workspace"
import { useAgentAppsStore } from "@/stores/agent-apps"
import type { AgentAppManifest, MCPSourceConfig } from "@/types"

// ─── Install form state ───────────────────────────────────

interface MCPEntry {
  transport: "stdio" | "streamable-http"
  command: string
  args: string
  url: string
}

function emptyMCPEntry(): MCPEntry {
  return { transport: "stdio", command: "", args: "", url: "" }
}

// ─── Helpers ──────────────────────────────────────────────

function getAppRoleLabel(app: AgentAppManifest): string {
  const parts: string[] = []
  if (app.mcpDependencies?.length) parts.push("MCP")
  if (app.nativeComponent) parts.push("Built-in")
  if (app.harness?.triggers?.length) parts.push("Harness")
  return parts.length > 0 ? parts.join(" · ") : "App"
}

// ─── Component ────────────────────────────────────────────

export function CommandPalette() {
  const { commandPaletteOpen, appCatalogOpen, closeCommandPalette, closeAppCatalog, openSettings } =
    useUIStore()
  const { workspaces, setActiveWorkspace, activeWorkspaceId } = useWorkspaceStore()
  const { installedApps, addApp, activateApp } = useAgentAppsStore()

  const [query, setQuery] = useState("")
  const [catalogQuery, setCatalogQuery] = useState("")
  const [showInstallForm, setShowInstallForm] = useState(false)
  const [installName, setInstallName] = useState("")
  const [mcpEntries, setMCPEntries] = useState<MCPEntry[]>([emptyMCPEntry()])

  const inputRef = useRef<HTMLInputElement>(null)
  const catalogInputRef = useRef<HTMLInputElement>(null)

  // Sync mode when appCatalogOpen changes
  const mode = appCatalogOpen ? "catalog" : "commands"

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery("")
      setCatalogQuery("")
      setShowInstallForm(false)
      if (mode === "catalog") {
        setTimeout(() => catalogInputRef.current?.focus(), 30)
      } else {
        setTimeout(() => inputRef.current?.focus(), 30)
      }
    }
  }, [commandPaletteOpen, mode])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && commandPaletteOpen) {
        if (mode === "catalog") {
          // First Escape: back to commands
          closeAppCatalog()
        } else {
          closeCommandPalette()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [commandPaletteOpen, mode, closeCommandPalette, closeAppCatalog])

  if (!commandPaletteOpen) return null

  // ── Commands mode ──────────────────────────────────────

  const filteredWorkspaces = query
    ? workspaces.filter((ws) => ws.name.toLowerCase().includes(query.toLowerCase()))
    : workspaces

  const commands = [
    { id: "new-ws", label: "New Workspace", desc: "Create a fresh workspace thread", kbd: "⌘N" },
    { id: "settings", label: "Provider Settings", desc: "Manage API keys and models", kbd: "⌘," },
    {
      id: "catalog",
      label: "Browse Agent Apps",
      desc: "Install and activate Agent Apps",
      kbd: "",
    },
  ].filter((cmd) => !query || cmd.label.toLowerCase().includes(query.toLowerCase()))

  function selectWorkspace(id: string) {
    setActiveWorkspace(id)
    closeCommandPalette()
  }

  function selectCommand(id: string) {
    if (id === "settings") {
      closeCommandPalette()
      openSettings()
    } else if (id === "catalog") {
      // Switch to catalog mode (don't close palette)
      useUIStore.getState().openAppCatalog()
    } else {
      closeCommandPalette()
    }
  }

  // ── Catalog mode ───────────────────────────────────────

  const filteredCatalogApps = catalogQuery
    ? installedApps.filter(
        (a) =>
          a.name.toLowerCase().includes(catalogQuery.toLowerCase()) ||
          a.description.toLowerCase().includes(catalogQuery.toLowerCase())
      )
    : installedApps

  const nativeApps = filteredCatalogApps.filter((a) => a.nativeComponent)
  const mcpApps = filteredCatalogApps.filter((a) => !a.nativeComponent)

  function handleActivateFromCatalog(appId: string) {
    if (!activeWorkspaceId) return
    activateApp(activeWorkspaceId, appId)
  }

  function activeInstanceCount(appId: string): number {
    const ws = workspaces.find((w) => w.id === activeWorkspaceId)
    return (ws?.activatedApps ?? []).filter((i) => i.appId === appId).length
  }

  function handleInstall() {
    if (!installName.trim()) return
    const deps: MCPSourceConfig[] = mcpEntries
      .filter((e) => e.command.trim() || e.url.trim())
      .map((e) => ({
        transport: e.transport,
        command: e.command.trim() || undefined,
        args: e.args
          .trim()
          .split(/\s+/)
          .filter(Boolean),
        url: e.url.trim() || undefined,
      }))

    const manifest: AgentAppManifest = {
      id: `user.${installName.trim().toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      name: installName.trim(),
      version: "1.0.0",
      description: "",
      mcpDependencies: deps.length > 0 ? deps : undefined,
      capabilities: {},
      toolExposure: "direct",
      permissions: { filesystem: "none", network: "full", shell: false },
      lifecycle: { startup: "lazy", persistence: "session" },
    }

    addApp(manifest)
    setInstallName("")
    setMCPEntries([emptyMCPEntry()])
    setShowInstallForm(false)
  }

  // ── Render ──────────────────────────────────────────────

  if (mode === "catalog") {
    return (
      <div
        className="cmd-overlay open"
        onClick={(e) => e.target === e.currentTarget && closeCommandPalette()}
      >
        <div className="cmd-sheet" role="dialog" aria-label="Agent App Catalog">
          {/* Catalog header */}
          <div className="cmd-row cmd-catalog-header">
            <button
              className="cmd-back-btn"
              onClick={closeAppCatalog}
              title="Back to commands (Esc)"
            >
              <ArrowLeft size={14} />
            </button>
            <input
              ref={catalogInputRef}
              className="cmd-input"
              type="text"
              placeholder="Search apps…"
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
            />
          </div>

          <div className="cmd-results">
            {/* Built-in section */}
            {nativeApps.length > 0 && (
              <>
                <div className="cmd-group">Built-in</div>
                <div className="cmd-catalog-grid">
                  {nativeApps.map((app) => {
                    const count = activeInstanceCount(app.id)
                    return (
                      <div
                        key={app.id}
                        className={`cmd-catalog-card${count > 0 ? " active" : ""}`}
                      >
                        <div className="cmd-catalog-card-name">{app.name}</div>
                        <div className="cmd-catalog-card-kind cmd-catalog-kind">
                          {getAppRoleLabel(app)}
                        </div>
                        {app.harness?.triggers && app.harness.triggers.length > 0 && (
                          <div className="cmd-catalog-card-trigger">
                            Triggers: {app.harness.triggers[0].event}
                          </div>
                        )}
                        <button
                          className="cmd-catalog-card-btn"
                          onClick={() => handleActivateFromCatalog(app.id)}
                          disabled={!activeWorkspaceId}
                        >
                          {count > 0 ? `● ${count} Active` : "+ Activate"}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Installed MCP apps */}
            {mcpApps.length > 0 && (
              <>
                <div className="cmd-group">Installed</div>
                <div className="cmd-catalog-grid">
                  {mcpApps.map((app) => {
                    const count = activeInstanceCount(app.id)
                    return (
                      <div
                        key={app.id}
                        className={`cmd-catalog-card${count > 0 ? " active" : ""}`}
                      >
                        <div className="cmd-catalog-card-name">{app.name}</div>
                        <div className="cmd-catalog-card-kind cmd-catalog-kind">
                          {getAppRoleLabel(app)}
                        </div>
                        {(app.mcpDependencies?.length ?? 0) > 0 && (
                          <div className="cmd-catalog-card-trigger">
                            {app.mcpDependencies!.length} MCP
                            {app.mcpDependencies!.length !== 1 ? "s" : ""}
                          </div>
                        )}
                        <button
                          className="cmd-catalog-card-btn"
                          onClick={() => handleActivateFromCatalog(app.id)}
                          disabled={!activeWorkspaceId}
                        >
                          {count > 0 ? `● ${count} Active` : "+ Activate"}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {filteredCatalogApps.length === 0 && (
              <div style={{ padding: "16px 10px", color: "var(--color-t2)", fontSize: 12 }}>
                No apps found for "{catalogQuery}"
              </div>
            )}

            {/* Install form */}
            <div className="cmd-group" style={{ marginTop: 8 }}>
              <button
                className="cmd-catalog-install-toggle"
                onClick={() => setShowInstallForm((s) => !s)}
              >
                {showInstallForm ? <X size={11} /> : <Plus size={11} />}
                {showInstallForm ? "Cancel" : "Install new Agent App"}
              </button>
            </div>

            {showInstallForm && (
              <div className="cmd-catalog-install-form">
                <label className="cmd-catalog-install-label">App name</label>
                <input
                  className="cmd-catalog-install-input"
                  placeholder="e.g. GitHub, Jira, Slack"
                  value={installName}
                  onChange={(e) => setInstallName(e.target.value)}
                />

                <label className="cmd-catalog-install-label" style={{ marginTop: 8 }}>
                  MCP sources
                </label>
                {mcpEntries.map((entry, idx) => (
                  <div key={idx} className="cmd-catalog-mcp-entry">
                    <select
                      className="cmd-catalog-install-select"
                      value={entry.transport}
                      onChange={(e) => {
                        const next = mcpEntries.map((en, i) =>
                          i === idx
                            ? { ...en, transport: e.target.value as "stdio" | "streamable-http" }
                            : en
                        )
                        setMCPEntries(next)
                      }}
                    >
                      <option value="stdio">stdio</option>
                      <option value="streamable-http">HTTP</option>
                    </select>
                    {entry.transport === "stdio" ? (
                      <input
                        className="cmd-catalog-install-input"
                        placeholder="Command (e.g. npx @scope/mcp-server)"
                        value={entry.command}
                        onChange={(e) => {
                          const next = mcpEntries.map((en, i) =>
                            i === idx ? { ...en, command: e.target.value } : en
                          )
                          setMCPEntries(next)
                        }}
                      />
                    ) : (
                      <input
                        className="cmd-catalog-install-input"
                        placeholder="URL (e.g. https://mcp.example.com)"
                        value={entry.url}
                        onChange={(e) => {
                          const next = mcpEntries.map((en, i) =>
                            i === idx ? { ...en, url: e.target.value } : en
                          )
                          setMCPEntries(next)
                        }}
                      />
                    )}
                    {mcpEntries.length > 1 && (
                      <button
                        className="cmd-catalog-remove-mcp"
                        onClick={() => setMCPEntries(mcpEntries.filter((_, i) => i !== idx))}
                      >
                        <X size={10} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className="cmd-catalog-add-mcp"
                  onClick={() => setMCPEntries([...mcpEntries, emptyMCPEntry()])}
                >
                  <Plus size={10} /> Add MCP source
                </button>

                <div className="cmd-catalog-install-actions">
                  <button
                    className="cmd-catalog-install-btn"
                    onClick={handleInstall}
                    disabled={!installName.trim()}
                  >
                    Install
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Commands mode render ───────────────────────────────

  return (
    <div
      className="cmd-overlay open"
      onClick={(e) => e.target === e.currentTarget && closeCommandPalette()}
    >
      <div className="cmd-sheet" role="dialog" aria-label="Command palette">
        <div className="cmd-row">
          <span className="cmd-icon">⌘</span>
          <input
            ref={inputRef}
            className="cmd-input"
            type="text"
            placeholder="Search workspaces, conversations, commands…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="cmd-results">
          {filteredWorkspaces.length > 0 && (
            <>
              <div className="cmd-group">Workspaces</div>
              {filteredWorkspaces.map((ws) => (
                <div
                  key={ws.id}
                  className={`cmd-item${ws.id === activeWorkspaceId ? " hi" : ""}`}
                  role="option"
                  aria-selected={ws.id === activeWorkspaceId}
                  onClick={() => selectWorkspace(ws.id)}
                >
                  <div className="cmd-ic">{ws.icon ?? "📁"}</div>
                  <div className="cmd-txt">
                    <div className="cmd-name">{ws.name}</div>
                    <div className="cmd-desc">
                      {ws.status} · {ws.stateSummary?.slice(0, 50) ?? "no activity"}
                    </div>
                  </div>
                  {ws.id === activeWorkspaceId && <span className="cmd-kbd">↵</span>}
                </div>
              ))}
            </>
          )}
          {commands.length > 0 && (
            <>
              <div className="cmd-group" style={{ marginTop: 6 }}>
                Commands
              </div>
              {commands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="cmd-item"
                  role="option"
                  onClick={() => selectCommand(cmd.id)}
                >
                  <div className="cmd-ic" style={{ fontSize: 17, color: "var(--color-t2)" }}>
                    {cmd.id === "new-ws" ? "+" : cmd.id === "catalog" ? "⊞" : "⚙"}
                  </div>
                  <div className="cmd-txt">
                    <div className="cmd-name">{cmd.label}</div>
                    <div className="cmd-desc">{cmd.desc}</div>
                  </div>
                  {cmd.kbd && <span className="cmd-kbd">{cmd.kbd}</span>}
                </div>
              ))}
            </>
          )}
          {filteredWorkspaces.length === 0 && commands.length === 0 && (
            <div style={{ padding: "16px 10px", color: "var(--color-t2)", fontSize: 12 }}>
              No results for "{query}"
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
