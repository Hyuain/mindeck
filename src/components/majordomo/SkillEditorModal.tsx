import { useEffect, useState } from "react"
import { X } from "lucide-react"
import type { Skill } from "@/types"
import { makeSkill } from "@/services/skills/crud"

interface Props {
  open: boolean
  skill: Skill | null // null = create mode
  onSave: (skill: Skill) => void
  onClose: () => void
}

interface FormState {
  name: string
  description: string
  systemPrompt: string
  version: string
  author: string
  license: string
  tags: string // comma-separated
  allowedTools: string // comma-separated
}

const EMPTY: FormState = {
  name: "",
  description: "",
  systemPrompt: "",
  version: "",
  author: "",
  license: "",
  tags: "",
  allowedTools: "",
}

function splitComma(s: string): string[] {
  return s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
}

export function SkillEditorModal({ open, skill, onSave, onClose }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY)

  useEffect(() => {
    if (!open) return
    if (skill) {
      setForm({
        name: skill.name,
        description: skill.description,
        systemPrompt: skill.instructions ?? skill.systemPrompt,
        version: skill.version ?? "",
        author: skill.author ?? "",
        license: skill.license ?? "",
        tags: skill.tags?.join(", ") ?? "",
        allowedTools: (skill.allowedTools ?? skill.tools ?? []).join(", "),
      })
    } else {
      setForm(EMPTY)
    }
  }, [open, skill])

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSave() {
    const name = form.name.trim()
    const systemPrompt = form.systemPrompt.trim()
    if (!name || !systemPrompt) return

    const now = new Date().toISOString()
    const tags = splitComma(form.tags)
    const allowedTools = splitComma(form.allowedTools)

    const saved: Skill = skill
      ? {
          ...skill,
          name,
          description: form.description.trim(),
          instructions: systemPrompt,
          systemPrompt,
          version: form.version.trim() || undefined,
          author: form.author.trim() || undefined,
          license: form.license.trim() || undefined,
          tags: tags.length ? tags : undefined,
          allowedTools: allowedTools.length ? allowedTools : undefined,
          updatedAt: now,
        }
      : {
          ...makeSkill(name, form.description.trim(), systemPrompt),
          version: form.version.trim() || undefined,
          author: form.author.trim() || undefined,
          license: form.license.trim() || undefined,
          tags: tags.length ? tags : undefined,
          allowedTools: allowedTools.length ? allowedTools : undefined,
        }

    onSave(saved)
  }

  const valid = form.name.trim().length > 0 && form.systemPrompt.trim().length > 0

  if (!open) return null

  return (
    <div
      className="overlay open"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="sheet skill-editor-sheet">
        <div className="sheet-head">
          <div>
            <div className="sheet-title">{skill ? "Edit skill" : "New skill"}</div>
            <div className="sheet-sub">saved to ~/.mindeck/skills/</div>
          </div>
          <button className="x-btn" onClick={onClose}>
            <X size={13} />
          </button>
        </div>

        <div className="skill-editor-body">
          {/* Row 1: Name + Version */}
          <div className="skill-editor-row">
            <div className="fg" style={{ flex: 2 }}>
              <label className="fl" htmlFor="sk-name">
                Name
              </label>
              <input
                id="sk-name"
                className="fi"
                placeholder="e.g. Code Reviewer"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                autoFocus
              />
            </div>
            <div className="fg" style={{ flex: 1 }}>
              <label className="fl" htmlFor="sk-version">
                Version{" "}
                <span style={{ textTransform: "none", opacity: 0.6 }}>(optional)</span>
              </label>
              <input
                id="sk-version"
                className="fi"
                placeholder="1.0.0"
                value={form.version}
                onChange={(e) => set("version", e.target.value)}
              />
            </div>
          </div>

          {/* Description */}
          <div className="fg">
            <label className="fl" htmlFor="sk-desc">
              Description{" "}
              <span style={{ textTransform: "none", opacity: 0.6 }}>(optional)</span>
            </label>
            <input
              id="sk-desc"
              className="fi"
              placeholder="Short description shown in the skill list"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          {/* Row 2: Author + License */}
          <div className="skill-editor-row">
            <div className="fg" style={{ flex: 1 }}>
              <label className="fl" htmlFor="sk-author">
                Author{" "}
                <span style={{ textTransform: "none", opacity: 0.6 }}>(optional)</span>
              </label>
              <input
                id="sk-author"
                className="fi"
                placeholder="Your name"
                value={form.author}
                onChange={(e) => set("author", e.target.value)}
              />
            </div>
            <div className="fg" style={{ flex: 1 }}>
              <label className="fl" htmlFor="sk-license">
                License{" "}
                <span style={{ textTransform: "none", opacity: 0.6 }}>(optional)</span>
              </label>
              <input
                id="sk-license"
                className="fi"
                placeholder="MIT"
                value={form.license}
                onChange={(e) => set("license", e.target.value)}
              />
            </div>
          </div>

          {/* Tags */}
          <div className="fg">
            <label className="fl" htmlFor="sk-tags">
              Tags{" "}
              <span style={{ textTransform: "none", opacity: 0.6 }}>
                (comma-separated, optional)
              </span>
            </label>
            <input
              id="sk-tags"
              className="fi"
              placeholder="code-review, typescript, security"
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
            />
          </div>

          {/* Allowed tools */}
          <div className="fg">
            <label className="fl" htmlFor="sk-tools">
              Allowed tools{" "}
              <span style={{ textTransform: "none", opacity: 0.6 }}>
                (comma-separated, optional — blank = all)
              </span>
            </label>
            <input
              id="sk-tools"
              className="fi"
              placeholder="read_file, bash_exec"
              value={form.allowedTools}
              onChange={(e) => set("allowedTools", e.target.value)}
            />
          </div>

          {/* Instructions */}
          <div
            className="fg"
            style={{ flex: 1, display: "flex", flexDirection: "column" }}
          >
            <label className="fl" htmlFor="sk-prompt">
              Instructions
            </label>
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
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-solid" onClick={handleSave} disabled={!valid}>
            {skill ? "Save changes" : "Create skill"}
          </button>
        </div>
      </div>
    </div>
  )
}
