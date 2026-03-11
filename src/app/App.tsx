import { useEffect, useState, useCallback, useRef } from "react"
import { Settings, Files, GitBranch, Sun, Moon, Sparkles, BarChart2 } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import { useUIStore } from "@/stores/ui"
import { useWorkspaceStore } from "@/stores/workspace"
import { useProviderStore } from "@/stores/provider"
import { useSkillsStore } from "@/stores/skills"
import { useMajordomoStore, initMajordomoResultListener } from "@/stores/majordomo"
import { useChatStore } from "@/stores/chat"
import { useLayoutStore } from "@/stores/layout"
import { useTaskStore } from "@/stores/tasks"
import { useAgentAppsStore } from "@/stores/agent-apps"
import { useColumnResize } from "@/hooks/useColumnResize"
import { initAppDirs } from "@/services/providers/storage"
import { listWorkspaces, createWorkspace, newWorkspace } from "@/services/workspace"
import { listProviders } from "@/services/providers/storage"
import { listSkills } from "@/services/skills"
import { discoverGlobalSkills, loadFullSkill } from "@/services/skills/skill-discovery"
import { registerBuiltins } from "@/services/tools/builtins"
import { loadMajordomoMessages, MAJORDOMO_WS_ID } from "@/services/conversation"
import { agentPool } from "@/services/agent-pool"
import { eventBus } from "@/services/event-bus"
import { ESLINT_APP } from "@/services/native-apps/eslint-app"
import { TSC_APP } from "@/services/native-apps/tsc-app"
import { TEST_RUNNER_APP } from "@/services/native-apps/test-runner-app"
import { MajordomoPanel } from "@/components/majordomo/MajordomoPanel"
import { ChatPanel } from "@/components/chat/ChatPanel"
import { PreviewPanel } from "@/components/preview/PreviewPanel"
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel"
import { WorkspaceSkillCatalog } from "@/components/workspace/WorkspaceSkillCatalog"
import { MajordomoSkillCatalog } from "@/components/workspace/MajordomoSkillCatalog"
import { FlexibleWorkspace, type Pane } from "@/components/workspace/FlexibleWorkspace"
import { AgentsPanel } from "@/components/agents/AgentsPanel"
import { ProviderSettings } from "@/components/provider/ProviderSettings"
import { CommandPalette } from "@/components/majordomo/CommandPalette"
import { LayoutToggle } from "@/components/ui/LayoutToggle"
import { AgentAppPane } from "@/components/workspace/AgentAppPane"
import { ObservabilityDashboard } from "@/components/observability/ObservabilityDashboard"
import { OrchestratorSettings } from "@/components/workspace/OrchestratorSettings"
import { AgentAppSettings } from "@/components/workspace/AgentAppSettings"
import type { AgentAppManifest, RenderableContent, Skill } from "@/types"

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
  const { setSkills, workspaceActiveSkillIds } = useSkillsStore()
  const { setInstalledApps } = useAgentAppsStore()
  // useMajordomoStore still needed for initMajordomoResultListener (called in bootstrap)
  useMajordomoStore()
  const setMajordomoMessages = useChatStore((state) => state.setMessages)
  const {
    majordomoWidth,
    rightPanelWidth,
    showLeft,
    showCenter,
    showRight,
    setMajordomoWidth,
    setRightPanelWidth,
  } = useLayoutStore()

  // Panel DOM refs for direct width mutation during drag
  const mjPanelRef = useRef<HTMLDivElement>(null)
  const rightPanelRef = useRef<HTMLDivElement>(null)

  // ── Panel resize logic ─────────────────────────────────────

  const startMjResize = useColumnResize(mjPanelRef, majordomoWidth, {
    min: 180,
    max: 600,
    onCommit: setMajordomoWidth,
  })

  const startRightResize = useColumnResize(rightPanelRef, rightPanelWidth, {
    min: 180,
    max: 500,
    onCommit: setRightPanelWidth,
    invertDelta: true,
  })

  // Right panel tab state: "files" | "skills" | "git"
  const [rightPanelTab, setRightPanelTab] = useState<"files" | "skills" | "git">("files")

  // E4.5: Observability dashboard visibility
  const [showObservability, setShowObservability] = useState(false)

  // Orchestrator Settings modal
  const [showOrchestratorSettings, setShowOrchestratorSettings] = useState(false)

  // Agent App Settings modal
  const [appSettingsTarget, setAppSettingsTarget] = useState<{
    instanceId: string
    appId: string
  } | null>(null)

  // Flexible workspace panes
  const [workspacePanes, setWorkspacePanes] = useState<Pane[]>([])

  // Preview content keyed by pane id
  const [previewMap, setPreviewMap] = useState<Record<string, RenderableContent>>({})

  const activeWorkspace = workspaces.find((ws) => ws.id === activeWorkspaceId)

  // Bootstrap on mount
  useEffect(() => {
    document.documentElement.dataset.theme = theme

    // Register built-in tools once
    registerBuiltins()

    // Wire up Majordomo ← workspace result notifications
    const unsubscribeResults = initMajordomoResultListener()

    // Clean up all stores when a workspace is deleted
    const unsubscribeDelete = eventBus.on("workspace:deleted", ({ workspaceId }) => {
      useChatStore.getState().deleteWorkspaceData(workspaceId)
      useLayoutStore.getState().deleteWorkspaceLayout(workspaceId)
      useSkillsStore.getState().deleteWorkspaceData(workspaceId)
      useTaskStore.getState().deleteWorkspaceTasks(workspaceId)
      useMajordomoStore.getState().deleteWorkspaceSummary(workspaceId)
      agentPool.remove(workspaceId)
    })

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

        // Also discover SKILL.md-format skills from ~/.mindeck/skills/ and ~/.claude/skills/
        const globalIndices = await discoverGlobalSkills().catch(() => [])
        const skillsMd = (
          await Promise.all(
            globalIndices
              .filter((idx) => idx.source.type === "skill-md")
              .map((idx) => loadFullSkill(idx).catch(() => null))
          )
        ).filter((s): s is Skill => s !== null)
        const existingIds = new Set(skillsList.map((s) => s.id))
        const newMdSkills = skillsMd.filter((s) => !existingIds.has(s.id))

        setWorkspaces(wsList)
        setProviders(provList)
        setSkills([...skillsList, ...newMdSkills])
        setMajordomoMessages(MAJORDOMO_WS_ID, majordomoMsgs)

        // Seed installed apps: native apps always first, then disk-persisted apps
        const nativeApps: AgentAppManifest[] = [ESLINT_APP, TSC_APP, TEST_RUNNER_APP]
        const nativeIds = new Set(nativeApps.map((a) => a.id))
        const savedApps = await invoke<AgentAppManifest[]>("load_app_registry").catch(
          () => []
        )
        setInstalledApps([
          ...nativeApps,
          ...savedApps.filter((a) => !nativeIds.has(a.id)),
        ])

        // Connect pool agents for all workspaces so dispatches work
        // regardless of which workspace is currently visible in the UI
        agentPool.initAll(wsList)

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
      unsubscribeDelete()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep pool in sync when workspaces are added/removed
  useEffect(() => {
    if (workspaces.length > 0) {
      agentPool.initAll(workspaces)
    }
  }, [workspaces])

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

  // Handle pane changes in flexible workspace
  function handlePanesChange(panes: Pane[]) {
    setWorkspacePanes(panes)
  }

  // Load file content when file pane is added
  useEffect(() => {
    workspacePanes.forEach(async (pane) => {
      if (pane.type === "file" && pane.filePath && !previewMap[pane.id]) {
        try {
          const content = await invoke<string>("read_file", { path: pane.filePath })
          // Determine renderer type based on file extension
          const ext = pane.filePath.split(".").pop()?.toLowerCase()
          let rendererType: "markdown" | "code" | "image" | "raw" = "raw"
          if (ext === "md" || ext === "markdown") {
            rendererType = "markdown"
          } else if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext || "")) {
            rendererType = "image"
          } else if (ext) {
            rendererType = "code"
          }
          setPreviewMap((prev) => ({
            ...prev,
            [pane.id]: {
              type: rendererType,
              content,
              language: ext,
              filename: pane.title,
            },
          }))
        } catch (err) {
          console.error("Failed to load file:", err)
        }
      }
    })
  }, [workspacePanes])

  // Handle preview for a pane
  function handlePreview(paneId: string, content: string) {
    setPreviewMap((prev) => ({
      ...prev,
      [paneId]: { type: "markdown", content },
    }))
  }

  // Render content for a pane based on its type
  const renderPaneContent = useCallback(
    (pane: Pane, onClose: () => void): React.ReactNode => {
      if (pane.type === "agent") {
        // Use the workspace from the pane, or fall back to activeWorkspace
        const workspace = pane.workspaceId
          ? workspaces.find((ws) => ws.id === pane.workspaceId)
          : activeWorkspace
        if (!workspace) return null
        return (
          <ChatPanel
            workspace={workspace}
            onClose={onClose}
            onPreview={(content) => handlePreview(pane.id, content)}
          />
        )
      }

      if (pane.type === "file") {
        if (!activeWorkspace) return null
        const content = previewMap[pane.id]
        return content ? <PreviewPanel content={content} onClose={onClose} /> : null
      }

      if (pane.type === "agent-app") {
        const workspace = pane.workspaceId
          ? workspaces.find((ws) => ws.id === pane.workspaceId)
          : activeWorkspace
        if (!workspace) return null
        return (
          <AgentAppPane appId={pane.appId} workspaceId={workspace.id} onClose={onClose} />
        )
      }

      return null
    },
    [activeWorkspace, workspaces, previewMap]
  )

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
          <LayoutToggle />
          <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowObservability(true)}
            title="Observability"
          >
            <BarChart2 size={14} />
          </button>
          <button className="icon-btn" onClick={openSettings} title="Settings (⌘,)">
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* ── MAIN BODY: 3-column layout ── */}
      <div className="body">
        {/* Column 1: Majordomo — removed from DOM when hidden */}
        {showLeft && <MajordomoPanel panelRef={mjPanelRef} />}

        {/* Resize handle between Majordomo and workspace */}
        {showLeft && showCenter && (
          <div className="panel-resize-handle" onPointerDown={startMjResize} />
        )}

        {/* Column 2: Flexible Workspace (middle) */}
        {showCenter &&
          (activeWorkspace ? (
            <FlexibleWorkspace
              workspaceId={activeWorkspace.id}
              initialPanes={workspacePanes}
              onPanesChange={handlePanesChange}
              renderContent={renderPaneContent}
            />
          ) : (
            <div className="workspace-empty">
              <p>Create a workspace to get started.</p>
            </div>
          ))}

        {/* Column 3: Right Panel (Files/Git tabs + Agents) — removed from DOM when hidden */}
        {showRight && activeWorkspace && (
          <>
            {/* Resize handle between workspace and right panel */}
            {showCenter && (
              <div className="panel-resize-handle" onPointerDown={startRightResize} />
            )}

            <div
              ref={rightPanelRef}
              className="right-panel"
              style={{ width: rightPanelWidth }}
            >
              {/* Top: File tabs (Files, Skills, Git) - 70% */}
              <div className="right-panel-top">
                <div className="right-panel-tabs">
                  <button
                    className={`right-panel-tab ${rightPanelTab === "files" ? "on" : ""}`}
                    onClick={() => setRightPanelTab("files")}
                  >
                    <Files size={12} />
                    <span>Files</span>
                  </button>
                  <button
                    className={`right-panel-tab ${rightPanelTab === "skills" ? "on" : ""}`}
                    onClick={() => setRightPanelTab("skills")}
                  >
                    <Sparkles size={12} />
                    <span>Skills</span>
                    {activeWorkspace &&
                      (workspaceActiveSkillIds[activeWorkspace.id]?.length ?? 0) > 0 && (
                        <span className="right-panel-tab-badge">
                          {workspaceActiveSkillIds[activeWorkspace.id].length}
                        </span>
                      )}
                  </button>
                  <button
                    className={`right-panel-tab ${rightPanelTab === "git" ? "on" : ""}`}
                    onClick={() => setRightPanelTab("git")}
                  >
                    <GitBranch size={12} />
                    <span>Git</span>
                  </button>
                </div>
                <div className="right-panel-content">
                  {rightPanelTab === "files" && (
                    <WorkspacePanel workspace={activeWorkspace} />
                  )}
                  {rightPanelTab === "skills" && (
                    <div className="skills-tab-split">
                      <div className="skills-tab-top">
                        <MajordomoSkillCatalog />
                      </div>
                      <div className="skills-tab-divider" />
                      <div className="skills-tab-bottom">
                        <WorkspaceSkillCatalog workspaceId={activeWorkspace.id} />
                      </div>
                    </div>
                  )}
                  {rightPanelTab === "git" && (
                    <div className="right-panel-placeholder">
                      Git integration coming soon
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom: Agents + MCP Apps panel - 30% */}
              <div className="right-panel-bottom">
                <AgentsPanel
                  workspaceId={activeWorkspace?.id}
                  onOpenOrchestratorSettings={() => setShowOrchestratorSettings(true)}
                  onOpenAppSettings={(instanceId, appId) =>
                    setAppSettingsTarget({ instanceId, appId })
                  }
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── OVERLAYS ── */}
      <ProviderSettings />
      <CommandPalette />
      {showObservability && (
        <ObservabilityDashboard onClose={() => setShowObservability(false)} />
      )}
      {showOrchestratorSettings && activeWorkspace && (
        <OrchestratorSettings
          workspaceId={activeWorkspace.id}
          onClose={() => setShowOrchestratorSettings(false)}
        />
      )}
      {appSettingsTarget && (
        <AgentAppSettings
          instanceId={appSettingsTarget.instanceId}
          appId={appSettingsTarget.appId}
          onClose={() => setAppSettingsTarget(null)}
        />
      )}
    </div>
  )
}
