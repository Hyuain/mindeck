import { useState } from "react"
import { ChevronRight, ChevronDown, Bot, Users } from "lucide-react"
import { useWorkspaceStore } from "@/stores/workspace"

interface AgentNode {
  id: string
  name: string
  type: "main" | "sub"
  workspaceId?: string
}

interface AgentsPanelProps {
  /** Callback when an agent is dragged to the workspace */
  onAgentDrag?: (agent: AgentNode) => void
}

export function AgentsPanel(_props: AgentsPanelProps) {
  const { workspaces } = useWorkspaceStore()
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set())
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null)
  const [draggingAgentId, setDraggingAgentId] = useState<string | null>(null)

  // Toggle workspace expansion
  const toggleWorkspace = (wsId: string) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev)
      if (next.has(wsId)) {
        next.delete(wsId)
      } else {
        next.add(wsId)
      }
      return next
    })
  }

  // Handle agent drag start
  const handleDragStart = (e: React.DragEvent, agent: AgentNode) => {
    setDraggingAgentId(agent.id)
    const dragData = {
      id: `agent-${agent.id}`,
      type: "agent" as const,
      title: agent.name,
      workspaceId: agent.workspaceId,
    }
    e.dataTransfer.setData("application/json", JSON.stringify(dragData))
    e.dataTransfer.effectAllowed = "copy"
    // Store for cross-container preview
    sessionStorage.setItem("drag-preview", JSON.stringify(dragData))
  }

  // Handle drag end
  const handleDragEnd = () => {
    setDraggingAgentId(null)
  }

  // Build tree structure from workspaces
  const buildAgentTree = (): AgentNode[] => {
    return workspaces.map((ws) => ({
      id: ws.id,
      name: ws.name,
      type: "main" as const,
      workspaceId: ws.id,
    }))
  }

  const agents = buildAgentTree()

  return (
    <div className="agents-panel">
      {agents.length === 0 ? (
        <div className="agent-tree-empty">
          <p>No workspaces yet</p>
          <p style={{ marginTop: 4, opacity: 0.7 }}>
            Create a workspace to see its agent
          </p>
        </div>
      ) : (
        <div className="agent-tree">
          {agents.map((agent) => {
            const isExpanded = expandedWorkspaces.has(agent.id)
            const isSelected = selectedAgentId === agent.id
            const isDragging = draggingAgentId === agent.id

            return (
              <div key={agent.id}>
                <div
                  className={`agent-tree-item ${
                    isSelected ? "selected" : ""
                  } ${isDragging ? "dragging" : ""}`}
                  onClick={() => setSelectedAgentId(agent.id)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, agent)}
                  onDragEnd={handleDragEnd}
                >
                  <button
                    className="agent-tree-chevron"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleWorkspace(agent.id)
                    }}
                    style={{
                      visibility: agent.type === "main" ? "visible" : "hidden",
                    }}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <div className="agent-tree-icon">
                    {agent.type === "main" ? <Bot size={12} /> : <Users size={12} />}
                  </div>
                  <span className="agent-tree-label">{agent.name}</span>
                </div>
                {isExpanded && agent.type === "main" && (
                  <div className="agent-tree-children">
                    <SubAgentItem
                      workspaceId={agent.workspaceId!}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Sub-agent item component
interface SubAgentItemProps {
  workspaceId: string
  onDragStart: (e: React.DragEvent, agent: AgentNode) => void
  onDragEnd: () => void
}

function SubAgentItem({ workspaceId, onDragStart, onDragEnd }: SubAgentItemProps) {
  // For now, show placeholder - sub-agents would come from workspace state
  return (
    <div
      className="agent-tree-item"
      draggable
      onDragStart={(e) =>
        onDragStart(e, {
          id: `sub-${workspaceId}-default`,
          name: "Default Agent",
          type: "sub",
          workspaceId,
        })
      }
      onDragEnd={onDragEnd}
    >
      <span style={{ width: 14 }} />
      <div className="agent-tree-icon sub-agent">
        <Users size={10} />
      </div>
      <span className="agent-tree-label">Default Agent</span>
    </div>
  )
}
