import { describe, it, expect, vi, beforeEach } from "vitest"
import { AgentAppRuntime } from "./runtime"
import type { AgentApp, AgentAppManifest } from "@/types"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))

function makeManifest(
  overrides: Partial<AgentAppManifest> = {}
): AgentAppManifest {
  return {
    id: "test.app",
    name: "Test App",
    version: "1.0.0",
    description: "test",
    kind: "native",
    capabilities: {},
    runtimeCapabilities: { channel: true },
    toolExposure: "isolated",
    permissions: { filesystem: "none", network: "none", shell: false },
    lifecycle: { startup: "eager", persistence: "session" },
    ...overrides,
  }
}

function makeApp(overrides: Partial<AgentApp> = {}): AgentApp {
  const manifest = overrides.manifest ?? makeManifest()
  return {
    manifest,
    activate: vi.fn().mockResolvedValue(undefined),
    deactivate: vi.fn().mockResolvedValue(undefined),
    handleDispatch: vi.fn().mockResolvedValue({ result: "ok" }),
    ...overrides,
  }
}

const defaultConfig = {
  providerId: "p1",
  providerType: "openai-compatible",
  modelId: "m1",
  workspaceRoot: "/tmp",
}

describe("AgentAppRuntime", () => {
  let runtime: AgentAppRuntime

  beforeEach(() => {
    runtime = new AgentAppRuntime()
  })

  it("registers and activates an eager app on start", async () => {
    const manifest = makeManifest()
    const app = makeApp({ manifest })
    runtime.registerApp(manifest, app)

    await runtime.start("ws-1", [manifest], defaultConfig)

    expect(app.activate).toHaveBeenCalledTimes(1)
    expect(runtime.getAppHealth("test.app")?.status).toBe("active")
  })

  it("lazy apps stay inactive until first dispatch", async () => {
    const manifest = makeManifest({
      id: "lazy.app",
      lifecycle: { startup: "lazy", persistence: "session" },
    })
    const app = makeApp({ manifest })
    runtime.registerApp(manifest, app)

    await runtime.start("ws-1", [manifest], defaultConfig)

    expect(app.activate).not.toHaveBeenCalled()
    expect(runtime.getAppHealth("lazy.app")?.status).toBe("inactive")
  })

  it("sets status to error when activate throws", async () => {
    const manifest = makeManifest({ id: "fail.app" })
    const app = makeApp({
      manifest,
      activate: vi.fn().mockRejectedValue(new Error("boom")),
    })
    runtime.registerApp(manifest, app)

    await runtime.start("ws-1", [manifest], defaultConfig)

    expect(runtime.getAppHealth("fail.app")?.status).toBe("error")
    expect(runtime.getAppHealth("fail.app")?.errorCount).toBe(1)
  })

  it("dispatch returns result from handleDispatch", async () => {
    const manifest = makeManifest()
    const app = makeApp({
      manifest,
      handleDispatch: vi.fn().mockResolvedValue({ answer: 42 }),
    })
    runtime.registerApp(manifest, app)

    await runtime.start("ws-1", [manifest], defaultConfig)
    const result = await runtime.dispatch("test.app", { q: "test" })

    expect(result).toEqual({ answer: 42 })
    expect(runtime.getAppHealth("test.app")?.totalDispatches).toBe(1)
    expect(runtime.getAppHealth("test.app")?.lastDispatch?.success).toBe(true)
  })

  it("dispatch lazy-activates inactive apps", async () => {
    const manifest = makeManifest({
      id: "lazy.app",
      lifecycle: { startup: "lazy", persistence: "session" },
    })
    const app = makeApp({ manifest })
    runtime.registerApp(manifest, app)

    await runtime.start("ws-1", [manifest], defaultConfig)
    await runtime.dispatch("lazy.app", { task: "go" })

    expect(app.activate).toHaveBeenCalledTimes(1)
    expect(runtime.getAppHealth("lazy.app")?.status).toBe("active")
  })

  it("dispatch throws when app is in error state", async () => {
    const manifest = makeManifest({ id: "err.app" })
    const app = makeApp({
      manifest,
      activate: vi.fn().mockRejectedValue(new Error("fail")),
    })
    runtime.registerApp(manifest, app)

    await runtime.start("ws-1", [manifest], defaultConfig)

    await expect(runtime.dispatch("err.app", {})).rejects.toThrow("error state")
  })

  it("trigger calls handleTrigger", async () => {
    const manifest = makeManifest()
    const handleTrigger = vi.fn().mockResolvedValue(undefined)
    const app = makeApp({ manifest, handleTrigger })
    runtime.registerApp(manifest, app)

    await runtime.start("ws-1", [manifest], defaultConfig)

    const trigger = { event: "file_written" as const, pattern: "**/*.ts" }
    await runtime.trigger("test.app", trigger, { filePath: "/tmp/a.ts" })

    expect(handleTrigger).toHaveBeenCalledWith(trigger, { filePath: "/tmp/a.ts" })
  })

  it("stop calls deactivate on all active apps", async () => {
    const manifest = makeManifest()
    const app = makeApp({ manifest })
    runtime.registerApp(manifest, app)

    await runtime.start("ws-1", [manifest], defaultConfig)
    await runtime.stop()

    expect(app.deactivate).toHaveBeenCalledTimes(1)
  })

  it("getAgentChannel returns channel for registered app", async () => {
    const manifest = makeManifest()
    const app = makeApp({ manifest })
    runtime.registerApp(manifest, app)

    await runtime.start("ws-1", [manifest], defaultConfig)

    const channel = runtime.getAgentChannel("test.app")
    expect(channel).toBeDefined()
    expect(channel!.send).toBeTypeOf("function")
  })
})
