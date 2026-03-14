import { useState, useRef } from "react"
import { ChevronDown, Circle } from "lucide-react"
import { Popover } from "@/components/ui/Popover"
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
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const open = anchorRect !== null

  const activeProvider = providers.find((p) => p.id === selectedProviderId)
  const activeModel = activeProvider?.models?.find((m) => m.id === selectedModelId)

  const label = activeProvider
    ? `${activeProvider.name} · ${activeModel?.name ?? selectedModelId}`
    : "Select model"

  function close() {
    setAnchorRect(null)
  }

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
      <button
        ref={btnRef}
        className="model-sel"
        onClick={() => {
          if (open) {
            close()
          } else if (btnRef.current) {
            setAnchorRect(btnRef.current.getBoundingClientRect())
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

      {open && anchorRect && (
        <Popover
          anchor={anchorRect}
          onClose={close}
          className="popover-panel model-dropdown"
          widthMode="min-match"
        >
          <ModelDropdownContent
            providers={providers}
            selectedProviderId={selectedProviderId}
            selectedModelId={selectedModelId}
            onSelect={(providerId, modelId) => {
              onChange(providerId, modelId)
              close()
            }}
          />
        </Popover>
      )}
    </div>
  )
}

/* Shared model list content — reused by MajordomoPanel */

interface ModelDropdownContentProps {
  providers: ProviderConfig[]
  selectedProviderId: string
  selectedModelId: string
  onSelect: (providerId: string, modelId: string) => void
}

export function ModelDropdownContent({
  providers,
  selectedProviderId,
  selectedModelId,
  onSelect,
}: ModelDropdownContentProps) {
  return (
    <div role="listbox">
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
              onClick={() => onSelect(provider.id, model.id)}
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
  )
}
