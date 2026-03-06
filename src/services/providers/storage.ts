import { invoke } from "@tauri-apps/api/core";
import type { ProviderConfig } from "@/types";

/** Shape stored on disk (mirrors Rust ProviderRecord). */
interface ProviderRecord {
  id: string;
  name: string;
  type: "ollama" | "openai-compatible";
  baseUrl: string;
  keychainAlias?: string;
  priority: "p0" | "p1" | "p2";
}

function toRecord(cfg: ProviderConfig): ProviderRecord {
  return {
    id: cfg.id,
    name: cfg.name,
    type: cfg.type,
    baseUrl: cfg.baseUrl,
    keychainAlias: cfg.keychainAlias,
    priority: cfg.priority,
  };
}

function fromRecord(r: ProviderRecord): ProviderConfig {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    baseUrl: r.baseUrl,
    keychainAlias: r.keychainAlias,
    priority: r.priority,
    isConnected: false, // resolved at runtime via healthCheck
  };
}

export async function listProviders(): Promise<ProviderConfig[]> {
  const records = await invoke<ProviderRecord[]>("list_providers");
  return records.map(fromRecord);
}

export async function saveProvider(config: ProviderConfig): Promise<void> {
  await invoke("save_provider", { record: toRecord(config) });
}

export async function deleteProvider(id: string): Promise<void> {
  await invoke("delete_provider", { id });
}

/** Create ~/.mindeck/ directory tree. Call once on app startup. */
export async function initAppDirs(): Promise<void> {
  await invoke("init_app_dirs");
}
