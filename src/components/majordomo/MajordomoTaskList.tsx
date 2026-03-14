import { useRef, useEffect } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkBreaks from "remark-breaks"
import rehypeHighlight from "rehype-highlight"
import { ShieldAlert } from "lucide-react"
import { useWorkspaceStore } from "@/stores/workspace"
import { resolvePermission, resolveAllPermissions } from "@/services/security/permissions"
import { ToolActivityRow } from "./ToolActivityRow"
import { MessageBubble } from "@/components/chat/MessageBubble"
import type { Message, ToolActivity, PermissionRequest } from "@/types"

interface MajordomoTaskListProps {
  messages: Message[]
  isStreaming: boolean
  activeToolActivities: ToolActivity[]
  pendingPermissions: PermissionRequest[]
}

export function MajordomoTaskList({
  messages,
  isStreaming,
  activeToolActivities,
  pendingPermissions,
}: MajordomoTaskListProps) {
  const { workspaces } = useWorkspaceStore()

  const msgsEndRef = useRef<HTMLDivElement>(null)
  const msgsContainerRef = useRef<HTMLDivElement>(null)
  const isMjNearBottomRef = useRef(true)

  function handleMjScroll() {
    const el = msgsContainerRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isMjNearBottomRef.current = distFromBottom <= 80
  }

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    if (isMjNearBottomRef.current) {
      msgsEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages.length])

  return (
    <>
      {/* Chat messages */}
      <div ref={msgsContainerRef} className="mj-messages" onScroll={handleMjScroll}>
        {messages.length === 0 && (
          <div style={{ padding: "12px 16px", color: "var(--color-t2)", fontSize: 12 }}>
            Ask me anything across all your workspaces.
          </div>
        )}
        {messages.map((msg, idx) => {
          const isLastMsg = idx === messages.length - 1
          // Workspace result card (system message with isResultCard metadata)
          if (msg.role === "system" && msg.metadata?.isResultCard) {
            const wsId = msg.metadata.workspaceId as string | undefined
            const ws = wsId ? workspaces.find((w) => w.id === wsId) : undefined
            const label = ws?.name ?? wsId ?? "Workspace"
            const fullResult =
              (msg.metadata.fullResult as string | undefined) ??
              msg.content.replace("[Workspace result] ", "")
            return (
              <div key={msg.id} className="mj-result-card">
                <div className="mj-result-card-header">
                  <span className="mj-result-card-icon">📋</span>
                  <span className="mj-result-card-label">{label} reported</span>
                  <span className="mj-result-card-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="mj-result-card-body">
                  <div className="msg-markdown">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkBreaks]}
                      rehypePlugins={[rehypeHighlight]}
                    >
                      {fullResult}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )
          }

          return (
            <MessageBubble
              key={msg.id}
              message={msg}
              variant="mj"
              isStreaming={isStreaming && isLastMsg && msg.role === "assistant"}
            />
          )
        })}
        <div ref={msgsEndRef} />
      </div>

      {/* Tool activity bar — shown at bottom when tools are running */}
      {activeToolActivities.some((a) => a.status === "running") && (
        <div className="mj-tool-activities">
          {activeToolActivities
            .filter((a) => a.status === "running")
            .map((a) => (
              <ToolActivityRow key={a.id} activity={a} />
            ))}
        </div>
      )}

      {/* Pending permission requests */}
      {pendingPermissions.length > 0 && (
        <div className="mj-pending-actions">
          <div className="mj-pending-header">
            <span className="mj-pending-title">
              <ShieldAlert size={10} />
              {pendingPermissions.length === 1
                ? "Permission required"
                : `${pendingPermissions.length} permissions required`}
            </span>
            {pendingPermissions.length > 1 && (
              <div className="mj-pending-bulk">
                <button
                  className="mj-perm-deny-all"
                  onClick={() => resolveAllPermissions(false)}
                >
                  Deny all
                </button>
                <button
                  className="mj-perm-grant-all"
                  onClick={() => resolveAllPermissions(true)}
                >
                  Allow all
                </button>
              </div>
            )}
          </div>
          {pendingPermissions.map((req) => (
            <div key={req.id} className="mj-permission-card">
              <div className="mj-perm-head">
                <span className="mj-perm-type-badge">{req.type}</span>
                <span className="mj-perm-label">{req.label}</span>
                {req.requestedBy && (
                  <span className="mj-perm-requester">
                    <span className="mj-perm-requester-dot" />
                    {req.requestedBy}
                  </span>
                )}
              </div>
              <div className="mj-perm-body">
                <pre className="mj-perm-details">{req.details}</pre>
                <div className="mj-perm-actions">
                  <button
                    className="mj-perm-deny"
                    onClick={() => resolvePermission(req.id, false)}
                  >
                    Deny
                  </button>
                  <button
                    className="mj-perm-allow"
                    onClick={() => resolvePermission(req.id, true)}
                  >
                    Allow
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
