import { useState, useRef, type KeyboardEvent } from "react"
import { ChevronDown, Eraser, SendHorizontal } from "lucide-react"
import { useProviderStore } from "@/stores/provider"
import { useSkillsStore } from "@/stores/skills"
import { useChatStore } from "@/stores/chat"
import { MAJORDOMO_WS_ID, clearMajordomoMessages } from "@/services/conversation"
import { SkillChips } from "@/components/ui/SkillChips"
import { SlashCommandDropdown } from "@/components/ui/SlashCommandDropdown"
import { useSlashCommand } from "@/hooks/useSlashCommand"
import type { Model, Message } from "@/types"

interface MajordomoInputProps {
  isStreaming: boolean
  messages: Message[]
  selectedProviderId: string | null
  selectedModelId: string | null
  setModel: (providerId: string, modelId: string) => void
  onSend: (content: string, skillIds: string[]) => void
}

export function MajordomoInput({
  isStreaming,
  messages,
  selectedProviderId,
  selectedModelId,
  setModel,
  onSend,
}: MajordomoInputProps) {
  const { providers } = useProviderStore()
  const { skills } = useSkillsStore()

  const [input, setInput] = useState("")
  const [ephemeralSkills, setEphemeralSkills] = useState<(typeof skills)[number][]>([])
  const [confirmClear, setConfirmClear] = useState(false)

  const activeProvider = providers.find((p) => p.id === selectedProviderId)
  const activeModel = activeProvider?.models?.find((m: Model) => m.id === selectedModelId)
  const modelLabel = activeModel?.name ?? selectedModelId ?? "No model"

  const modelWrapRef = useRef<HTMLDivElement>(null)
  const mjInputRef = useRef<HTMLTextAreaElement>(null)
  const [modelOpen, setModelOpen] = useState(false)
  const [modelDropdownPos, setModelDropdownPos] = useState<{
    top: number
    left: number
  } | null>(null)

  const {
    state: slashState,
    onInputChange,
    handleKeyDown: slashKeyDown,
    selectSkill,
  } = useSlashCommand(skills)

  async function handleSend() {
    const content = input.trim()
    if ((!content && ephemeralSkills.length === 0) || isStreaming) return
    setInput("")
    const ids = ephemeralSkills.map((s) => s.id)
    setEphemeralSkills([])
    onSend(content, ids)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (slashState.query !== null && slashState.matches.length > 0) {
      if (e.key === "Enter" || e.key === "Tab") {
        const skill = slashState.matches[slashState.selectedIndex]
        if (skill) {
          e.preventDefault()
          selectSkill(skill, () => {
            setEphemeralSkills((prev) =>
              prev.some((s) => s.id === skill.id) ? prev : [...prev, skill]
            )
          })
          setInput("")
          return
        }
      }
      if (slashKeyDown(e)) return
    }
    // Backspace on empty input removes the last ephemeral skill chip
    if (e.key === "Backspace" && input === "" && ephemeralSkills.length > 0) {
      e.preventDefault()
      setEphemeralSkills((prev) => prev.slice(0, -1))
      return
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function executeClearContext() {
    setConfirmClear(false)
    useChatStore.getState().clearMessages(MAJORDOMO_WS_ID)
    clearMajordomoMessages().catch(console.warn)
  }

  return (
    <>
      {/* Header row: model chip + clear */}
      <div className="mj-head">
        <div className="mj-head-row">
          <div className="mj-icon">✦</div>
          <span className="mj-title">Majordomo</span>

          {/* Model selector */}
          <div className="mj-model-wrap" ref={modelWrapRef}>
            <button
              className="mj-model-chip"
              onClick={() => {
                if (modelOpen) {
                  setModelOpen(false)
                  return
                }
                const rect = modelWrapRef.current?.getBoundingClientRect()
                if (rect) setModelDropdownPos({ top: rect.bottom + 4, left: rect.left })
                setModelOpen(true)
              }}
              title={modelLabel}
            >
              <span className="mj-model-name">{modelLabel}</span>
              <ChevronDown size={9} style={{ flexShrink: 0 }} />
            </button>
            {modelOpen && modelDropdownPos && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 9 }}
                  onClick={() => setModelOpen(false)}
                />
                <div
                  className="model-dropdown"
                  style={{
                    position: "fixed",
                    top: modelDropdownPos.top,
                    left: modelDropdownPos.left,
                    right: "auto",
                  }}
                  role="listbox"
                >
                  {providers.map((provider) => (
                    <div key={provider.id}>
                      <div className="model-group-label">{provider.name}</div>
                      {(provider.models ?? []).map((model: Model) => (
                        <button
                          key={model.id}
                          role="option"
                          aria-selected={
                            provider.id === selectedProviderId &&
                            model.id === selectedModelId
                          }
                          className={`model-option ${
                            provider.id === selectedProviderId &&
                            model.id === selectedModelId
                              ? "on"
                              : ""
                          }`}
                          onClick={() => {
                            setModel(provider.id, model.id)
                            setModelOpen(false)
                          }}
                        >
                          {model.name}
                        </button>
                      ))}
                      {(provider.models ?? []).length === 0 && (
                        <div className="model-option-empty">No models loaded</div>
                      )}
                    </div>
                  ))}
                  {providers.length === 0 && (
                    <div className="model-option-empty">No providers configured</div>
                  )}
                </div>
              </>
            )}
          </div>

          <button
            className="mj-clear-btn"
            onClick={() => setConfirmClear(true)}
            title="Clear conversation history"
            disabled={isStreaming || messages.length === 0}
          >
            <Eraser size={10} />
          </button>
        </div>
      </div>

      {/* Input */}
      <div className="mj-foot">
        <div className="mj-input-box">
          {slashState.query !== null && slashState.matches.length > 0 && (
            <SlashCommandDropdown
              skills={slashState.matches}
              selectedIndex={slashState.selectedIndex}
              onSelect={(skill) => {
                selectSkill(skill, () => {
                  setEphemeralSkills((prev) =>
                    prev.some((s) => s.id === skill.id) ? prev : [...prev, skill]
                  )
                })
                setInput("")
                mjInputRef.current?.focus()
              }}
              anchorRef={mjInputRef}
            />
          )}
          {ephemeralSkills.length > 0 && (
            <div className="input-chips">
              <SkillChips
                skills={ephemeralSkills}
                onRemove={(id) =>
                  setEphemeralSkills((prev) => prev.filter((s) => s.id !== id))
                }
                variant="mj"
              />
            </div>
          )}
          <textarea
            ref={mjInputRef}
            className="mj-ta"
            placeholder={
              ephemeralSkills.length > 0
                ? "Add a message…"
                : "Ask anything, across all workspaces…"
            }
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              onInputChange(e.target.value)
            }}
            onKeyDown={onKeyDown}
            disabled={isStreaming}
          />
          <div className="mj-bar-row">
            <button className="mj-send" onClick={handleSend} disabled={isStreaming}>
              <SendHorizontal size={11} />
              Ask
            </button>
          </div>
        </div>
      </div>

      {/* Clear confirm dialog */}
      {confirmClear && (
        <div className="mj-confirm-overlay" onClick={() => setConfirmClear(false)}>
          <div className="mj-confirm" onClick={(e) => e.stopPropagation()}>
            <p className="mj-confirm-msg">Clear Majordomo's conversation history?</p>
            <div className="mj-confirm-actions">
              <button
                className="mj-confirm-cancel"
                onClick={() => setConfirmClear(false)}
              >
                Cancel
              </button>
              <button className="mj-confirm-delete" onClick={executeClearContext}>
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
