import { useState } from "react"
import { Trash2 } from "lucide-react"
import type { ProviderConfig } from "@/types"
import type { HealthStatus } from "@/services/providers/types"
import { providerManager } from "@/services/providers/manager"
import { useProviderStore } from "@/stores/provider"

interface ProviderCardProps {
  provider: ProviderConfig
  onDelete: (id: string) => void
}

const PROVIDER_ICONS: Record<string, string> = {
  ollama: "🐙",
  deepseek: "⚡",
  qwen: "🔮",
  minimax: "🌊",
}

export function ProviderCard({ provider, onDelete }: ProviderCardProps) {
  const { updateProvider } = useProviderStore()
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [checking, setChecking] = useState(false)

  async function checkHealth() {
    setChecking(true)
    setHealth(null)
    try {
      // Rust fetches the API key from OS Keychain — no key needed here
      const result = await providerManager.healthCheck(provider.id)
      setHealth(result)

      if (result.status === "connected") {
        const models = await providerManager.listModels(provider.id).catch(() => [])
        updateProvider(provider.id, {
          isConnected: true,
          ...(models.length > 0 ? { models } : {}),
        })
      }
    } catch {
      setHealth({ status: "error", message: "Unexpected error" })
    } finally {
      setChecking(false)
    }
  }

  const icon = PROVIDER_ICONS[provider.id] ?? "🌐"
  const isConnected = health?.status === "connected" || provider.isConnected

  return (
    <div className={`pcard${isConnected ? " live" : ""}`}>
      <div className="pcard-ic">{icon}</div>
      <div className="pcard-info">
        <div className="pcard-name">{provider.name}</div>
        <div className={`pcard-status${isConnected ? " ok" : ""}`}>
          {checking
            ? "checking…"
            : health?.status === "connected"
              ? `● connected · ${health.latencyMs}ms`
              : health?.status === "error"
                ? `○ ${health.message}`
                : "○ not checked"}
        </div>
        {provider.defaultModel && (
          <div className="pcard-model">
            model: {provider.defaultModel}
          </div>
        )}
      </div>
      <span className={`p0 ${isConnected ? "live" : "offline"}`}>{provider.priority}</span>
      <button
        className="icon-btn"
        style={{ marginLeft: 4 }}
        onClick={checkHealth}
        disabled={checking}
        title="Check connection"
      >
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </button>
      <button
        className="icon-btn"
        style={{ marginLeft: 2 }}
        onClick={() => onDelete(provider.id)}
        title="Delete provider"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}
