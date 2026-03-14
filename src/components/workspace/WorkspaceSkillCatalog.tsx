import { useState } from "react"
import { RefreshCw, Sparkles } from "lucide-react"
import type { Skill } from "@/types"
import { useSkillsStore } from "@/stores/skills"
import { discoverWorkspaceSkills, loadFullSkill } from "@/services/skills/skill-discovery"
import { resolveContentRoot } from "@/services/workspace/content-root"
import { useWorkspaceStore } from "@/stores/workspace"

interface Props {
  workspaceId: string
}

export function WorkspaceSkillCatalog({ workspaceId }: Props) {
  const {
    workspaceSkills,
    workspaceActiveSkillIds,
    activateWorkspaceSkill,
    deactivateWorkspaceSkill,
    setWorkspaceSkills,
  } = useSkillsStore()
  const workspace = useWorkspaceStore((s) =>
    s.workspaces.find((w) => w.id === workspaceId)
  )

  const skills = workspaceSkills[workspaceId] ?? []
  const activeIds = new Set(workspaceActiveSkillIds[workspaceId] ?? [])
  const activeCount = activeIds.size

  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    if (!workspace || refreshing) return
    setRefreshing(true)
    try {
      const contentRoot = await resolveContentRoot(workspace)
      const indices = await discoverWorkspaceSkills(contentRoot)
      const loaded = await Promise.all(
        indices.map((idx) => loadFullSkill(idx).catch(() => null))
      )
      setWorkspaceSkills(
        workspaceId,
        loaded.filter((s): s is Skill => s !== null)
      )
    } catch {
      // non-fatal
    } finally {
      setRefreshing(false)
    }
  }

  function toggle(skillId: string) {
    if (activeIds.has(skillId)) {
      deactivateWorkspaceSkill(workspaceId, skillId)
    } else {
      activateWorkspaceSkill(workspaceId, skillId)
    }
  }

  return (
    <div className="wsc-root">
      <div className="wsc-header">
        <div className="wsc-header-left">
          <Sparkles size={11} />
          <span>Workspace Skills</span>
          {activeCount > 0 && (
            <span className="wsc-active-badge">{activeCount} active</span>
          )}
        </div>
        <button
          className={`wsc-refresh-btn ${refreshing ? "spinning" : ""}`}
          onClick={handleRefresh}
          title="Refresh discovered skills"
          disabled={refreshing}
        >
          <RefreshCw size={11} />
        </button>
      </div>

      {skills.length === 0 ? (
        <div className="wsc-empty">
          <div className="wsc-empty-title">No skills discovered</div>
          <div className="wsc-empty-body">
            Add a <code>SKILL.md</code> inside <code>.agents/</code>,{" "}
            <code>.claude/</code>, or <code>.mindeck/skills/</code>, then click refresh.
          </div>
        </div>
      ) : (
        <div className="msc-list">
          {skills.map((skill) => (
            <WorkspaceSkillRow
              key={skill.id}
              skill={skill}
              active={activeIds.has(skill.id)}
              onToggle={() => toggle(skill.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Row ────────────────────────────────────────────────────

interface RowProps {
  skill: Skill
  active: boolean
  onToggle: () => void
}

function WorkspaceSkillRow({ skill, active, onToggle }: RowProps) {
  const sourcePath =
    skill.source?.type === "skill-md" || skill.source?.type === "cursor-rule"
      ? skill.source.path
      : null

  const sourceDir = (() => {
    if (!sourcePath) return null
    const replaced = sourcePath.replace(
      /^.*?\/(\.agents|\.claude|\.mindeck|\.opencode)\/skills\/.*$/,
      "$1"
    )
    if (replaced !== sourcePath) return replaced
    return sourcePath.includes("/plugins/cache/") ? "plugin" : null
  })()

  return (
    <div className={`msc-row ac-workspace ${active ? "active" : ""}`}>
      <button
        className={`wsc-toggle ${active ? "on" : ""}`}
        onClick={onToggle}
        title={active ? "Deactivate" : "Activate"}
        aria-pressed={active}
      />
      <div className="msc-meta">
        <span className="wsc-card-name">{skill.name}</span>
        {skill.description && <span className="wsc-card-desc">{skill.description}</span>}
      </div>
      {sourceDir && (
        <span className={`wsc-source-badge src-${sourceDir}`} title={sourcePath ?? ""}>
          {sourceDir}
        </span>
      )}
    </div>
  )
}
