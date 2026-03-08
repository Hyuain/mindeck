/**
 * Structured logger factory for Mindeck services.
 *
 * Writes to:
 *   1. In-memory circular buffer (last 500 entries) — getLogSnapshot()
 *   2. Console (all levels)
 *   3. ~/.mindeck/logs/mindeck.log (batched flush every 3 s or 50 lines)
 *
 * Usage:
 *   const log = createLogger("WorkspaceAgent:abc-123")
 *   log.info("Dispatch received", { target: event.targetWorkspaceId })
 *   log.error("Stream failed", err)
 */
import { invoke } from "@tauri-apps/api/core"

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface LogEntry {
  level: LogLevel
  namespace: string
  message: string
  data?: unknown
  timestamp: string
}

export interface Logger {
  debug(message: string, data?: unknown): void
  info(message: string, data?: unknown): void
  warn(message: string, data?: unknown): void
  error(message: string, data?: unknown): void
}

// Global minimum level — change to "info" or "warn" to reduce noise in prod
const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }
let globalMinLevel: LogLevel = "debug"

const BUFFER_SIZE = 500
const buffer: LogEntry[] = []

// ─── File flush queue ──────────────────────────────────────────

const fileQueue: string[] = []
const FLUSH_INTERVAL_MS = 1_000
const FLUSH_BATCH_LIMIT = 50
let flushInProgress = false
let flushIntervalId: ReturnType<typeof setInterval> | null = null

function scheduleFlush(): void {
  if (flushIntervalId !== null) return
  flushIntervalId = setInterval(() => {
    flushToFile()
  }, FLUSH_INTERVAL_MS)
}

// Flush remaining logs before the page unloads (handles HMR reloads too)
window.addEventListener("beforeunload", () => flushToFile())

function flushToFile(): void {
  if (fileQueue.length === 0 || flushInProgress) return

  flushInProgress = true
  const lines = [...fileQueue]
  const count = lines.length

  invoke("append_log_batch", { lines })
    .then(() => {
      // Only remove lines that were successfully written
      fileQueue.splice(0, count)
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(
        "[logger] append_log_batch failed — will retry on next flush cycle:",
        err
      )
    })
    .finally(() => {
      flushInProgress = false
    })
}

function write(
  level: LogLevel,
  namespace: string,
  message: string,
  data?: unknown
): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[globalMinLevel]) return

  const timestamp = new Date().toISOString()
  const entry: LogEntry = { level, namespace, message, data, timestamp }

  // Circular buffer — drop oldest when full
  if (buffer.length >= BUFFER_SIZE) {
    buffer.shift()
  }
  buffer.push(entry)

  // Console output
  const prefix = `[${level.toUpperCase()}] [${namespace}]`
  if (data !== undefined) {
    // eslint-disable-next-line no-console
    console[level](prefix, message, data)
  } else {
    // eslint-disable-next-line no-console
    console[level](prefix, message)
  }

  // File queue — format as a single log line
  const dataStr = data !== undefined ? ` ${JSON.stringify(data)}` : ""
  fileQueue.push(
    `${timestamp} [${level.toUpperCase()}] [${namespace}] ${message}${dataStr}\n`
  )

  // Ensure the periodic flush interval is running
  scheduleFlush()

  // Flush immediately if queue is large enough
  if (fileQueue.length >= FLUSH_BATCH_LIMIT) {
    flushToFile()
  }
}

/** Create a named logger for a specific service or component */
export function createLogger(namespace: string): Logger {
  return {
    debug: (message, data) => write("debug", namespace, message, data),
    info: (message, data) => write("info", namespace, message, data),
    warn: (message, data) => write("warn", namespace, message, data),
    error: (message, data) => write("error", namespace, message, data),
  }
}

/** Return a snapshot of recent log entries (up to last 500) */
export function getLogSnapshot(): readonly LogEntry[] {
  return [...buffer]
}

/** Change the global minimum log level at runtime */
export function setLogLevel(level: LogLevel): void {
  globalMinLevel = level
}

/** Force-flush any pending log lines to disk (e.g. before app close) */
export function flushLogs(): void {
  flushToFile()
}
