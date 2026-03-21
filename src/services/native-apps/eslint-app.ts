import type { AgentAppManifest } from "@/types"

export const ESLINT_APP: AgentAppManifest = {
  id: "native.eslint",
  name: "ESLint",
  kind: "native",
  version: "1.0.0",
  description: "Runs ESLint on changed TypeScript/JavaScript files and reports issues.",
  nativeComponent: "EslintRunner",
  capabilities: { acceptsTasks: false },
  runtimeCapabilities: { shell: true },
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
    triggers: [{ event: "file_written", pattern: "**/*.{ts,tsx,js,jsx}" }],
    feedbackToAgent: true,
  },
}
