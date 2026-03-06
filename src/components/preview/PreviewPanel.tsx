import { useState } from "react"
import { FileText } from "lucide-react"
import type { RenderableContent, RendererType } from "@/types"
import { detectRenderer } from "./RendererRegistry"

interface PreviewPanelProps {
  content: RenderableContent | null
}

const RENDERER_TABS: { id: RendererType; label: string }[] = [
  { id: "markdown", label: "md" },
  { id: "code", label: "code" },
  { id: "image", label: "image" },
  { id: "raw", label: "raw" },
]

export function PreviewPanel({ content }: PreviewPanelProps) {
  const [overrideType, setOverrideType] = useState<RendererType | null>(null)

  if (!content) {
    return (
      <div className="preview-panel">
        <div className="preview-head">
          <FileText size={13} style={{ opacity: 0.4 }} />
          <span className="preview-name" style={{ color: "var(--color-t2)" }}>
            No preview
          </span>
        </div>
        <div className="preview-body preview-empty">
          <p>Preview will appear here when the agent generates output.</p>
        </div>
      </div>
    )
  }

  const activeContent: RenderableContent = overrideType
    ? { ...content, type: overrideType }
    : content
  const renderer = detectRenderer(activeContent)
  const { Component } = renderer

  const filename = content.filename ?? "output"
  const activeType = overrideType ?? content.type

  return (
    <div className="preview-panel">
      <div className="preview-head">
        <span className="preview-icon">
          {content.type === "image" ? "🖼" : content.type === "code" ? "📝" : "📄"}
        </span>
        <span className="preview-name">{filename}</span>
        <span className="preview-tag">{activeType}</span>
        <div className="r-tabs">
          {RENDERER_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`r-tab${activeType === tab.id ? " on" : ""}`}
              onClick={() => setOverrideType(tab.id === content.type ? null : tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="preview-body">
        <Component content={activeContent} />
      </div>
    </div>
  )
}
