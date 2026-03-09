/**
 * E4.6 — Docker Sandbox (Layer 2)
 *
 * Manages a Docker container lifecycle for a workspace session.
 * When active, bash_exec routes commands through the container instead
 * of the host shell.
 *
 * Falls back silently to Layer 1 (host shell) if Docker is unavailable.
 */
import { invoke } from "@tauri-apps/api/core"
import { Channel } from "@tauri-apps/api/core"
import { createLogger } from "@/services/logger"
import type { ContainerSandboxConfig } from "@/types"

const log = createLogger("DockerSandbox")

type DockerChunkEvent =
  | { type: "stdout"; data: string }
  | { type: "stderr"; data: string }
  | { type: "exit"; code: number }

export interface DockerExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

export class DockerSandbox {
  private containerId: string | null = null
  private readonly config: ContainerSandboxConfig

  constructor(config: ContainerSandboxConfig) {
    this.config = config
  }

  async start(workspacePath: string): Promise<void> {
    this.containerId = await invoke<string>("docker_start", {
      image: this.config.image,
      workspacePath,
      networkMode: this.config.networkMode,
      cpus: this.config.cpus,
      memoryMb: this.config.memoryMb,
    })
    log.info("Container started", { containerId: this.containerId })
  }

  async exec(
    command: string,
    cwd?: string,
    onChunk?: (chunk: string) => void
  ): Promise<DockerExecResult> {
    if (!this.containerId) {
      throw new Error("DockerSandbox: container not started")
    }

    const channel = new Channel<DockerChunkEvent>()
    let stdout = ""
    let stderr = ""
    let exitCode = 0

    channel.onmessage = (ev) => {
      if (ev.type === "stdout") {
        stdout += ev.data + "\n"
        onChunk?.(ev.data)
      } else if (ev.type === "stderr") {
        stderr += ev.data + "\n"
      } else if (ev.type === "exit") {
        exitCode = ev.code
      }
    }

    const execPromise = invoke("docker_exec", {
      containerId: this.containerId,
      command,
      cwd: cwd ?? null,
      onEvent: channel,
    })

    // Apply per-exec timeout
    await Promise.race([
      execPromise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Docker exec timed out after ${this.config.timeoutMs}ms`)),
          this.config.timeoutMs
        )
      ),
    ])

    return { stdout, stderr, exitCode }
  }

  async stop(): Promise<void> {
    if (!this.containerId) return
    const id = this.containerId
    this.containerId = null
    try {
      await invoke("docker_stop", { containerId: id })
      log.info("Container stopped", { containerId: id })
    } catch (err) {
      log.warn("Failed to stop container", { containerId: id, err })
    }
  }

  get isRunning(): boolean {
    return this.containerId !== null
  }

  static async isAvailable(): Promise<boolean> {
    try {
      return await invoke<boolean>("check_docker")
    } catch {
      return false
    }
  }

  static defaultConfig(): ContainerSandboxConfig {
    return {
      enabled: false,
      image: "node:20-slim",
      networkMode: "none",
      cpus: 2,
      memoryMb: 2048,
      timeoutMs: 60_000,
    }
  }
}
