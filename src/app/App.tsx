import { useEffect, useState } from "react"
import { Settings } from "lucide-react"
import { useUIStore } from "@/stores/ui"
import { useWorkspaceStore } from "@/stores/workspace"
import { useProviderStore } from "@/stores/provider"
import { useSkillsStore } from "@/stores/skills"
import { useMajordomoStore, initMajordomoResultListener } from "@/stores/majordomo"
import { initAppDirs } from "@/services/providers/storage"
import { listWorkspaces, createWorkspace, newWorkspace } from "@/services/workspace"
import { listProviders } from "@/services/providers/storage"
import { listSkills } from "@/services/skills"
import { registerBuiltins } from "@/services/tools/builtins"
import { loadMajordomoMessages } from "@/services/conversation"
import { MajordomoPanel } from "@/components/majordomo/MajordomoPanel"
import { ChatPanel } from "@/components/chat/ChatPanel"
import { PreviewPanel } from "@/components/preview/PreviewPanel"
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel"
import { ProviderSettings } from "@/components/provider/ProviderSettings"
import { CommandPalette } from "@/components/majordomo/CommandPalette"
import type { RenderableContent } from "@/types"

export default function App() {
  const { theme, toggleTheme, openSettings, openCommandPalette } = useUIStore()
  const {
    workspaces,
    activeWorkspaceId,
    setWorkspaces,
    setActiveWorkspace,
    addWorkspace,
  } = useWorkspaceStore()
  const { setProviders } = useProviderStore()
  const { setSkills } = useSkillsStore()
  const { setMessages: setMajordomoMessages } = useMajordomoStore()

  // Preview content keyed by workspace id
  const [previewMap, setPreviewMap] = useState<Record<string, RenderableContent>>({})

  const activeWorkspace = workspaces.find((ws) => ws.id === activeWorkspaceId)
  const previewContent = activeWorkspaceId
    ? (previewMap[activeWorkspaceId] ?? null)
    : null

  // Bootstrap on mount
  useEffect(() => {
    document.documentElement.dataset.theme = theme

    // Register built-in tools once
    registerBuiltins()

    // Wire up Majordomo ← workspace result notifications
    const unsubscribeResults = initMajordomoResultListener()

    async function bootstrap() {
      try {
        await initAppDirs()
      } catch {
        // browser mode: skip
      }
      try {
        const [wsList, provList, skillsList, majordomoMsgs] = await Promise.all([
          listWorkspaces(),
          listProviders(),
          listSkills().catch(() => []),
          loadMajordomoMessages().catch(() => []),
        ])
        setWorkspaces(wsList)
        setProviders(provList)
        setSkills(skillsList)
        setMajordomoMessages(majordomoMsgs)

        if (wsList.length > 0) {
          setActiveWorkspace(wsList[0].id)
        } else {
          // Create a default workspace on first run
          const defaultWs = newWorkspace("My First Workspace", "ollama", "llama3.2")
          await createWorkspace(defaultWs).catch(() => {})
          addWorkspace(defaultWs)
          setActiveWorkspace(defaultWs.id)
        }
      } catch {
        // browser mode
      }
    }

    bootstrap()

    return () => {
      unsubscribeResults()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Global keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === ",") {
        e.preventDefault()
        openSettings()
      }
      if (mod && e.key === "k") {
        e.preventDefault()
        openCommandPalette()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [openSettings, openCommandPalette])

  function handlePreview(workspaceId: string, content: string) {
    setPreviewMap((prev) => ({
      ...prev,
      [workspaceId]: { type: "markdown", content },
    }))
  }

  return (
    <div className="app">
      {/* ── TITLEBAR ── */}
      <div className="titlebar">
        <div className="wordmark">
          <div className="wm-mark">
            <svg
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <line x1="2" y1="5" x2="8" y2="5" />
              <line x1="5" y1="2" x2="5" y2="8" />
            </svg>
          </div>
          <span className="wm-text">
            mind<em>eck</em>
          </span>
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
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* ── MAIN BODY: 3-column layout ── */}
      <div className="body">
        {/* Column 1: Majordomo (permanent) */}
        <MajordomoPanel />

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
              <div className="split" />
              <WorkspacePanel workspace={activeWorkspace} />
            </>
          ) : (
            <div className="workspace-empty">
              <p>Create a workspace to get started.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── OVERLAYS ── */}
      <ProviderSettings />
      <CommandPalette />
    </div>
  )
}
