import { useEffect, type RefObject } from "react"
import { useMajordomoStore } from "@/stores/majordomo"
import { useChatStore } from "@/stores/chat"
import { useWorkspaceStore } from "@/stores/workspace"
import { useProviderStore } from "@/stores/provider"
import { useLayoutStore } from "@/stores/layout"
import { useTaskStore } from "@/stores/tasks"
import { MAJORDOMO_WS_ID } from "@/services/conversation"
import { majordomoAgent } from "@/services/majordomo-agent"
import { MajordomoWorkspaceList } from "./MajordomoWorkspaceList"
import { MajordomoTaskList } from "./MajordomoTaskList"
import { MajordomoInput } from "./MajordomoInput"
import type { Task, WorkspaceSummary, Message } from "@/types"

// Stable empty array — prevents React 19 getSnapshot tearing detection from
// triggering infinite re-renders when the MAJORDOMO_WS_ID key is absent.
const EMPTY_MESSAGES: Message[] = []

interface MajordomoPanelProps {
  panelRef?: RefObject<HTMLDivElement | null>
}

export function MajordomoPanel({ panelRef }: MajordomoPanelProps) {
  const {
    isStreaming,
    workspaceSummaries,
    selectedProviderId,
    selectedModelId,
    setModel,
    activeToolActivities,
    pendingPermissions,
  } = useMajordomoStore()

  const messages = useChatStore(
    (state) => state.messages[MAJORDOMO_WS_ID] ?? EMPTY_MESSAGES
  )
  const { workspaces } = useWorkspaceStore()
  const { providers } = useProviderStore()
  const { majordomoWidth } = useLayoutStore()
  const allTasks = useTaskStore((state) => state.tasks)

  // Auto-select the first provider/model when providers load and nothing is selected
  useEffect(() => {
    if (selectedProviderId || providers.length === 0) return
    const p = providers[0]
    const m = p.defaultModel ?? p.models?.[0]?.id ?? ""
    if (p.id && m) setModel(p.id, m)
  }, [providers, selectedProviderId, setModel])

  // Per-workspace task data derived from the store
  const tasksByWorkspace: Record<string, Task[]> = {}
  for (const ws of workspaces) {
    tasksByWorkspace[ws.id] = allTasks
      .filter((t) => t.workspaceId === ws.id)
      .sort((a, b) => b.createdAt - a.createdAt)
  }

  const summaries: WorkspaceSummary[] = workspaces.map((ws) => {
    const stored = workspaceSummaries.find((s) => s.workspaceId === ws.id)
    return {
      workspaceId: ws.id,
      workspaceName: ws.name,
      status: ws.status,
      snippet: stored?.snippet ?? ws.stateSummary ?? "",
      updatedAt: ws.updatedAt,
    }
  })

  async function handleSend(content: string, skillIds: string[]) {
    await majordomoAgent.send(content, workspaces, summaries, skillIds)
  }

  return (
    <div ref={panelRef} className="mj-panel" style={{ width: majordomoWidth }}>
      <MajordomoInput
        isStreaming={isStreaming}
        messages={messages}
        selectedProviderId={selectedProviderId}
        selectedModelId={selectedModelId}
        setModel={setModel}
        onSend={handleSend}
      />

      <MajordomoWorkspaceList
        summaries={summaries}
        tasksByWorkspace={tasksByWorkspace}
      />

      <MajordomoTaskList
        messages={messages}
        isStreaming={isStreaming}
        activeToolActivities={activeToolActivities}
        pendingPermissions={pendingPermissions}
      />
    </div>
  )
}
