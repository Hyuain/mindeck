import { vi } from "vitest"

// ─── Mock Tauri core ──────────────────────────────────────────
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  Channel: vi.fn().mockImplementation(() => ({
    onmessage: null,
  })),
}))

// ─── Mock Tauri plugins ───────────────────────────────────────
vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  mkdir: vi.fn(),
  exists: vi.fn(),
  readDir: vi.fn(),
  remove: vi.fn(),
}))

vi.mock("@tauri-apps/plugin-shell", () => ({
  Command: vi.fn(),
}))
