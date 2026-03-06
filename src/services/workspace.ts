import { invoke } from "@tauri-apps/api/core";
import type { Workspace } from "@/types";

interface WorkspaceRecord {
  id: string;
  name: string;
  icon?: string;
  createdAt: string;
  updatedAt: string;
  agentConfig: { providerId: string; modelId: string; systemPrompt?: string };
  layout: { previewPanelWidth: number; activeRendererId?: string };
  repoPath?: string;
  stateSummary?: string;
  status: string;
}

function fromRecord(r: WorkspaceRecord): Workspace {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    agentConfig: r.agentConfig,
    layout: r.layout,
    repoPath: r.repoPath,
    stateSummary: r.stateSummary,
    status: (r.status as Workspace["status"]) ?? "idle",
    lastActivity: r.updatedAt,
  };
}

function toRecord(ws: Workspace): WorkspaceRecord {
  return {
    id: ws.id,
    name: ws.name,
    icon: ws.icon,
    createdAt: ws.createdAt,
    updatedAt: ws.updatedAt,
    agentConfig: ws.agentConfig,
    layout: ws.layout,
    repoPath: ws.repoPath,
    stateSummary: ws.stateSummary,
    status: ws.status,
  };
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const records = await invoke<WorkspaceRecord[]>("list_workspaces");
  return records.map(fromRecord);
}

export async function createWorkspace(ws: Workspace): Promise<void> {
  await invoke("create_workspace", { record: toRecord(ws) });
}

export async function updateWorkspace(ws: Workspace): Promise<void> {
  await invoke("update_workspace", { record: toRecord(ws) });
}

export async function deleteWorkspace(id: string): Promise<void> {
  await invoke("delete_workspace", { id });
}

export function newWorkspace(name: string, providerId: string, modelId: string): Workspace {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    icon: "📁",
    createdAt: now,
    updatedAt: now,
    agentConfig: { providerId, modelId },
    layout: { previewPanelWidth: 0 },
    status: "idle",
  };
}
