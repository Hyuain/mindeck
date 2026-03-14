import type { AgentAppManifest } from "@/types"

/** Human-readable role label for an Agent App manifest. */
export function getAppRoleLabel(app: AgentAppManifest): string {
  if (app.kind === "native") return "Native"
  if (app.kind === "system") return "System"
  const parts: string[] = []
  if (app.mcpDependencies?.length) parts.push("MCP")
  if (app.harness?.triggers?.length) parts.push("Harness")
  if (app.capabilities?.ui) parts.push("UI")
  return parts.length > 0 ? parts.join(" \u00b7 ") : "App"
}
