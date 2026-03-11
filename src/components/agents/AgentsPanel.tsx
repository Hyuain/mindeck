import { useState } from "react"
import {
  Bot,
  Cpu,
  ChevronRight,
  ChevronDown,
  LayoutGrid,
  Plus,
  Unplug,
  Settings,
  RefreshCw,
  PowerOff,
} from "lucide-react"
import { useWorkspaceStore } from "@/stores/workspace"
import { useAgentsStore } from "@/stores/agents"
import { useAgentAppsStore } from "@/stores/agent-apps"
import { useUIStore } from "@/stores/ui"
import { useDragState } from "@/services/dragState"
import type { DragPreview } from "@/services/dragState"
import { AppCatalogPicker } from "./AppCatalogPicker"
import { ContextMenu } from "@/components/ui/ContextMenu"
import type { ContextMenuItem } from "@/components/ui/ContextMenu"
import type { AgentAppManifest, AppInstance } from "@/types"

// ─── Helpers ───────────────────────────────────────────────

function getAppRoleLabel(app: AgentAppManifest): string {
  if (app.kind === "native") return "Native"
  if (app.kind === "system") return "System"
  const parts: string[] = []
  if (app.mcpDependencies?.length) parts.push("MCP")
  if (app.harness?.triggers?.length) parts.push("Harness")
  if (app.capabilities?.ui) parts.push("UI")
  return parts.length > 0 ? parts.join(" · ") : "App"
}

// ─── Context menu state ──────────────────────────────────

interface ContextMenuState {
  position: { x: number; y: number }
  items: ContextMenuItem[]
  target:
    | { type: "orchestrator"; workspaceId: string }
    | { type: "app"; workspaceId: string; instanceId: string; appId: string }
}

// ─── AgentAppNode ──────────────────────────────────────────

interface AgentAppNodeProps {
  instance: AppInstance
  manifest: AgentAppManifest
  workspaceId: string
  onPointerDown?: (e: React.PointerEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
}

function AgentAppNode({
  instance,
  manifest,
  workspaceId,
  onPointerDown,
  onContextMenu,
}: AgentAppNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const { deactivateApp } = useAgentAppsStore()

  const label = instance.label ? `${manifest.name} (${instance.label})` : manifest.name

  const mcpCount = manifest.mcpDependencies?.length ?? 0
  const triggerSummary = manifest.harness?.triggers
    .map((t) => {
      if (t.event === "file_written" && t.pattern) return `file_written ${t.pattern}`
      return t.event
    })
    .join(", ")

  return (
    <div className="agent-app-node">
      <div
        className="agent-tree-item agent-app-node-row"
        onClick={() => setExpanded((e) => !e)}
        onPointerDown={onPointerDown}
        onContextMenu={onContextMenu}
        style={{ userSelect: "none", cursor: onPointerDown ? "grab" : "pointer" }}
      >
        <div className="agent-tree-connector" />
        <div className="agent-tree-icon sub-agent">
          <LayoutGrid size={10} />
        </div>
        <span className="agent-tree-label">{label}</span>
        {instance.label && (
          <span className="agent-app-instance-label">{instance.label}</span>
        )}
        <span className="agent-app-kind-badge">{getAppRoleLabel(manifest)}</span>
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </div>

      {expanded && (
        <div className="agent-app-node-detail">
          {manifest.nativeComponent && (
            <div className="agent-app-node-detail-row">
              <span className="agent-app-node-detail-label">Type:</span>
              <span>Built-in · {manifest.nativeComponent}</span>
            </div>
          )}
          {mcpCount > 0 && (
            <div className="agent-app-node-detail-row">
              <span className="agent-app-node-detail-label">MCPs:</span>
              <span>
                {mcpCount} server{mcpCount !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          {triggerSummary && (
            <div className="agent-app-node-detail-row">
              <span className="agent-app-node-detail-label">Triggers:</span>
              <span className="agent-app-node-detail-trigger">{triggerSummary}</span>
            </div>
          )}
          <button
            className="agent-app-node-deactivate"
            onClick={(e) => {
              e.stopPropagation()
              deactivateApp(workspaceId, instance.instanceId)
            }}
          >
            <Unplug size={9} /> Deactivate
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Types ─────────────────────────────────────────────────

interface AgentNode {
  id: string
  type: "main"
  workspaceId: string
}

// ─── Main component ────────────────────────────────────────

interface AgentsPanelProps {
  workspaceId?: string
  onOpenOrchestratorSettings?: () => void
  onOpenAppSettings?: (instanceId: string, appId: string) => void
}

export function AgentsPanel({
  workspaceId,
  onOpenOrchestratorSettings,
  onOpenAppSettings,
}: AgentsPanelProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [draggingAgentId, setDraggingAgentId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const { workspaces, activeWorkspaceId } = useWorkspaceStore()
  const { subAgents } = useAgentsStore()
  const { installedApps, deactivateApp } = useAgentAppsStore()
  const { openAppCatalog } = useUIStore()

  const activeWorkspace = workspaces.find((ws) => ws.id === activeWorkspaceId)
  const activatedApps = activeWorkspace?.activatedApps ?? []

  // Resolve instance → manifest pairs
  const instancesWithManifest = activatedApps
    .map((inst) => ({
      instance: inst,
      manifest: installedApps.find((a) => a.id === inst.appId),
    }))
    .filter(
      (x): x is { instance: AppInstance; manifest: AgentAppManifest } =>
        x.manifest !== undefined
    )

  // ── Context menu handlers ─────────────────────────────────

  function handleOrchestratorContextMenu(e: React.MouseEvent, wsId: string) {
    e.preventDefault()
    e.stopPropagation()
    const items: ContextMenuItem[] = [
      { id: "reconnect-mcp", label: "Reconnect MCP", icon: <RefreshCw size={11} /> },
      {
        id: "settings",
        label: "Settings…",
        icon: <Settings size={11} />,
        dividerBefore: true,
      },
    ]
    setContextMenu({
      position: { x: e.clientX, y: e.clientY },
      items,
      target: { type: "orchestrator", workspaceId: wsId },
    })
  }

  function handleAppContextMenu(
    e: React.MouseEvent,
    wsId: string,
    instanceId: string,
    appId: string
  ) {
    e.preventDefault()
    e.stopPropagation()
    const manifest = installedApps.find((a) => a.id === appId)
    const isCustom = manifest?.kind === "custom"
    const items: ContextMenuItem[] = [
      { id: "reconnect", label: "Reconnect", icon: <RefreshCw size={11} /> },
      { id: "app-settings", label: "Settings…", icon: <Settings size={11} /> },
      {
        id: "deactivate",
        label: "Deactivate",
        icon: <PowerOff size={11} />,
        danger: true,
        dividerBefore: true,
      },
    ]
    if (isCustom) {
      items.push({
        id: "uninstall",
        label: "Uninstall",
        icon: <Unplug size={11} />,
        danger: true,
      })
    }
    setContextMenu({
      position: { x: e.clientX, y: e.clientY },
      items,
      target: { type: "app", workspaceId: wsId, instanceId, appId },
    })
  }

  function handleContextMenuSelect(id: string) {
    if (!contextMenu) return
    const { target } = contextMenu
    if (target.type === "orchestrator") {
      if (id === "settings") onOpenOrchestratorSettings?.()
      // reconnect-mcp handled elsewhere (future wiring)
    } else if (target.type === "app") {
      if (id === "app-settings") onOpenAppSettings?.(target.instanceId, target.appId)
      if (id === "deactivate") deactivateApp(target.workspaceId, target.instanceId)
      if (id === "uninstall") {
        deactivateApp(target.workspaceId, target.instanceId)
        useAgentAppsStore.getState().removeApp(target.appId)
      }
    }
    setContextMenu(null)
  }

  // ── Agent drag ───────────────────────────────────────────

  const startDrag = (e: React.PointerEvent, dragData: DragPreview) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startY = e.clientY
    let dragInitialized = false
    let previewEl: HTMLDivElement | null = null

    const initDrag = (clientX: number, clientY: number) => {
      if (dragInitialized) return
      dragInitialized = true
      useDragState.getState().setDragging(dragData)
      sessionStorage.setItem("pointer-drag-active", "true")
      setDraggingAgentId(dragData.id)
      document.body.style.userSelect = "none"
      previewEl = document.createElement("div")
      previewEl.id = "drag-preview-cursor"
      previewEl.textContent = dragData.title
      previewEl.style.cssText = `
        position: fixed;
        pointer-events: none;
        z-index: 9999;
        padding: 5px 11px;
        background: var(--color-sa, #a78bfa);
        color: white;
        border-radius: 4px;
        font-size: 12px;
        font-family: var(--font-sans);
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        white-space: nowrap;
        left: ${clientX}px;
        top: ${clientY}px;
        transform: translate(10px, 10px);
      `
      document.body.appendChild(previewEl)
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!dragInitialized) {
        const dx = moveEvent.clientX - startX
        const dy = moveEvent.clientY - startY
        if (dx * dx + dy * dy > 25) initDrag(moveEvent.clientX, moveEvent.clientY)
        return
      }
      if (previewEl) {
        previewEl.style.left = moveEvent.clientX + "px"
        previewEl.style.top = moveEvent.clientY + "px"
      }
    }

    const handlePointerUp = () => {
      if (previewEl) previewEl.remove()
      document.body.style.userSelect = ""
      setDraggingAgentId(null)
      document.removeEventListener("pointermove", handlePointerMove)
      document.removeEventListener("pointerup", handlePointerUp)
      document.removeEventListener("pointercancel", handlePointerUp)
      if (!dragInitialized) sessionStorage.removeItem("pointer-drag-active")
    }

    document.addEventListener("pointermove", handlePointerMove)
    document.addEventListener("pointerup", handlePointerUp)
    document.addEventListener("pointercancel", handlePointerUp)
  }

  const handlePointerDown = (e: React.PointerEvent, agent: AgentNode) => {
    startDrag(e, {
      id: `agent-${agent.id}-${Date.now()}`,
      type: "agent",
      title: "Orchestrator",
      workspaceId: agent.workspaceId,
    })
  }

  // ── Agent tree data ──────────────────────────────────────

  const agents: AgentNode[] = workspaces
    .filter((ws) => ws.id === activeWorkspaceId)
    .map((ws) => ({
      id: ws.id,
      type: "main" as const,
      workspaceId: ws.id,
    }))

  // ── Render ───────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <div className="agents-apps-header">
        <div className="agents-apps-title">
          <Bot size={12} />
          <span>Agents</span>
        </div>
        <div className="agents-apps-controls">
          <button
            className="icon-btn"
            onClick={openAppCatalog}
            title="Browse Agent Apps (⌘K)"
          >
            <LayoutGrid size={12} />
          </button>
        </div>
      </div>

      {/* Unified agents + app instances tree */}
      <div className="agents-panel">
        {agents.length === 0 ? (
          <div className="agent-tree-empty">
            <p>No active workspace</p>
            <p style={{ marginTop: 4, opacity: 0.7 }}>
              Select a workspace to see its agent
            </p>
          </div>
        ) : (
          <div className="agent-tree">
            {agents.map((agent) => {
              const isSelected = selectedAgentId === agent.id
              const isDragging = draggingAgentId === agent.id
              const children = subAgents[agent.workspaceId] ?? []

              return (
                <div key={agent.id} className="agent-tree-node">
                  {/* Orchestrator row */}
                  <div
                    className={`agent-tree-item ${isSelected ? "selected" : ""} ${isDragging ? "dragging" : ""}`}
                    onClick={() => setSelectedAgentId(agent.id)}
                    onPointerDown={(e) => handlePointerDown(e, agent)}
                    onContextMenu={(e) =>
                      handleOrchestratorContextMenu(e, agent.workspaceId)
                    }
                    style={{ userSelect: "none", cursor: "grab" }}
                  >
                    <div className="agent-tree-icon">
                      <Bot size={12} />
                    </div>
                    <span className="agent-tree-label">Orchestrator</span>
                    {children.length > 0 && (
                      <span className="agent-tree-count">{children.length}</span>
                    )}
                  </div>

                  {/* Sub-agents spawned during this session */}
                  {children.length > 0 && (
                    <div className="agent-tree-children">
                      {children.map((sub) => (
                        <div
                          key={sub.name}
                          className={`agent-tree-item sub-agent-item ${sub.status}`}
                          onPointerDown={(e) =>
                            startDrag(e, {
                              id: `sub-${sub.name}-${Date.now()}`,
                              type: "sub-agent",
                              title: sub.name,
                              workspaceId: agent.workspaceId,
                            })
                          }
                          style={{ userSelect: "none", cursor: "grab" }}
                        >
                          <div className="agent-tree-connector" />
                          <div className="agent-tree-icon sub-agent">
                            <Cpu size={10} />
                          </div>
                          <span className="agent-tree-label sub-agent-label">
                            {sub.name}
                          </span>
                          <span className={`agent-tree-status-dot ${sub.status}`} />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Activated app instances */}
                  {workspaceId && instancesWithManifest.length > 0 && (
                    <div className="agent-tree-children">
                      {instancesWithManifest.map(({ instance, manifest }) => (
                        <AgentAppNode
                          key={instance.instanceId}
                          instance={instance}
                          manifest={manifest}
                          workspaceId={workspaceId}
                          onPointerDown={(e) =>
                            startDrag(e, {
                              id: `app-${instance.instanceId}`,
                              type: "app-instance",
                              title: instance.label
                                ? `${manifest.name} (${instance.label})`
                                : manifest.name,
                              workspaceId,
                            })
                          }
                          onContextMenu={(e) =>
                            handleAppContextMenu(
                              e,
                              workspaceId,
                              instance.instanceId,
                              instance.appId
                            )
                          }
                        />
                      ))}
                    </div>
                  )}

                  {/* [+ Add App] row */}
                  {workspaceId && (
                    <div className="agent-app-add-row" style={{ position: "relative" }}>
                      <button
                        className="agent-app-add-btn"
                        onClick={() => setPickerOpen((p) => !p)}
                        title="Add Agent App to this workspace"
                      >
                        <Plus size={10} /> Add App
                      </button>
                      {pickerOpen && (
                        <AppCatalogPicker
                          workspaceId={workspaceId}
                          onClose={() => setPickerOpen(false)}
                        />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Context menu portal */}
      {contextMenu && (
        <ContextMenu
          items={contextMenu.items}
          position={contextMenu.position}
          onSelect={handleContextMenuSelect}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  )
}
