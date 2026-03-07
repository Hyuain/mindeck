import { useEffect, useState } from "react"
import { X } from "lucide-react"
import type { Skill } from "@/types"
import { makeSkill } from "@/services/skills"

interface Props {
  open: boolean
  skill: Skill | null  // null = create mode
  onSave: (skill: Skill) => void
  onClose: () => void
}

const EMPTY = { name: "", description: "", systemPrompt: "" }

export function SkillEditorModal({ open, skill, onSave, onClose }: Props) {
  const [form, setForm] = useState(EMPTY)

  useEffect(() => {
    if (open) {
      setForm(
        skill
          ? { name: skill.name, description: skill.description, systemPrompt: skill.systemPrompt }
          : EMPTY,
      )
    }
  }, [open, skill])

  function set(field: keyof typeof EMPTY, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSave() {
    const name = form.name.trim()
    const systemPrompt = form.systemPrompt.trim()
    if (!name || !systemPrompt) return

    const now = new Date().toISOString()
    const saved: Skill = skill
      ? { ...skill, name, description: form.description.trim(), systemPrompt, updatedAt: now }
      : makeSkill(name, form.description.trim(), systemPrompt)

    onSave(saved)
  }

  const valid = form.name.trim().length > 0 && form.systemPrompt.trim().length > 0

  return (
    <div className={`overlay${open ? " open" : ""}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet skill-editor-sheet">
        <div className="sheet-head">
          <div>
            <div className="sheet-title">{skill ? "Edit skill" : "New skill"}</div>
            <div className="sheet-sub">skills are saved to ~/.mindeck/skills/</div>
          </div>
          <button className="x-btn" onClick={onClose}><X size={13} /></button>
        </div>

        <div className="skill-editor-body">
          <div className="fg">
            <label className="fl" htmlFor="sk-name">Name</label>
            <input
              id="sk-name"
              className="fi"
              placeholder="e.g. Code Reviewer"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              autoFocus
            />
          </div>

          <div className="fg">
            <label className="fl" htmlFor="sk-desc">Description <span style={{ textTransform: "none", opacity: 0.6 }}>(optional)</span></label>
            <input
              id="sk-desc"
              className="fi"
              placeholder="Short description shown in the skill list"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="fg" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <label className="fl" htmlFor="sk-prompt">System prompt</label>
            <textarea
              id="sk-prompt"
              className="fi skill-editor-ta"
              placeholder="You are a helpful assistant specialised in…"
              value={form.systemPrompt}
              onChange={(e) => set("systemPrompt", e.target.value)}
            />
          </div>
        </div>

        <div className="sheet-foot">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-solid" onClick={handleSave} disabled={!valid}>
            {skill ? "Save changes" : "Create skill"}
          </button>
        </div>
      </div>
    </div>
  )
}
