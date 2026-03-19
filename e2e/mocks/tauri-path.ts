// ─── E2E Mock: @tauri-apps/api/path ─────────────────────────
// Replaces the real Tauri path module when VITE_TEST_MODE=e2e.

export async function homeDir(): Promise<string> {
  return "/mock-home"
}

export async function appDataDir(): Promise<string> {
  return "/mock-home/.mindeck"
}

export async function resolve(...paths: string[]): Promise<string> {
  return paths.join("/")
}

export async function join(...paths: string[]): Promise<string> {
  return paths.join("/")
}
