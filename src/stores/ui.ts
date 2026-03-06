import { create } from "zustand";
import type { Theme } from "@/types";

interface UIState {
  theme: Theme;
  settingsOpen: boolean;
  commandPaletteOpen: boolean;
  // actions
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
}

const prefersDark =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : true;

export const useUIStore = create<UIState>((set) => ({
  theme: prefersDark ? "dark" : "light",
  settingsOpen: false,
  commandPaletteOpen: false,

  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },

  toggleTheme: () =>
    set((state) => {
      const next = state.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      return { theme: next };
    }),

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
}));
