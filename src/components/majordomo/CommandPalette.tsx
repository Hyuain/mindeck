import { useEffect } from "react"
import { useUIStore } from "@/stores/ui"
import { CommandSearch } from "./CommandSearch"
import { AppMarketplace } from "./AppMarketplace"

export function CommandPalette() {
  const {
    commandPaletteOpen,
    appCatalogOpen,
    closeCommandPalette,
    closeAppCatalog,
  } = useUIStore()

  const mode = appCatalogOpen ? "catalog" : "commands"

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && commandPaletteOpen) {
        if (mode === "catalog") {
          closeAppCatalog()
        } else {
          closeCommandPalette()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [commandPaletteOpen, mode, closeCommandPalette, closeAppCatalog])

  if (!commandPaletteOpen) return null

  if (mode === "catalog") {
    return (
      <AppMarketplace
        onClose={closeCommandPalette}
        onBack={closeAppCatalog}
      />
    )
  }

  return (
    <div
      className="cmd-overlay open"
      onClick={(e) => e.target === e.currentTarget && closeCommandPalette()}
    >
      <CommandSearch onClose={closeCommandPalette} />
    </div>
  )
}
