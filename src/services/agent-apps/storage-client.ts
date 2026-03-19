import { invoke } from "@tauri-apps/api/core"
import type { StorageClient, StorageFilter } from "@/types"

/** Shape of each entry stored in the JSON file */
interface StorageEntry {
  value: unknown
  tags?: string[]
  lastIndexed?: string
  timestamp?: string
}

type StorageCache = Record<string, StorageEntry>

function storagePath(
  workspaceId: string,
  appId: string,
  scope: "workspace" | "global"
): string {
  const home = "~/.mindeck"
  if (scope === "workspace") {
    return `${home}/workspaces/${workspaceId}/apps/${appId}/store.json`
  }
  return `${home}/apps/${appId}/store.json`
}

async function loadCache(path: string): Promise<StorageCache> {
  try {
    const raw = (await invoke("read_file", { path })) as string
    return JSON.parse(raw) as StorageCache
  } catch {
    // File doesn't exist yet or is empty — start fresh
    return {}
  }
}

async function persistCache(path: string, cache: StorageCache): Promise<void> {
  const content = JSON.stringify(cache, null, 2)
  await invoke("write_file", { path, content })
}

function matchesFilter(key: string, entry: StorageEntry, filter: StorageFilter): boolean {
  if (filter.keyPrefix && !key.startsWith(filter.keyPrefix)) {
    return false
  }

  if (filter.tags && filter.tags.length > 0) {
    const entryTags = entry.tags ?? []
    const hasMatch = filter.tags.some((tag) => entryTags.includes(tag))
    if (!hasMatch) {
      return false
    }
  }

  if (filter.since) {
    const entryTime = entry.lastIndexed ?? entry.timestamp
    if (!entryTime || entryTime < filter.since) {
      return false
    }
  }

  return true
}

export function createStorageClient(
  workspaceId: string,
  appId: string,
  scope: "workspace" | "global"
): StorageClient {
  const path = storagePath(workspaceId, appId, scope)
  let cache: StorageCache | null = null

  async function ensureLoaded(): Promise<StorageCache> {
    if (cache === null) {
      cache = await loadCache(path)
    }
    return cache
  }

  const client: StorageClient = {
    async get<T>(key: string): Promise<T | null> {
      const data = await ensureLoaded()
      const entry = data[key]
      if (!entry) {
        return null
      }
      return entry.value as T
    },

    async set<T>(key: string, value: T): Promise<void> {
      const data = await ensureLoaded()
      const newEntry: StorageEntry = {
        ...data[key],
        value,
        timestamp: new Date().toISOString(),
      }
      // Immutable: create new cache object
      cache = { ...data, [key]: newEntry }
      await persistCache(path, cache)
    },

    async list(): Promise<string[]> {
      const data = await ensureLoaded()
      return Object.keys(data)
    },

    async delete(key: string): Promise<void> {
      const data = await ensureLoaded()
      // Immutable: create new object without the key
      const { [key]: _removed, ...rest } = data
      cache = rest
      await persistCache(path, cache)
    },

    async query(filter: StorageFilter): Promise<Record<string, unknown>> {
      const data = await ensureLoaded()
      const result: Record<string, unknown> = {}
      for (const [key, entry] of Object.entries(data)) {
        if (matchesFilter(key, entry, filter)) {
          result[key] = entry.value
        }
      }
      return result
    },
  }

  return client
}
