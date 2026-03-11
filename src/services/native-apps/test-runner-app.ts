import type { AgentAppManifest } from "@/types"

export const TEST_RUNNER_APP: AgentAppManifest = {
  id: "native.test-runner",
  name: "TestRunner",
  kind: "native",
  version: "1.0.0",
  description: "Runs the project test suite after task completion and reports failures.",
  nativeComponent: "TestRunner",
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
    triggers: [{ event: "task_completed" }],
    feedbackToAgent: true,
  },
}
