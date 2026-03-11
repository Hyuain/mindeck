import type { AgentAppManifest } from "@/types"

export const TSC_APP: AgentAppManifest = {
  id: "native.tsc",
  name: "TypeChecker",
  kind: "native",
  version: "1.0.0",
  description: "Runs TypeScript type-checking and reports type errors.",
  nativeComponent: "TscRunner",
  capabilities: { acceptsTasks: false },
  toolExposure: "isolated",
  permissions: {
    filesystem: "workspace-only",
    network: "none",
    shell: true,
  },
  lifecycle: {
    startup: "on-trigger",
    persistence: "session",
  },
  harness: {
    triggers: [{ event: "file_written", pattern: "**/*.{ts,tsx}" }],
    feedbackToAgent: true,
  },
}
