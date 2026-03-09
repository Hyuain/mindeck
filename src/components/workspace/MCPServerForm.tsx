import { useState } from "react"
import { X } from "lucide-react"
import type { MCPDependency } from "@/types"

interface MCPServerFormProps {
  /** If provided, the form is in edit mode pre-filled with this dep */
  initial?: MCPDependency
  onSave: (dep: MCPDependency) => void
  onCancel: () => void
}

interface EnvEntry {
  key: string
  value: string
}

function parseEnvEntries(env: Record<string, string> | undefined): EnvEntry[] {
  if (!env) return []
  return Object.entries(env).map(([key, value]) => ({ key, value }))
}

function entriesToRecord(entries: EnvEntry[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { key, value } of entries) {
    if (key.trim()) out[key.trim()] = value
  }
  return out
}

export function MCPServerForm({ initial, onSave, onCancel }: MCPServerFormProps) {
  const isEdit = initial !== undefined

  const [name, setName] = useState(initial?.name ?? "")
  const [transport, setTransport] = useState<"stdio" | "streamable-http">(
    initial?.transport ?? "stdio"
  )
  const [command, setCommand] = useState(initial?.command ?? "")
  const [argsRaw, setArgsRaw] = useState((initial?.args ?? []).join(", "))
  const [url, setUrl] = useState(initial?.url ?? "")
  const [toolExposure, setToolExposure] = useState<"direct" | "namespaced">(
    initial?.toolExposure ?? "namespaced"
  )
  const [envEntries, setEnvEntries] = useState<EnvEntry[]>(parseEnvEntries(initial?.env))
  const [nameError, setNameError] = useState("")

  function addEnvRow() {
    setEnvEntries((prev) => [...prev, { key: "", value: "" }])
  }

  function removeEnvRow(i: number) {
    setEnvEntries((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateEnvRow(i: number, field: "key" | "value", val: string) {
    setEnvEntries((prev) =>
      prev.map((entry, idx) => (idx === i ? { ...entry, [field]: val } : entry))
    )
  }

  function handleSave() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setNameError("Name is required")
      return
    }
    setNameError("")

    const args = argsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

    const dep: MCPDependency = {
      name: trimmedName,
      transport,
      toolExposure,
      ...(transport === "stdio"
        ? { command: command.trim(), args, env: entriesToRecord(envEntries) }
        : { url: url.trim(), env: entriesToRecord(envEntries) }),
    }
    onSave(dep)
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-panel mcp-form-panel">
        <div className="modal-header">
          <span className="modal-title">{isEdit ? "Edit MCP Server" : "Add MCP Server"}</span>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">
            <X size={14} />
          </button>
        </div>

        <div className="mcp-form-body">
          {/* Name */}
          <label className="mcp-form-field">
            <span className="mcp-form-label">Name *</span>
            <input
              className={`mcp-form-input${nameError ? " mcp-form-input--error" : ""}`}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. web-search"
              disabled={isEdit}
            />
            {nameError && <span className="mcp-form-error">{nameError}</span>}
          </label>

          {/* Transport */}
          <label className="mcp-form-field">
            <span className="mcp-form-label">Transport</span>
            <select
              className="mcp-form-select"
              value={transport}
              onChange={(e) => setTransport(e.target.value as "stdio" | "streamable-http")}
            >
              <option value="stdio">stdio</option>
              <option value="streamable-http">streamable-http</option>
            </select>
          </label>

          {/* stdio fields */}
          {transport === "stdio" && (
            <>
              <label className="mcp-form-field">
                <span className="mcp-form-label">Command</span>
                <input
                  className="mcp-form-input"
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="e.g. npx @modelcontextprotocol/server-filesystem"
                />
              </label>
              <label className="mcp-form-field">
                <span className="mcp-form-label">Args (comma-separated)</span>
                <input
                  className="mcp-form-input"
                  type="text"
                  value={argsRaw}
                  onChange={(e) => setArgsRaw(e.target.value)}
                  placeholder="e.g. --scope, workspace"
                />
              </label>
            </>
          )}

          {/* HTTP URL */}
          {transport === "streamable-http" && (
            <label className="mcp-form-field">
              <span className="mcp-form-label">URL</span>
              <input
                className="mcp-form-input"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
              />
            </label>
          )}

          {/* Tool Exposure */}
          <label className="mcp-form-field">
            <span className="mcp-form-label">Tool Exposure</span>
            <select
              className="mcp-form-select"
              value={toolExposure}
              onChange={(e) => setToolExposure(e.target.value as "direct" | "namespaced")}
            >
              <option value="namespaced">namespaced (name::tool)</option>
              <option value="direct">direct (flat name)</option>
            </select>
          </label>

          {/* Env vars */}
          <div className="mcp-form-field">
            <div className="mcp-form-env-header">
              <span className="mcp-form-label">Environment Variables</span>
              <button className="mcp-form-add-env-btn" onClick={addEnvRow} type="button">
                + Add
              </button>
            </div>
            {envEntries.length > 0 && (
              <div className="mcp-form-env-rows">
                {envEntries.map((entry, i) => (
                  <div key={i} className="mcp-form-env-row">
                    <input
                      className="mcp-form-input mcp-form-env-key"
                      placeholder="KEY"
                      value={entry.key}
                      onChange={(e) => updateEnvRow(i, "key", e.target.value)}
                    />
                    <input
                      className="mcp-form-input mcp-form-env-val"
                      placeholder="value"
                      value={entry.value}
                      onChange={(e) => updateEnvRow(i, "value", e.target.value)}
                    />
                    <button
                      className="icon-btn"
                      onClick={() => removeEnvRow(i)}
                      type="button"
                      aria-label="Remove env var"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mcp-form-footer">
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            {isEdit ? "Save Changes" : "Add Server"}
          </button>
        </div>
      </div>
    </div>
  )
}
