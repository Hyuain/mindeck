import { useState, useEffect, useRef } from "react"
import { ArrowLeft, Plus, X, Download, Check } from "lucide-react"
import { useUIStore } from "@/stores/ui"
import { useWorkspaceStore } from "@/stores/workspace"
import { useAgentAppsStore } from "@/stores/agent-apps"
import { MCP_DIRECTORY } from "@/data/mcp-directory"
import type { MCPDirectoryEntry } from "@/data/mcp-directory"
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

import { getAppRoleLabel } from "@/services/agent-apps/labels"

type CatalogTab = "installed" | "marketplace"

// ─── Component ────────────────────────────────────────────

export function CommandPalette() {
  const {
    commandPaletteOpen,
    appCatalogOpen,
    closeCommandPalette,
    closeAppCatalog,
    openSettings,
  } = useUIStore()
  const { workspaces, setActiveWorkspace, activeWorkspaceId } = useWorkspaceStore()
  const { installedApps, addApp, activateApp, removeApp } = useAgentAppsStore()

  const [query, setQuery] = useState("")
  const [catalogQuery, setCatalogQuery] = useState("")
  const [catalogTab, setCatalogTab] = useState<CatalogTab>("installed")
  const [showInstallForm, setShowInstallForm] = useState(false)
  const [installName, setInstallName] = useState("")
  const [mcpEntries, setMCPEntries] = useState<MCPEntry[]>([emptyMCPEntry()])
  // Marketplace install flow
  const [marketplaceEnvForm, setMarketplaceEnvForm] = useState<{
    entry: MCPDirectoryEntry
    values: Record<string, string>
  } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const catalogInputRef = useRef<HTMLInputElement>(null)

  // Sync mode when appCatalogOpen changes
  const mode = appCatalogOpen ? "catalog" : "commands"

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery("")
      setCatalogQuery("")
      setShowInstallForm(false)
      setMarketplaceEnvForm(null)
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
        if (marketplaceEnvForm) {
          setMarketplaceEnvForm(null)
        } else if (mode === "catalog") {
          closeAppCatalog()
        } else {
          closeCommandPalette()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [commandPaletteOpen, mode, closeCommandPalette, closeAppCatalog, marketplaceEnvForm])

  if (!commandPaletteOpen) return null

  // ── Commands mode ──────────────────────────────────────

  const filteredWorkspaces = query
    ? workspaces.filter((ws) => ws.name.toLowerCase().includes(query.toLowerCase()))
    : workspaces

  const commands = [
    {
      id: "new-ws",
      label: "New Workspace",
      desc: "Create a fresh workspace thread",
      kbd: "⌘N",
    },
    {
      id: "settings",
      label: "Provider Settings",
      desc: "Manage API keys and models",
      kbd: "⌘,",
    },
    {
      id: "catalog",
      label: "Apps",
      desc: "Browse and install Agent Apps",
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
      useUIStore.getState().openAppCatalog()
    } else {
      closeCommandPalette()
    }
  }

  // ── Catalog: Installed tab ───────────────────────────────

  // Filter out system apps — they shouldn't appear in the catalog
  const visibleApps = installedApps.filter((a) => a.kind !== "system")
  const filteredCatalogApps = catalogQuery
    ? visibleApps.filter(
        (a) =>
          a.name.toLowerCase().includes(catalogQuery.toLowerCase()) ||
          a.description.toLowerCase().includes(catalogQuery.toLowerCase())
      )
    : visibleApps

  const nativeApps = filteredCatalogApps.filter((a) => a.kind === "native")
  const customApps = filteredCatalogApps.filter((a) => a.kind === "custom")

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
        args: e.args.trim().split(/\s+/).filter(Boolean),
        url: e.url.trim() || undefined,
      }))

    const manifest: AgentAppManifest = {
      id: `user.${installName.trim().toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      name: installName.trim(),
      kind: "custom",
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

  // ── Catalog: Marketplace tab ─────────────────────────────

  const filteredMarketplace = catalogQuery
    ? MCP_DIRECTORY.filter(
        (e) =>
          e.manifest.name.toLowerCase().includes(catalogQuery.toLowerCase()) ||
          e.summary.toLowerCase().includes(catalogQuery.toLowerCase())
      )
    : MCP_DIRECTORY

  function isAlreadyInstalled(entry: MCPDirectoryEntry): boolean {
    return installedApps.some((a) => a.id === entry.manifest.id)
  }

  function handleMarketplaceInstall(entry: MCPDirectoryEntry) {
    if (entry.requiredEnv && entry.requiredEnv.length > 0) {
      // Show env var form
      const values: Record<string, string> = {}
      for (const env of entry.requiredEnv) {
        values[env.key] = ""
      }
      setMarketplaceEnvForm({ entry, values })
      return
    }
    // No env vars needed — install directly
    doMarketplaceInstall(entry, {})
  }

  function doMarketplaceInstall(
    entry: MCPDirectoryEntry,
    envValues: Record<string, string>
  ) {
    const manifest: AgentAppManifest = {
      ...entry.manifest,
      kind: "custom",
    }

    // Inject env values into MCP dependencies
    if (Object.keys(envValues).length > 0 && manifest.mcpDependencies) {
      manifest.mcpDependencies = manifest.mcpDependencies.map((dep) => {
        if (!dep.env) return dep
        const updatedEnv = { ...dep.env }
        for (const [key, value] of Object.entries(envValues)) {
          if (key in updatedEnv) updatedEnv[key] = value
        }
        return { ...dep, env: updatedEnv }
      })
    }

    addApp(manifest)
    setMarketplaceEnvForm(null)
  }

  // ── Render ──────────────────────────────────────────────

  if (mode === "catalog") {
    // Marketplace env form overlay
    if (marketplaceEnvForm) {
      const { entry, values } = marketplaceEnvForm
      return (
        <div
          className="cmd-overlay open"
          onClick={(e) => e.target === e.currentTarget && setMarketplaceEnvForm(null)}
        >
          <div className="cmd-sheet" role="dialog" aria-label="Configure App">
            <div className="cmd-row cmd-catalog-header">
              <button
                className="cmd-back-btn"
                onClick={() => setMarketplaceEnvForm(null)}
                title="Back"
              >
                <ArrowLeft size={14} />
              </button>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-t0)" }}>
                {entry.manifest.icon} {entry.manifest.name} — Configuration
              </span>
            </div>
            <div className="cmd-results" style={{ padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "var(--color-t2)", marginBottom: 12 }}>
                {entry.manifest.description}
              </div>
              {entry.requiredEnv?.map((env) => (
                <div key={env.key} style={{ marginBottom: 10 }}>
                  <label className="cmd-catalog-install-label">{env.label}</label>
                  <input
                    className="cmd-catalog-install-input"
                    placeholder={env.placeholder ?? env.key}
                    type={
                      env.key.toLowerCase().includes("key") ||
                      env.key.toLowerCase().includes("token")
                        ? "password"
                        : "text"
                    }
                    value={values[env.key] ?? ""}
                    onChange={(e) =>
                      setMarketplaceEnvForm({
                        entry,
                        values: { ...values, [env.key]: e.target.value },
                      })
                    }
                  />
                </div>
              ))}
              <div className="cmd-catalog-install-actions">
                <button
                  className="cmd-catalog-install-btn"
                  onClick={() => doMarketplaceInstall(entry, values)}
                >
                  <Download size={11} /> Install
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div
        className="cmd-overlay open"
        onClick={(e) => e.target === e.currentTarget && closeCommandPalette()}
      >
        <div className="cmd-sheet" role="dialog" aria-label="Apps">
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

          {/* Tabs */}
          <div className="cmd-catalog-tabs">
            <button
              className={`cmd-catalog-tab${catalogTab === "installed" ? " active" : ""}`}
              onClick={() => setCatalogTab("installed")}
            >
              Installed
            </button>
            <button
              className={`cmd-catalog-tab${catalogTab === "marketplace" ? " active" : ""}`}
              onClick={() => setCatalogTab("marketplace")}
            >
              Marketplace
            </button>
          </div>

          <div className="cmd-results">
            {catalogTab === "installed" && (
              <>
                {/* Native apps */}
                {nativeApps.length > 0 && (
                  <>
                    <div className="cmd-group">Native</div>
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
                            <button
                              className="cmd-catalog-card-btn"
                              onClick={() => handleActivateFromCatalog(app.id)}
                              disabled={!activeWorkspaceId}
                            >
                              {count > 0 ? `Active (${count})` : "+ Activate"}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                {/* Custom apps */}
                {customApps.length > 0 && (
                  <>
                    <div className="cmd-group">Custom</div>
                    <div className="cmd-catalog-grid">
                      {customApps.map((app) => {
                        const count = activeInstanceCount(app.id)
                        return (
                          <div
                            key={app.id}
                            className={`cmd-catalog-card${count > 0 ? " active" : ""}`}
                          >
                            <div className="cmd-catalog-card-name">
                              {app.icon ?? ""} {app.name}
                            </div>
                            <div className="cmd-catalog-card-kind cmd-catalog-kind">
                              {getAppRoleLabel(app)}
                            </div>
                            <div className="cmd-catalog-card-actions">
                              <button
                                className="cmd-catalog-card-btn"
                                onClick={() => handleActivateFromCatalog(app.id)}
                                disabled={!activeWorkspaceId}
                              >
                                {count > 0 ? `Active (${count})` : "+ Activate"}
                              </button>
                              <button
                                className="cmd-catalog-card-btn danger"
                                onClick={() => removeApp(app.id)}
                              >
                                Uninstall
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                {filteredCatalogApps.length === 0 && (
                  <div
                    style={{
                      padding: "16px 10px",
                      color: "var(--color-t2)",
                      fontSize: 12,
                    }}
                  >
                    {catalogQuery
                      ? `No apps found for "${catalogQuery}"`
                      : "No apps installed"}
                  </div>
                )}

                {/* Manual install form */}
                <div className="cmd-group" style={{ marginTop: 8 }}>
                  <button
                    className="cmd-catalog-install-toggle"
                    onClick={() => setShowInstallForm((s) => !s)}
                  >
                    {showInstallForm ? <X size={11} /> : <Plus size={11} />}
                    {showInstallForm ? "Cancel" : "Install custom app"}
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
                                ? {
                                    ...en,
                                    transport: e.target.value as
                                      | "stdio"
                                      | "streamable-http",
                                  }
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
                            onClick={() =>
                              setMCPEntries(mcpEntries.filter((_, i) => i !== idx))
                            }
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
              </>
            )}

            {catalogTab === "marketplace" && (
              <>
                <div className="cmd-group">Popular MCP Servers</div>
                <div className="cmd-catalog-grid">
                  {filteredMarketplace.map((entry) => {
                    const installed = isAlreadyInstalled(entry)
                    return (
                      <div
                        key={entry.manifest.id}
                        className={`cmd-catalog-card${installed ? " active" : ""}`}
                      >
                        <div className="cmd-catalog-card-name">
                          {entry.manifest.icon} {entry.manifest.name}
                        </div>
                        <div className="cmd-catalog-card-summary">{entry.summary}</div>
                        {entry.requiredEnv && entry.requiredEnv.length > 0 && (
                          <div className="cmd-catalog-card-env">
                            Requires: {entry.requiredEnv.map((e) => e.key).join(", ")}
                          </div>
                        )}
                        {installed ? (
                          <div className="cmd-catalog-card-btn installed">
                            <Check size={11} /> Installed
                          </div>
                        ) : (
                          <button
                            className="cmd-catalog-card-btn"
                            onClick={() => handleMarketplaceInstall(entry)}
                          >
                            <Download size={11} /> Install
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                {filteredMarketplace.length === 0 && (
                  <div
                    style={{
                      padding: "16px 10px",
                      color: "var(--color-t2)",
                      fontSize: 12,
                    }}
                  >
                    No marketplace apps found for "{catalogQuery}"
                  </div>
                )}
              </>
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
                  <div
                    className="cmd-ic"
                    style={{ fontSize: 17, color: "var(--color-t2)" }}
                  >
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
