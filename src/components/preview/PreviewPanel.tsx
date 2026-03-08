import { FileCode, FileText, File, X } from "lucide-react"
import type { RenderableContent } from "@/types"
import { detectRenderer } from "./RendererRegistry"

interface PreviewPanelProps {
  content: RenderableContent | null
  onClose?: () => void
}

function FileIcon({ type }: { type: RenderableContent["type"] }) {
  if (type === "code")
    return <FileCode size={12} style={{ opacity: 0.45, flexShrink: 0 }} />
  if (type === "markdown")
    return <FileText size={12} style={{ opacity: 0.45, flexShrink: 0 }} />
  return <File size={12} style={{ opacity: 0.45, flexShrink: 0 }} />
}

export function PreviewPanel({ content, onClose }: PreviewPanelProps) {
  if (!content) {
    return (
      <div className="preview-panel">
        <div className="preview-head">
          <File size={12} style={{ opacity: 0.35, flexShrink: 0 }} />
          <span className="preview-name" style={{ color: "var(--color-t2)" }}>
            No preview
          </span>
          {onClose && (
            <div className="preview-head-actions">
              <button className="pane-close-btn" onClick={onClose} title="Close pane">
                <X size={12} />
              </button>
            </div>
          )}
        </div>
        <div className="preview-body preview-empty">
          <p>Preview will appear here when the agent generates output.</p>
        </div>
      </div>
    )
  }

  const renderer = detectRenderer(content)
  const { Component } = renderer

  const filename = content.filename ?? content.type

  return (
    <div className="preview-panel">
      <div className="preview-head">
        <FileIcon type={content.type} />
        <span className="preview-name">{filename}</span>
        <div className="preview-head-actions">
          {onClose && (
            <button className="pane-close-btn" onClick={onClose} title="Close pane">
              <X size={12} />
            </button>
          )}
        </div>
      </div>
      <div
        className={`preview-body${content.type === "code" ? " preview-body--code" : ""}`}
      >
        <Component content={content} />
      </div>
    </div>
  )
}
