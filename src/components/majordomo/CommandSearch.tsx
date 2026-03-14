import { useState, useRef, useEffect } from "react"
import { useUIStore } from "@/stores/ui"
import { useWorkspaceStore } from "@/stores/workspace"

interface CommandSearchProps {
  onClose: () => void
}

export function CommandSearch({ onClose }: CommandSearchProps) {
  const { openSettings } = useUIStore()
  const { workspaces, setActiveWorkspace, activeWorkspaceId } = useWorkspaceStore()

  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 30)
  }, [])

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
    onClose()
  }

  function selectCommand(id: string) {
    if (id === "settings") {
      onClose()
      openSettings()
    } else if (id === "catalog") {
      useUIStore.getState().openAppCatalog()
    } else {
      onClose()
    }
  }

  return (
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
  )
}
