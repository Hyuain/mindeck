import { useState, useEffect, useRef } from "react";
import { useUIStore } from "@/stores/ui";
import { useWorkspaceStore } from "@/stores/workspace";

export function CommandPalette() {
  const { commandPaletteOpen, closeCommandPalette, openSettings } = useUIStore();
  const { workspaces, setActiveWorkspace, activeWorkspaceId } = useWorkspaceStore();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [commandPaletteOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && commandPaletteOpen) closeCommandPalette();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandPaletteOpen, closeCommandPalette]);

  if (!commandPaletteOpen) return null;

  const filteredWorkspaces = query
    ? workspaces.filter((ws) => ws.name.toLowerCase().includes(query.toLowerCase()))
    : workspaces;

  const commands = [
    { id: "new-ws", label: "New Workspace", desc: "Create a fresh workspace thread", kbd: "⌘N" },
    { id: "settings", label: "Provider Settings", desc: "Manage API keys and models", kbd: "⌘," },
  ].filter(
    (cmd) =>
      !query || cmd.label.toLowerCase().includes(query.toLowerCase())
  );

  function selectWorkspace(id: string) {
    setActiveWorkspace(id);
    closeCommandPalette();
  }

  function selectCommand(id: string) {
    closeCommandPalette();
    if (id === "settings") openSettings();
  }

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
              <div className="cmd-group" style={{ marginTop: 6 }}>Commands</div>
              {commands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="cmd-item"
                  role="option"
                  onClick={() => selectCommand(cmd.id)}
                >
                  <div className="cmd-ic" style={{ fontSize: 17, color: "var(--color-t2)" }}>
                    {cmd.id === "new-ws" ? "+" : "⚙"}
                  </div>
                  <div className="cmd-txt">
                    <div className="cmd-name">{cmd.label}</div>
                    <div className="cmd-desc">{cmd.desc}</div>
                  </div>
                  <span className="cmd-kbd">{cmd.kbd}</span>
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
  );
}
