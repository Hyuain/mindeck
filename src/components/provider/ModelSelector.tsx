import { useState } from "react"
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
  const [open, setOpen] = useState(false)

  const activeProvider = providers.find((p) => p.id === selectedProviderId)
  const activeModel = activeProvider?.models?.find((m) => m.id === selectedModelId)

  const label = activeProvider
    ? `${activeProvider.name} · ${activeModel?.name ?? selectedModelId}`
    : "Select model"

  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0, overflow: "hidden" }}>
      <button
        className="model-sel"
        onClick={() => setOpen((v) => !v)}
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

      {open && (
        <>
          {/* backdrop */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 9 }}
            onClick={() => setOpen(false)}
          />
          <div className="model-dropdown" role="listbox">
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
                      setOpen(false)
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
  )
}
