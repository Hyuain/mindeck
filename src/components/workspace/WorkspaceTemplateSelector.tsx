/**
 * E4.2 — WorkspaceTemplateSelector
 *
 * Shows 4 template cards (Blank, React, Python, Rust) in a grid.
 * The parent passes `selected` and `onSelect` to control the selection.
 */
import type { WorkspaceTemplate } from "@/types"
import { WORKSPACE_TEMPLATES } from "@/services/templates/workspace-templates"

interface Props {
  selected: string
  onSelect: (templateId: string) => void
}

export function WorkspaceTemplateSelector({ selected, onSelect }: Props) {
  return (
    <div className="ws-template-grid">
      {WORKSPACE_TEMPLATES.map((tpl) => (
        <button
          key={tpl.id}
          type="button"
          className={`ws-template-card${selected === tpl.id ? " selected" : ""}`}
          onClick={() => onSelect(tpl.id)}
        >
          <span className="ws-template-icon">{tpl.icon}</span>
          <span className="ws-template-name">{tpl.name}</span>
          <span className="ws-template-desc">{tpl.description}</span>
        </button>
      ))}
    </div>
  )
}

export type { WorkspaceTemplate }
