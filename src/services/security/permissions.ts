import { useMajordomoStore } from "@/stores/majordomo"
import type { PermissionRequest } from "@/types"

const pendingResolvers = new Map<string, (granted: boolean) => void>()

/**
 * Ambient context for the current workspace/agent that is calling a tool.
 * Set by WorkspaceAgent before running the agentic loop so builtins can
 * attribute permission requests without needing explicit plumbing.
 */
let _currentRequestedBy: string | undefined

export function setPermissionContext(name: string | undefined): void {
  _currentRequestedBy = name
}

export async function requestPermission(
  type: string,
  label: string,
  details: string,
  requestedBy?: string
): Promise<boolean> {
  const id = crypto.randomUUID()
  const request: PermissionRequest = {
    id,
    type,
    label,
    details,
    requestedAt: new Date().toISOString(),
    requestedBy: requestedBy ?? _currentRequestedBy,
  }
  useMajordomoStore.getState().addPermissionRequest(request)
  return new Promise<boolean>((resolve) => {
    pendingResolvers.set(id, resolve)
  })
}

export function resolvePermission(id: string, granted: boolean): void {
  const resolve = pendingResolvers.get(id)
  if (resolve) {
    resolve(granted)
    pendingResolvers.delete(id)
    useMajordomoStore.getState().removePermissionRequest(id)
  }
}

export function resolveAllPermissions(granted: boolean): void {
  const { pendingPermissions } = useMajordomoStore.getState()
  for (const req of pendingPermissions) {
    resolvePermission(req.id, granted)
  }
}
