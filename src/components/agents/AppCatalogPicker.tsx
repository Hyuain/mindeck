import { useState, useRef, useEffect } from "react"
import { LayoutGrid, Check } from "lucide-react"
import { useAgentAppsStore } from "@/stores/agent-apps"
import { useUIStore } from "@/stores/ui"
import { useWorkspaceStore } from "@/stores/workspace"
import { Popover } from "@/components/ui/Popover"

interface AppCatalogPickerProps {
  workspaceId: string
  anchorRect: DOMRect
  onClose: () => void
}

export function AppCatalogPicker({ workspaceId, anchorRect, onClose }: AppCatalogPickerProps) {
  const [query, setQuery] = useState("")
  const [labelPrompt, setLabelPrompt] = useState<string | null>(null)
  const [labelValue, setLabelValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const { installedApps, activateApp } = useAgentAppsStore()
  const { openAppCatalog } = useUIStore()
  const activeWorkspace = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === workspaceId)
  )
  const activatedApps = activeWorkspace?.activatedApps ?? []

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = installedApps.filter(
    (a) =>
      !query ||
      a.name.toLowerCase().includes(query.toLowerCase()) ||
      a.description.toLowerCase().includes(query.toLowerCase())
  )

  function handleActivate(appId: string) {
    const instanceCount = activatedApps.filter((i) => i.appId === appId).length
    if (instanceCount > 0) {
      setLabelPrompt(appId)
      setLabelValue(`Instance ${instanceCount + 1}`)
      return
    }
    activateApp(workspaceId, appId)
    onClose()
  }

  function handleConfirmLabel() {
    if (!labelPrompt) return
    activateApp(workspaceId, labelPrompt, labelValue.trim() || undefined)
    setLabelPrompt(null)
    onClose()
  }

  const nativeApps = filtered.filter((a) => a.kind === "native")
  const mcpApps = filtered.filter((a) => a.kind === "custom")

  return (
    <Popover
      anchor={anchorRect}
      onClose={onClose}
      className="popover-panel app-picker-popover"
    >
      {labelPrompt ? (
        <div className="app-picker-label-prompt">
          <p className="app-picker-label-desc">
            Label this instance (it will appear alongside the app name):
          </p>
          <input
            className="app-picker-label-input"
            value={labelValue}
            onChange={(e) => setLabelValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConfirmLabel()
              if (e.key === "Escape") setLabelPrompt(null)
            }}
            autoFocus
          />
          <div className="app-picker-label-actions">
            <button className="app-picker-cancel" onClick={() => setLabelPrompt(null)}>
              Cancel
            </button>
            <button className="app-picker-confirm" onClick={handleConfirmLabel}>
              Add
            </button>
          </div>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            className="app-picker-search"
            placeholder="Search apps…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
          />

          <div className="app-picker-list">
            {nativeApps.length > 0 && (
              <>
                <div className="app-picker-group">Built-in</div>
                {nativeApps.map((app) => {
                  const count = activatedApps.filter((i) => i.appId === app.id).length
                  return (
                    <button
                      key={app.id}
                      className="app-picker-item"
                      onClick={() => handleActivate(app.id)}
                    >
                      <span className="app-picker-item-name">{app.name}</span>
                      {count > 0 && (
                        <span className="app-picker-item-count">
                          <Check size={9} /> {count} active
                        </span>
                      )}
                    </button>
                  )
                })}
              </>
            )}

            {mcpApps.length > 0 && (
              <>
                <div className="app-picker-group">Installed</div>
                {mcpApps.map((app) => {
                  const count = activatedApps.filter((i) => i.appId === app.id).length
                  return (
                    <button
                      key={app.id}
                      className="app-picker-item"
                      onClick={() => handleActivate(app.id)}
                    >
                      <span className="app-picker-item-name">{app.name}</span>
                      <span className="app-picker-item-meta">
                        {app.mcpDependencies?.length ?? 0} MCP
                      </span>
                      {count > 0 && (
                        <span className="app-picker-item-count">
                          <Check size={9} /> {count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </>
            )}

            {filtered.length === 0 && (
              <div className="app-picker-empty">No apps found</div>
            )}
          </div>

          <div className="app-picker-footer">
            <button
              className="app-picker-catalog-link"
              onClick={() => {
                onClose()
                openAppCatalog()
              }}
            >
              <LayoutGrid size={10} /> Browse Catalog ({"\u2318"}K)
            </button>
          </div>
        </>
      )}
    </Popover>
  )
}
