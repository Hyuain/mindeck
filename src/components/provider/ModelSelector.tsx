import { useState, useRef } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, Circle } from "lucide-react"
import type { ProviderConfig, Model } from "@/types"

interface ModelSelectorProps {
  providers: ProviderConfig[]
  selectedProviderId: string
  selectedModelId: string
  onChange: (providerId: string, modelId: string) => void
}

export function ModelSelector({
  providers,
  selectedProviderId,
  selectedModelId,
  onChange,
}: ModelSelectorProps) {
  const [dropdownPos, setDropdownPos] = useState<{
    top: number
    left: number
    width: number
  } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const open = dropdownPos !== null

  const activeProvider = providers.find((p) => p.id === selectedProviderId)
  const activeModel = activeProvider?.models?.find((m) => m.id === selectedModelId)

  const label = activeProvider
    ? `${activeProvider.name} · ${activeModel?.name ?? selectedModelId}`
    : "Select model"

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
      <button
        ref={btnRef}
        className="model-sel"
        onClick={() => {
          if (open) {
            setDropdownPos(null)
          } else if (btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect()
            setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Circle
          size={7}
          fill="currentColor"
          style={{ color: "#3b82f6", flexShrink: 0 }}
        />
        <span className="model-lbl">{label}</span>
        <ChevronDown size={11} style={{ color: "var(--color-t2)", marginLeft: 1 }} />
      </button>

      {open &&
        createPortal(
          <>
            {/* backdrop */}
            <div
              style={{ position: "fixed", inset: 0, zIndex: 9999 }}
              onClick={() => setDropdownPos(null)}
            />
            <div
              className="model-dropdown"
              role="listbox"
              style={{
                position: "fixed",
                top: dropdownPos.top,
                left: dropdownPos.left,
                minWidth: Math.max(dropdownPos.width, 220),
                zIndex: 10000,
              }}
            >
              {providers.map((provider) => (
                <div key={provider.id}>
                  <div className="model-group-label">{provider.name}</div>
                  {(provider.models ?? []).map((model: Model) => (
                    <button
                      key={model.id}
                      role="option"
                      aria-selected={
                        provider.id === selectedProviderId && model.id === selectedModelId
                      }
                      className={`model-option ${
                        provider.id === selectedProviderId && model.id === selectedModelId
                          ? "on"
                          : ""
                      }`}
                      onClick={() => {
                        onChange(provider.id, model.id)
                        setDropdownPos(null)
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
          </>,
          document.body
        )}
    </div>
  )
}
