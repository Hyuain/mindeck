import { useState, useEffect, useId } from "react"
import { X, Package, User, Monitor, Database, Link, Plug, Sparkles } from "lucide-react"
import { useProviderStore } from "@/stores/provider"
import { useUIStore } from "@/stores/ui"
import { useMajordomoStore } from "@/stores/majordomo"
import { listProviders, saveProvider, deleteProvider } from "@/services/providers/storage"
import { setApiKey, deleteApiKey } from "@/services/providers/keychain"
import { probeUrl } from "@/services/providers/bridge"
import { PROVIDER_MODELS } from "@/services/providers/models"
import { ProviderCard } from "./ProviderCard"
import { MCPConnectionsView } from "./MCPConnectionsView"
import type { ProviderConfig } from "@/types"
import type { HealthStatus } from "@/services/providers/types"

// ─── Recommended models per provider ──────────────────────────

const RECOMMENDED_MODELS = PROVIDER_MODELS

// ─── Preset provider definitions ─────────────────────────────

const PRESETS = [
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: "⚡",
    baseUrl: "https://api.deepseek.com/v1",
    type: "openai-compatible" as const,
  },
  {
    id: "qwen",
    name: "Qwen / 通义",
    icon: "🔮",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    type: "openai-compatible" as const,
  },
  {
    id: "minimax",
    name: "MiniMax",
    icon: "🌊",
    baseUrl: "https://api.minimax.io/anthropic",
    type: "minimax" as const,
  },
  {
    id: "openai-compat",
    name: "OpenAI Compatible",
    icon: "🌐",
    baseUrl: "https://api.openai.com/v1",
    type: "openai-compatible" as const,
  },
]

// ─── Nav items ────────────────────────────────────────────────

const NAV = [
  { id: "providers", label: "Providers", Icon: Package },
  { id: "majordomo", label: "Majordomo", Icon: Sparkles },
  { id: "general", label: "General", Icon: User },
  { id: "appearance", label: "Appearance", Icon: Monitor },
  { id: "storage", label: "Storage", Icon: Database },
  { id: "shortcuts", label: "Shortcuts", Icon: Link },
  { id: "mcp", label: "MCP Servers", Icon: Plug },
]

// ─── Add provider form ────────────────────────────────────────

interface AddFormState {
  presetId: string
  baseUrl: string
  apiKey: string
  modelId: string
}

function AddProviderForm({ onAdded }: { onAdded: () => void }) {
  const baseUrlId = useId()
  const apiKeyId = useId()
  const modelId = useId()
  const [form, setForm] = useState<AddFormState>({
    presetId: "deepseek",
    baseUrl: PRESETS[0].baseUrl,
    apiKey: "",
    modelId: RECOMMENDED_MODELS["deepseek"]?.[0]?.id ?? "",
  })
  const [validation, setValidation] = useState<HealthStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)

  const preset = PRESETS.find((p) => p.id === form.presetId)
  const recommendedModels = RECOMMENDED_MODELS[form.presetId] ?? []

  function selectPreset(id: string) {
    const p = PRESETS.find((pr) => pr.id === id)
    const models = RECOMMENDED_MODELS[id] ?? []
    setForm((f) => ({
      ...f,
      presetId: id,
      baseUrl: p?.baseUrl ?? f.baseUrl,
      modelId: models[0]?.id ?? "",
    }))
    setValidation(null)
  }

  async function validate() {
    setChecking(true)
    setValidation(null)
    try {
      if (!preset) return
      const result = await probeUrl(preset.type, form.baseUrl, form.apiKey)
      setValidation(result)
    } catch {
      setValidation({ status: "error", message: "Request failed" })
    } finally {
      setChecking(false)
    }
  }

  async function save() {
    if (!form.apiKey && form.presetId !== "ollama") return
    if (!preset) return
    setSaving(true)
    try {
      const keychainAlias = `provider-${preset.id}`
      if (form.apiKey) {
        await setApiKey(keychainAlias, form.apiKey)
      }
      const config: ProviderConfig = {
        id: preset.id,
        name: preset.name,
        type: preset.type,
        baseUrl: form.baseUrl,
        keychainAlias,
        isConnected: validation?.status === "connected",
        priority: "p0",
        defaultModel: form.modelId || undefined,
      }
      await saveProvider(config)
      onAdded()
    } catch (err) {
      console.error("Failed to save provider:", err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="add-form">
      <div className="form-section">Add Provider</div>

      {/* Provider type grid */}
      <div className="fg">
        <label className="fl">Provider Type</label>
        <div className="prov-grid">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`p-opt${form.presetId === p.id ? " on" : ""}`}
              onClick={() => selectPreset(p.id)}
            >
              <div className="p-opt-ic">{p.icon}</div>
              <div className="p-opt-name">{p.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Base URL */}
      <div className="fg">
        <label className="fl" htmlFor={baseUrlId}>
          Base URL
        </label>
        <input
          id={baseUrlId}
          className="fi"
          type="text"
          value={form.baseUrl}
          onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
        />
        {preset?.type === "minimax" && (
          <div className="fi-hint">MiniMax Anthropic-compatible endpoint</div>
        )}
        {preset?.type === "openai-compatible" && (
          <div className="fi-hint">OpenAI-compatible endpoint</div>
        )}
      </div>

      {/* API Key */}
      <div className="fg">
        <label className="fl" htmlFor={apiKeyId}>
          API Key
        </label>
        <div className="key-row">
          <input
            id={apiKeyId}
            className="fi"
            type="password"
            placeholder="sk-…"
            value={form.apiKey}
            onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
          />
          <button
            className={`val-btn${checking ? " checking" : ""}`}
            onClick={validate}
            disabled={checking}
          >
            {checking
              ? "Checking…"
              : validation?.status === "connected"
                ? "✓ Valid"
                : "Validate"}
          </button>
        </div>
        {validation?.status === "connected" && (
          <div className="val-ok show">✓ Connected · {validation.latencyMs}ms</div>
        )}
        {validation?.status === "error" && (
          <div
            style={{
              marginTop: 4,
              fontSize: 10,
              color: "#ef4444",
              fontFamily: "var(--font-mono)",
            }}
          >
            ✗ {validation.message}
          </div>
        )}
        <div className="fi-hint">Stored in OS Keychain — never written to disk</div>
      </div>

      {/* Default model selector */}
      {recommendedModels.length > 0 && (
        <div className="fg">
          <label className="fl" htmlFor={modelId}>
            Default Model
          </label>
          <select
            id={modelId}
            className="fi"
            value={form.modelId}
            onChange={(e) => setForm((f) => ({ ...f, modelId: e.target.value }))}
          >
            {recommendedModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.contextLength != null
                  ? ` — ${(m.contextLength / 1000).toFixed(0)}k ctx`
                  : ""}
              </option>
            ))}
          </select>
          <div className="fi-hint">Recommended models for this provider</div>
        </div>
      )}
      {recommendedModels.length === 0 && form.presetId !== "ollama" && (
        <div className="fg">
          <label className="fl" htmlFor={modelId}>
            Default Model
          </label>
          <input
            id={modelId}
            className="fi"
            type="text"
            placeholder="e.g. gpt-4o"
            value={form.modelId}
            onChange={(e) => setForm((f) => ({ ...f, modelId: e.target.value }))}
          />
          <div className="fi-hint">Model ID from your provider's documentation</div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn-solid" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save Provider"}
        </button>
      </div>
    </div>
  )
}

// ─── Majordomo Settings tab ──────────────────────────────────

function MajordomoSettingsTab() {
  const { providers } = useProviderStore()
  const mjStore = useMajordomoStore()
  const selectedProvider = providers.find((p) => p.id === mjStore.selectedProviderId)
  const models = selectedProvider?.models ?? []

  return (
    <>
      <div className="s-label">Majordomo</div>
      <div className="s-sub">
        Configure the global orchestrator. Majordomo coordinates across all workspaces.
      </div>

      {/* Model selection */}
      <div className="fg" style={{ marginTop: 12 }}>
        <label className="fl">Provider</label>
        <select
          className="fi"
          value={mjStore.selectedProviderId ?? ""}
          onChange={(e) => {
            const pid = e.target.value
            const firstModel = providers.find((p) => p.id === pid)?.models?.[0]?.id ?? ""
            mjStore.setModel(pid, firstModel)
          }}
        >
          <option value="">— Select provider —</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {models.length > 0 && (
        <div className="fg" style={{ marginTop: 8 }}>
          <label className="fl">Model</label>
          <select
            className="fi"
            value={mjStore.selectedModelId ?? ""}
            onChange={(e) => mjStore.setModel(mjStore.selectedProviderId, e.target.value)}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.contextLength != null
                  ? ` — ${(m.contextLength / 1000).toFixed(0)}k ctx`
                  : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="fi-hint" style={{ marginTop: 8 }}>
        Majordomo uses this model for cross-workspace orchestration and task delegation.
      </div>
    </>
  )
}

// ─── Main ProviderSettings component ─────────────────────────

export function ProviderSettings() {
  const { settingsOpen, closeSettings } = useUIStore()
  const { providers, setProviders, removeProvider } = useProviderStore()
  const [nav, setNav] = useState("providers")

  // Load saved providers on open
  useEffect(() => {
    if (!settingsOpen) return
    listProviders()
      .then(setProviders)
      .catch((err) => console.error("Failed to load providers:", err))
  }, [settingsOpen, setProviders])

  // Ollama is always shown (local, no key)
  const ollamaEntry: ProviderConfig = {
    id: "ollama",
    name: "Ollama (Local)",
    type: "ollama",
    baseUrl: "http://localhost:11434",
    isConnected: false,
    priority: "p0",
  }
  const allProviders = [ollamaEntry, ...providers.filter((p) => p.id !== "ollama")]

  async function handleDelete(id: string) {
    try {
      const p = providers.find((pr) => pr.id === id)
      if (p?.keychainAlias) {
        await deleteApiKey(p.keychainAlias).catch(() => {})
      }
      await deleteProvider(id)
      removeProvider(id)
    } catch (err) {
      console.error("Failed to delete provider:", err)
    }
  }

  async function handleAdded() {
    const updated = await listProviders()
    setProviders(updated)
  }

  if (!settingsOpen) return null

  return (
    <div
      className="overlay open"
      onClick={(e) => e.target === e.currentTarget && closeSettings()}
    >
      <div className="sheet" style={{ width: 580 }}>
        {/* Header */}
        <div className="sheet-head">
          <div>
            <div className="sheet-title">Settings</div>
            <div className="sheet-sub">keys stored in OS Keychain · never on disk</div>
          </div>
          <button className="x-btn" onClick={closeSettings}>
            <X size={14} />
          </button>
        </div>

        {/* Body: nav + content */}
        <div className="settings-body">
          {/* Nav */}
          <nav className="s-nav" aria-label="Settings navigation">
            {NAV.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`s-item${nav === id ? " on" : ""}`}
                onClick={() => setNav(id)}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="s-content">
            {nav === "providers" && (
              <>
                <div className="s-label">API Providers</div>
                <div className="s-sub">
                  Manage model connections. Keys are stored securely in OS Keychain.
                </div>

                {allProviders.map((p) => (
                  <ProviderCard key={p.id} provider={p} onDelete={handleDelete} />
                ))}

                <AddProviderForm onAdded={handleAdded} />
              </>
            )}

            {nav !== "providers" && nav !== "mcp" && nav !== "majordomo" && (
              <div style={{ color: "var(--color-t2)", fontSize: 12, marginTop: 8 }}>
                Coming soon.
              </div>
            )}

            {nav === "majordomo" && <MajordomoSettingsTab />}

            {nav === "mcp" && <MCPConnectionsView />}
          </div>
        </div>

        {/* Footer */}
        <div className="sheet-foot">
          <button className="btn-ghost" onClick={closeSettings}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
