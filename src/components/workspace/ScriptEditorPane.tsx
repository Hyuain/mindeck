/**
 * E4.8 — Script Editor Pane
 *
 * A pane for browsing and editing user-written Agent App scripts at
 * ~/.mindeck/scripts/. Provides a file list sidebar, textarea editor,
 * console output strip, and Save/New/Delete actions.
 */
import { useState, useEffect, useRef, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Plus, Save, Trash2 } from "lucide-react"
import { modal } from "@/components/ui/modal"
import { createLogger } from "@/services/logger"
import { homeDir } from "@tauri-apps/api/path"

const log = createLogger("ScriptEditorPane")

const SCRIPT_TEMPLATE = `// name: My Script
// description: Describe what this script does.

export async function activate(ctx) {
  ctx.log("Script activated for workspace: " + ctx.workspaceId)

  // Example: run ESLint when a TypeScript file is written
  // ctx.onFileWritten("**/*.{ts,tsx}", async (file) => {
  //   const result = await ctx.executeTool("bash_exec", { command: \`eslint \${file}\` })
  //   ctx.log("Linted: " + file)
  // })
}
`

export function ScriptEditorPane() {
  const [scripts, setScripts] = useState<string[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [content, setContent] = useState("")
  const [dirty, setDirty] = useState(false)
  const [consoleLogs, setConsoleLogs] = useState<string[]>([])
  const consoleRef = useRef<HTMLDivElement>(null)

  const addLog = useCallback((msg: string) => {
    setConsoleLogs((prev) => [...prev.slice(-99), msg])
  }, [])

  const loadScripts = useCallback(async () => {
    try {
      const paths = await invoke<string[]>("list_scripts")
      setScripts(paths)
    } catch (err) {
      log.warn("Failed to list scripts", err)
    }
  }, [])

  useEffect(() => {
    loadScripts()
  }, [loadScripts])

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [consoleLogs])

  async function handleSelectScript(path: string) {
    if (dirty && selectedPath) {
      const confirmed = window.confirm("Discard unsaved changes?")
      if (!confirmed) return
    }
    setSelectedPath(path)
    setDirty(false)
    try {
      const filename = path.split("/").pop() ?? path
      const text = await invoke<string>("read_script", { filename })
      setContent(text)
    } catch (err) {
      log.warn("Failed to read script", err)
      setContent("")
    }
  }

  async function handleSave() {
    if (!selectedPath) return
    try {
      const filename = selectedPath.split("/").pop() ?? selectedPath
      await invoke("write_script", { filename, content })
      setDirty(false)
      addLog(`Saved: ${selectedPath.split("/").pop()}`)
    } catch (err) {
      addLog(`Error saving: ${err}`)
    }
  }

  async function handleNew() {
    try {
      const home = await homeDir()
      const name = `script-${Date.now()}.ts`
      const path = `${home}/.mindeck/scripts/${name}`
      await invoke("write_script", { filename: name, content: SCRIPT_TEMPLATE })
      await loadScripts()
      setSelectedPath(path)
      setContent(SCRIPT_TEMPLATE)
      setDirty(false)
      addLog(`Created: ${name}`)
    } catch (err) {
      addLog(`Error creating script: ${err}`)
    }
  }

  function handleDelete() {
    if (!selectedPath) return
    const fileName = selectedPath.split("/").pop() ?? selectedPath
    modal.confirm({
      message: `Delete ${fileName}?`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        try {
          await invoke("delete_script", { filename: fileName })
          addLog(`Deleted: ${fileName}`)
          setSelectedPath(null)
          setContent("")
          setDirty(false)
          await loadScripts()
        } catch (err) {
          addLog(`Error deleting: ${err}`)
        }
      },
    })
  }

  return (
    <div className="script-editor-pane">
      <div className="script-editor-header">
        <span className="script-editor-title">Scripts</span>
        <div className="script-editor-actions">
          <button className="script-btn" onClick={handleNew} title="New script">
            <Plus size={12} />
          </button>
          {selectedPath && (
            <>
              <button
                className={`script-btn${dirty ? " primary" : ""}`}
                onClick={handleSave}
                title="Save"
              >
                <Save size={12} />
              </button>
              <button className="script-btn" onClick={handleDelete} title="Delete">
                <Trash2 size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="script-editor-body">
        {/* File sidebar */}
        <div className="script-file-sidebar">
          {scripts.length === 0 ? (
            <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--color-t2)" }}>
              No scripts yet
            </div>
          ) : (
            scripts.map((path) => {
              const name = path.split("/").pop() ?? path
              return (
                <button
                  key={path}
                  className={`script-file-item${path === selectedPath ? " active" : ""}`}
                  onClick={() => handleSelectScript(path)}
                  title={path}
                >
                  {name}
                </button>
              )
            })
          )}
        </div>

        {/* Editor main */}
        <div className="script-editor-main">
          {selectedPath ? (
            <textarea
              className="script-editor-cm"
              value={content}
              onChange={(e) => {
                setContent(e.target.value)
                setDirty(true)
              }}
              spellCheck={false}
              style={{
                width: "100%",
                height: "100%",
                background: "var(--color-bg-0)",
                color: "var(--color-t0)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                border: "none",
                outline: "none",
                padding: "12px",
                resize: "none",
                lineHeight: 1.6,
              }}
            />
          ) : (
            <div className="script-no-file">Select or create a script</div>
          )}

          {/* Console */}
          <div className="script-editor-console" ref={consoleRef}>
            {consoleLogs.map((line, i) => (
              <div key={i} className="script-console-line">
                {line}
              </div>
            ))}
            {consoleLogs.length === 0 && (
              <span style={{ color: "var(--color-t2)", fontSize: 10 }}>
                Script console output appears here
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
