// ─── E2E Mock: @tauri-apps/api/core ─────────────────────────
// Vite alias replaces the real Tauri core module with this mock
// when VITE_TEST_MODE=e2e. Tests configure per-command handlers
// via window.__E2E_HANDLERS__ (set in page.addInitScript).

declare global {
  interface Window {
    __E2E_HANDLERS__?: Record<string, (args: Record<string, unknown>) => unknown>
  }
}

const defaultHandlers: Record<string, (args: Record<string, unknown>) => unknown> = {
  // ── Bootstrap commands ─────────────────────────────────────
  init_app_dirs: () => null,
  list_workspaces: () => [],
  list_providers: () => [],
  list_skills: () => [],
  load_messages: () => [],
  load_app_registry: () => [],
  list_dir: () => [],

  // ── Workspace CRUD ─────────────────────────────────────────
  create_workspace: () => null,
  save_workspace: () => null,
  delete_workspace: () => null,

  // ── Provider CRUD ──────────────────────────────────────────
  save_provider: () => null,
  delete_provider: () => null,
  set_api_key: () => null,
  get_api_key: () => null,
  delete_api_key: () => null,
  probe_provider: () => ({ status: "connected", latencyMs: 42 }),
  list_models: () => [],

  // ── Skills ─────────────────────────────────────────────────
  save_skill: () => null,
  delete_skill: () => null,

  // ── Conversation ───────────────────────────────────────────
  append_message: () => null,
  clear_messages: () => null,

  // ── Files ──────────────────────────────────────────────────
  read_file: () => "",
  write_file: () => null,
  create_dir: () => null,
  delete_path: () => null,

  // ── Shell ──────────────────────────────────────────────────
  run_shell: () => ({ stdout: "", stderr: "", exitCode: 0 }),

  // ── Agent Apps ─────────────────────────────────────────────
  save_app_registry: () => null,

  // ── Observability ──────────────────────────────────────────
  append_metrics: () => null,
  append_log_batch: () => null,
  append_metric_event: () => null,

  // ── Workspace Agent lifecycle ──────────────────────────────
  load_pending_events: () => [],
  read_workspace_memory: () => "",
  append_workspace_memory: () => null,
  list_scripts: () => [],

  // ── Context injection ──────────────────────────────────────
  discover_context_rules: () => [],

  // ── Stream chat (no-op by default — tests override) ────────
  stream_chat: () => null,
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const handler = window.__E2E_HANDLERS__?.[cmd] ?? defaultHandlers[cmd]
  if (!handler) {
    console.warn(`[E2E] No handler for invoke("${cmd}")`, args)
    return null as T
  }
  return handler(args ?? {}) as T
}

export class Channel<T = unknown> {
  __TAURI_CHANNEL_MARKER__ = true
  id = Math.random()
  #callback: ((event: T) => void) | null = null

  get onmessage(): ((event: T) => void) | null {
    return this.#callback
  }

  set onmessage(fn: ((event: T) => void) | null) {
    this.#callback = fn
  }

  /** Used internally by mock handlers to push events */
  emit(event: T): void {
    this.#callback?.(event)
  }
}
