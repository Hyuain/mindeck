/**
 * MCPAppFrame — renders an MCP App UI resource in an iframe.
 * Bridges postMessage from iframe → MCP server tool calls → result back.
 */
import { useEffect, useRef } from "react"
import { mcpManager } from "@/services/mcp/manager"

interface MCPAppFrameProps {
  resourceUri: string
  workspaceId: string
  appId: string
}

interface MCPBridgeMessage {
  method: string
  params?: { name?: string; arguments?: Record<string, unknown> }
  id?: number
}

export function MCPAppFrame({ resourceUri, workspaceId, appId }: MCPAppFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const iframe = iframeRef.current
      if (!iframe || event.source !== iframe.contentWindow) return

      const msg = event.data as MCPBridgeMessage
      if (!msg || msg.method !== "mcp.callTool") return
      if (!msg.params?.name) return

      const { name, arguments: args = {} } = msg.params
      const msgId = msg.id ?? 0

      // Find the dep name from appId (format: "mcp:{depName}")
      const depName = appId.startsWith("mcp:") ? appId.slice(4) : appId
      const executors = mcpManager.getExecutorsForWorkspace(workspaceId)
      const exec = executors.get(name) ?? executors.get(`${depName}.${name}`)

      if (!exec) {
        iframe.contentWindow?.postMessage(
          { id: msgId, error: { message: `Tool '${name}' not found` } },
          "*"
        )
        return
      }

      exec(args)
        .then((result) => {
          iframe.contentWindow?.postMessage({ id: msgId, result }, "*")
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err)
          iframe.contentWindow?.postMessage({ id: msgId, error: { message } }, "*")
        })
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [workspaceId, appId])

  return (
    <iframe
      ref={iframeRef}
      src={resourceUri}
      className="mcp-app-frame"
      sandbox="allow-scripts allow-forms allow-same-origin"
      title={`MCP App: ${appId}`}
    />
  )
}
