import { useMemo } from "react"
import { useWorkspaceStore } from "@/stores/workspace"
import { useAgentAppsStore } from "@/stores/agent-apps"
import { mcpManager } from "@/services/mcp/manager"

/**
 * MCPConnectionsView — read-only view of all active MCP connections.
 * Shown in Settings → MCP Servers.
 *
 * This is a derived view; MCP config is owned by Agent App manifests.
 */
export function MCPConnectionsView() {
  const { workspaces } = useWorkspaceStore()
  const { workspaceDeps, installedApps } = useAgentAppsStore()

  // Collect all pool entries from mcpManager
  const poolEntries = useMemo(() => mcpManager.getPoolEntries(), [])

  // Group pool entries into categories
  const legacyEntries = poolEntries.filter((e) => {
    // Legacy keys are "{workspaceId}:{depName}" — workspace IDs are UUIDs
    const wsIds = new Set(workspaces.map((w) => w.id))
    const prefix = e.key.split(":")[0]
    return wsIds.has(prefix)
  })

  const instanceEntries = poolEntries.filter((e) => {
    const wsIds = new Set(workspaces.map((w) => w.id))
    const prefix = e.key.split(":")[0]
    return !wsIds.has(prefix)
  })

  // Resolve instance entries to human-readable info
  const resolvedInstanceEntries = instanceEntries.map((entry) => {
    const [instanceId, ...rest] = entry.key.split(":")
    const depName = rest.join(":")

    // Find workspace + app instance + manifest
    let wsName = "Unknown"
    let appName = depName
    let instLabel: string | undefined

    for (const ws of workspaces) {
      const inst = ws.activatedApps?.find((i) => i.instanceId === instanceId)
      if (inst) {
        wsName = ws.name
        instLabel = inst.label
        const manifest = installedApps.find((a) => a.id === inst.appId)
        if (manifest) appName = manifest.name
        break
      }
    }

    return {
      key: entry.key,
      wsName,
      appName,
      instLabel,
      depName,
      toolCount: entry.toolCount,
    }
  })

  // Resolve legacy entries
  const resolvedLegacyEntries = legacyEntries.map((entry) => {
    const [workspaceId, depName] = entry.key.split(":")
    const ws = workspaces.find((w) => w.id === workspaceId)
    const dep = workspaceDeps[workspaceId]?.find((d) => d.name === depName)
    return {
      key: entry.key,
      wsName: ws?.name ?? workspaceId,
      depName,
      status: dep?.status ?? "connected",
      toolCount: entry.toolCount,
    }
  })

  // Collect native-only app instances (nativeComponent, no mcpDependencies)
  const nativeAppEntries = useMemo(() => {
    const entries: {
      wsName: string
      appName: string
      nativeComponent: string
      triggers: string
    }[] = []
    for (const ws of workspaces) {
      for (const inst of ws.activatedApps ?? []) {
        const manifest = installedApps.find((a) => a.id === inst.appId)
        if (!manifest) continue
        if (!manifest.nativeComponent) continue
        if (manifest.mcpDependencies?.length) continue
        const triggerSummary =
          manifest.harness?.triggers
            .map((t) =>
              t.event === "file_written" && t.pattern
                ? `file_written ${t.pattern}`
                : t.event
            )
            .join(", ") ?? ""
        entries.push({
          wsName: ws.name,
          appName: inst.label ? `${manifest.name} (${inst.label})` : manifest.name,
          nativeComponent: manifest.nativeComponent,
          triggers: triggerSummary,
        })
      }
    }
    return entries
  }, [workspaces, installedApps])

  const hasAny =
    resolvedInstanceEntries.length > 0 ||
    resolvedLegacyEntries.length > 0 ||
    nativeAppEntries.length > 0

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">MCP Servers</h3>
      <p className="settings-section-desc">
        Read-only view of active MCP connections. To add or remove connections, install or
        activate Agent Apps via ⌘K → Browse Agent Apps.
      </p>

      {!hasAny && (
        <div className="mcp-connections-empty">
          No active MCP connections. Activate an Agent App with MCP dependencies to see
          them here.
        </div>
      )}

      {resolvedInstanceEntries.length > 0 && (
        <>
          <div className="mcp-connections-group">App Instances</div>
          <table className="mcp-connections-table">
            <thead>
              <tr>
                <th>Workspace</th>
                <th>App</th>
                <th>MCP</th>
                <th>Tools</th>
              </tr>
            </thead>
            <tbody>
              {resolvedInstanceEntries.map((e) => (
                <tr key={e.key}>
                  <td>{e.wsName}</td>
                  <td>
                    {e.appName}
                    {e.instLabel && (
                      <span className="mcp-connections-label"> ({e.instLabel})</span>
                    )}
                  </td>
                  <td className="mcp-connections-dep">{e.depName}</td>
                  <td>{e.toolCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {resolvedLegacyEntries.length > 0 && (
        <>
          <div className="mcp-connections-group">Workspace Dependencies (Legacy)</div>
          <table className="mcp-connections-table">
            <thead>
              <tr>
                <th>Workspace</th>
                <th>MCP</th>
                <th>Tools</th>
              </tr>
            </thead>
            <tbody>
              {resolvedLegacyEntries.map((e) => (
                <tr key={e.key}>
                  <td>{e.wsName}</td>
                  <td className="mcp-connections-dep">{e.depName}</td>
                  <td>{e.toolCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {nativeAppEntries.length > 0 && (
        <>
          <div className="mcp-connections-group">Built-in Apps</div>
          <table className="mcp-connections-table">
            <thead>
              <tr>
                <th>Workspace</th>
                <th>App</th>
                <th>Type</th>
                <th>Triggers</th>
              </tr>
            </thead>
            <tbody>
              {nativeAppEntries.map((e, i) => (
                <tr key={i}>
                  <td>{e.wsName}</td>
                  <td>{e.appName}</td>
                  <td className="mcp-connections-dep">Built-in · {e.nativeComponent}</td>
                  <td>{e.triggers || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
