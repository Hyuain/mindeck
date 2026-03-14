import { describe, it, expect, beforeEach } from "vitest"
import { useUIStore } from "./ui"

describe("useUIStore", () => {
  beforeEach(() => {
    useUIStore.setState({
      theme: "dark",
      settingsOpen: false,
      commandPaletteOpen: false,
      appCatalogOpen: false,
    })
  })

  describe("theme", () => {
    it("sets theme", () => {
      useUIStore.getState().setTheme("light")
      expect(useUIStore.getState().theme).toBe("light")
    })

    it("toggles theme from dark to light", () => {
      useUIStore.getState().toggleTheme()
      expect(useUIStore.getState().theme).toBe("light")
    })

    it("toggles theme from light to dark", () => {
      useUIStore.setState({ theme: "light" })
      useUIStore.getState().toggleTheme()
      expect(useUIStore.getState().theme).toBe("dark")
    })
  })

  describe("settings", () => {
    it("opens settings", () => {
      useUIStore.getState().openSettings()
      expect(useUIStore.getState().settingsOpen).toBe(true)
    })

    it("closes settings", () => {
      useUIStore.getState().openSettings()
      useUIStore.getState().closeSettings()
      expect(useUIStore.getState().settingsOpen).toBe(false)
    })
  })

  describe("command palette", () => {
    it("opens command palette", () => {
      useUIStore.getState().openCommandPalette()
      expect(useUIStore.getState().commandPaletteOpen).toBe(true)
    })

    it("closes command palette and app catalog together", () => {
      useUIStore.getState().openAppCatalog()
      useUIStore.getState().closeCommandPalette()
      expect(useUIStore.getState().commandPaletteOpen).toBe(false)
      expect(useUIStore.getState().appCatalogOpen).toBe(false)
    })
  })

  describe("app catalog", () => {
    it("opens app catalog (also opens command palette)", () => {
      useUIStore.getState().openAppCatalog()
      expect(useUIStore.getState().appCatalogOpen).toBe(true)
      expect(useUIStore.getState().commandPaletteOpen).toBe(true)
    })

    it("closes app catalog without closing command palette", () => {
      useUIStore.getState().openAppCatalog()
      useUIStore.getState().closeAppCatalog()
      expect(useUIStore.getState().appCatalogOpen).toBe(false)
      // commandPaletteOpen stays true per current implementation
      expect(useUIStore.getState().commandPaletteOpen).toBe(true)
    })
  })
})
