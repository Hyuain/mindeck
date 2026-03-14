import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createLogger, getLogSnapshot, setLogLevel } from "./logger"

describe("logger", () => {
  let consoleSpy: {
    debug: ReturnType<typeof vi.spyOn>
    info: ReturnType<typeof vi.spyOn>
    warn: ReturnType<typeof vi.spyOn>
    error: ReturnType<typeof vi.spyOn>
  }

  beforeEach(() => {
    consoleSpy = {
      debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
      info: vi.spyOn(console, "info").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    }
    // Reset to debug so all levels pass
    setLogLevel("debug")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("createLogger", () => {
    it("returns a logger with debug/info/warn/error methods", () => {
      const log = createLogger("TestService")
      expect(log.debug).toBeTypeOf("function")
      expect(log.info).toBeTypeOf("function")
      expect(log.warn).toBeTypeOf("function")
      expect(log.error).toBeTypeOf("function")
    })
  })

  describe("log output", () => {
    it("logs to console with namespace prefix", () => {
      const log = createLogger("MyService")
      log.info("Hello world")
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining("[MyService]"),
        "Hello world"
      )
    })

    it("includes data when provided", () => {
      const log = createLogger("MyService")
      const data = { key: "value" }
      log.warn("Warning", data)
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining("[MyService]"),
        "Warning",
        data
      )
    })

    it("logs at all four levels", () => {
      const log = createLogger("Test")
      log.debug("d")
      log.info("i")
      log.warn("w")
      log.error("e")
      expect(consoleSpy.debug).toHaveBeenCalledOnce()
      expect(consoleSpy.info).toHaveBeenCalledOnce()
      expect(consoleSpy.warn).toHaveBeenCalledOnce()
      expect(consoleSpy.error).toHaveBeenCalledOnce()
    })
  })

  describe("getLogSnapshot", () => {
    it("returns recent log entries", () => {
      const log = createLogger("Snap")
      log.info("test entry")
      const snapshot = getLogSnapshot()
      const found = snapshot.find((e) => e.message === "test entry")
      expect(found).toBeDefined()
      expect(found!.namespace).toBe("Snap")
      expect(found!.level).toBe("info")
    })
  })

  describe("setLogLevel", () => {
    it("filters out logs below the minimum level", () => {
      setLogLevel("warn")
      const log = createLogger("Filtered")
      log.debug("should not appear")
      log.info("should not appear")
      log.warn("should appear")
      log.error("should appear")

      expect(consoleSpy.debug).not.toHaveBeenCalled()
      expect(consoleSpy.info).not.toHaveBeenCalled()
      expect(consoleSpy.warn).toHaveBeenCalledOnce()
      expect(consoleSpy.error).toHaveBeenCalledOnce()
    })
  })
})
