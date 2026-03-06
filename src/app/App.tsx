import { useEffect, useState } from "react";
import { useUIStore } from "@/stores/ui";
import { useWorkspaceStore } from "@/stores/workspace";
import { useProviderStore } from "@/stores/provider";
import { initAppDirs } from "@/services/providers/storage";
import { listWorkspaces, createWorkspace, newWorkspace } from "@/services/workspace";
import { listProviders } from "@/services/providers/storage";
import { SuperAgentPanel } from "@/components/super-agent/SuperAgentPanel";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { WorkspaceTabBar } from "@/components/workspace/WorkspaceTabBar";
import { ProviderSettings } from "@/components/provider/ProviderSettings";
import { CommandPalette } from "@/components/super-agent/CommandPalette";
import type { RenderableContent } from "@/types";

export default function App() {
  const { theme, toggleTheme, openSettings, openCommandPalette } = useUIStore();
  const { workspaces, activeWorkspaceId, setWorkspaces, setActiveWorkspace, addWorkspace } =
    useWorkspaceStore();
  const { setProviders } = useProviderStore();

  // Preview content keyed by workspace id
  const [previewMap, setPreviewMap] = useState<Record<string, RenderableContent>>({});

  const activeWorkspace = workspaces.find((ws) => ws.id === activeWorkspaceId);
  const previewContent = activeWorkspaceId ? (previewMap[activeWorkspaceId] ?? null) : null;

  // Bootstrap on mount
  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    async function bootstrap() {
      try {
        await initAppDirs();
      } catch {
        // browser mode: skip
      }
      try {
        const [wsList, provList] = await Promise.all([listWorkspaces(), listProviders()]);
        setWorkspaces(wsList);
        setProviders(provList);

        if (wsList.length > 0) {
          setActiveWorkspace(wsList[0].id);
        } else {
          // Create a default workspace on first run
          const defaultWs = newWorkspace("My First Workspace", "ollama", "llama3.2");
          await createWorkspace(defaultWs).catch(() => {});
          addWorkspace(defaultWs);
          setActiveWorkspace(defaultWs.id);
        }
      } catch {
        // browser mode
      }
    }

    bootstrap();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Global keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === ",") { e.preventDefault(); openSettings(); }
      if (mod && e.key === "k") { e.preventDefault(); openCommandPalette(); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openSettings, openCommandPalette]);

  function handlePreview(workspaceId: string, content: string) {
    setPreviewMap((prev) => ({
      ...prev,
      [workspaceId]: { type: "markdown", content },
    }));
  }

  return (
    <div className="app">
      {/* ── TITLEBAR ── */}
      <div className="titlebar">
        <div className="wordmark">
          <div className="wm-mark">
            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="2" y1="5" x2="8" y2="5" />
              <line x1="5" y1="2" x2="5" y2="8" />
            </svg>
          </div>
          <span className="wm-text">mind<em>eck</em></span>
        </div>
        <div className="tb-sep" />
        <div className="tb-spacer" />
        <div className="tb-right">
          <button className="cmd-k" onClick={openCommandPalette}>
            <kbd>⌘K</kbd>
            <span>Search</span>
          </button>
          <button className="theme-btn" onClick={toggleTheme} title="Toggle theme">
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button className="icon-btn" onClick={openSettings} title="Settings (⌘,)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"/>
              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── MAIN BODY: 3-column layout ── */}
      <div className="body">
        {/* Column 1: Super Agent (permanent) */}
        <SuperAgentPanel />

        {/* Column 2+3: Workspace area */}
        <div className="workspace-area">
          {activeWorkspace ? (
            <>
              <ChatPanel
                workspace={activeWorkspace}
                onPreview={(content) => handlePreview(activeWorkspace.id, content)}
              />
              <div className="split" />
              <PreviewPanel content={previewContent} />
            </>
          ) : (
            <div className="workspace-empty">
              <p>Create a workspace to get started.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── TAB BAR ── */}
      <WorkspaceTabBar workspaces={workspaces} activeId={activeWorkspaceId} />

      {/* ── OVERLAYS ── */}
      <ProviderSettings />
      <CommandPalette />
    </div>
  );
}
