import { useState } from "react"
import { Bot } from "lucide-react"
import { useWorkspaceStore } from "@/stores/workspace"
import { useDragState } from "@/services/dragState"

interface AgentNode {
  id: string
  type: "main"
  workspaceId: string
}

export function AgentsPanel() {
  const { workspaces, activeWorkspaceId } = useWorkspaceStore()
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [draggingAgentId, setDraggingAgentId] = useState<string | null>(null)

  const handlePointerDown = (e: React.PointerEvent, agent: AgentNode) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startY = e.clientY
    let dragInitialized = false
    let previewEl: HTMLDivElement | null = null

    const dragData = {
      id: `agent-${agent.id}-${Date.now()}`,
      type: "agent" as const,
      title: "Main agent",
      workspaceId: agent.workspaceId,
    }

    const initDrag = (clientX: number, clientY: number) => {
      if (dragInitialized) return
      dragInitialized = true

      useDragState.getState().setDragging(dragData)
      sessionStorage.setItem("pointer-drag-active", "true")
      setDraggingAgentId(agent.id)
      document.body.style.userSelect = "none"

      previewEl = document.createElement("div")
      previewEl.id = "drag-preview-cursor"
      previewEl.textContent = "Main agent"
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
        if (dx * dx + dy * dy > 25) {
          initDrag(moveEvent.clientX, moveEvent.clientY)
        }
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

      if (!dragInitialized) {
        sessionStorage.removeItem("pointer-drag-active")
      }
    }

    document.addEventListener("pointermove", handlePointerMove)
    document.addEventListener("pointerup", handlePointerUp)
    document.addEventListener("pointercancel", handlePointerUp)
  }

  // Only show agents for the active workspace
  const agents: AgentNode[] = workspaces
    .filter((ws) => ws.id === activeWorkspaceId)
    .map((ws) => ({
      id: ws.id,
      type: "main" as const,
      workspaceId: ws.id,
    }))

  return (
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

            return (
              <div
                key={agent.id}
                className={`agent-tree-item ${isSelected ? "selected" : ""} ${isDragging ? "dragging" : ""}`}
                onClick={() => setSelectedAgentId(agent.id)}
                onPointerDown={(e) => handlePointerDown(e, agent)}
                style={{ userSelect: "none", cursor: "grab" }}
              >
                <div className="agent-tree-icon">
                  <Bot size={12} />
                </div>
                <span className="agent-tree-label">Main agent</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
