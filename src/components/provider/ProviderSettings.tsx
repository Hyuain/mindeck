import { useState, useEffect, useId } from "react"
import { X, Package, User, Monitor, Database, Link } from "lucide-react"
import { useProviderStore } from "@/stores/provider"
import { useUIStore } from "@/stores/ui"
import { listProviders, saveProvider, deleteProvider } from "@/services/providers/storage"
import { setApiKey, deleteApiKey } from "@/services/providers/keychain"
import { providerManager } from "@/services/providers/manager"
import { ProviderCard } from "./ProviderCard"
import type { ProviderConfig } from "@/types"
import type { HealthStatus } from "@/services/providers/types"

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
  { id: "general", label: "General", Icon: User },
  { id: "appearance", label: "Appearance", Icon: Monitor },
  { id: "storage", label: "Storage", Icon: Database },
  { id: "shortcuts", label: "Shortcuts", Icon: Link },
]

// ─── Add provider form ────────────────────────────────────────

interface AddFormState {
  presetId: string
  baseUrl: string
  apiKey: string
}

function AddProviderForm({ onAdded }: { onAdded: () => void }) {
  const baseUrlId = useId()
  const apiKeyId = useId()
  const [form, setForm] = useState<AddFormState>({
    presetId: "deepseek",
    baseUrl: PRESETS[0].baseUrl,
    apiKey: "",
  })
  const [validation, setValidation] = useState<HealthStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)

  function selectPreset(id: string) {
    const preset = PRESETS.find((p) => p.id === id)
    setForm((f) => ({
      ...f,
      presetId: id,
      baseUrl: preset?.baseUrl ?? f.baseUrl,
    }))
    setValidation(null)
  }

  async function validate() {
    setChecking(true)
    setValidation(null)
    try {
      const preset = PRESETS.find((p) => p.id === form.presetId)
      if (!preset) return
      const adapter = providerManager.fromConfig({
        id: preset.id,
        name: preset.name,
        type: preset.type,
        baseUrl: form.baseUrl,
        isConnected: false,
        priority: "p0",
      })
      const result = await adapter.healthCheck(form.apiKey)
      setValidation(result)
    } catch {
      setValidation({ status: "error", message: "Request failed" })
    } finally {
      setChecking(false)
    }
  }

  async function save() {
    if (!form.apiKey && form.presetId !== "ollama") return
    setSaving(true)
    try {
      const preset = PRESETS.find((p) => p.id === form.presetId)
      if (!preset) return
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
        <div className="fi-hint">OpenAI-compatible endpoint</div>
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

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn-solid" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save Provider"}
        </button>
      </div>
    </div>
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

            {nav !== "providers" && (
              <div style={{ color: "var(--color-t2)", fontSize: 12, marginTop: 8 }}>
                Coming soon.
              </div>
            )}
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
