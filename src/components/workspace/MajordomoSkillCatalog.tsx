import { useState } from "react"
import { Bot, RefreshCw } from "lucide-react"
import type { Skill } from "@/types"
import { useSkillsStore } from "@/stores/skills"
import { discoverGlobalSkills, loadFullSkill } from "@/services/skills/skill-discovery"

export function MajordomoSkillCatalog() {
  const {
    skills,
    activeSkillIds,
    activateMajordomoSkill,
    deactivateMajordomoSkill,
    setSkills,
  } = useSkillsStore()
  const [refreshing, setRefreshing] = useState(false)

  function toggle(skillId: string) {
    if (activeSkillIds.includes(skillId)) {
      deactivateMajordomoSkill(skillId)
    } else {
      activateMajordomoSkill(skillId)
    }
  }

  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      const indices = await discoverGlobalSkills()
      const loaded = await Promise.all(indices.map((idx) => loadFullSkill(idx).catch(() => null)))
      setSkills(loaded.filter((s): s is Skill => s !== null))
    } catch {
      // non-fatal
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="msc-root">
      <div className="msc-header">
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Bot size={11} />
          <span>Majordomo Skills</span>
          {activeSkillIds.length > 0 && (
            <span className="wsc-active-badge">{activeSkillIds.length} active</span>
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
          <div className="wsc-empty-title">No global skills</div>
          <div className="wsc-empty-body">
            Add a <code>SKILL.md</code> to <code>~/.mindeck/skills/</code> or{" "}
            <code>~/.claude/skills/</code>.
          </div>
        </div>
      ) : (
        <div className="msc-list">
          {skills.map((skill) => (
            <MajordomoSkillRow
              key={skill.id}
              skill={skill}
              active={activeSkillIds.includes(skill.id)}
              onToggle={() => toggle(skill.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface RowProps {
  skill: Skill
  active: boolean
  onToggle: () => void
}

function MajordomoSkillRow({ skill, active, onToggle }: RowProps) {
  return (
    <div className={`msc-row ${active ? "active" : ""}`}>
      <button
        className={`wsc-toggle ${active ? "on" : ""}`}
        onClick={onToggle}
        title={active ? "Deactivate" : "Activate"}
        aria-pressed={active}
      />
      <div className="msc-meta">
        <span className="wsc-card-name">{skill.name}</span>
        {skill.description && (
          <span className="wsc-card-desc">{skill.description}</span>
        )}
      </div>
    </div>
  )
}
