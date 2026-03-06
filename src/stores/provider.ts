import { create } from "zustand";
import type { ProviderConfig } from "@/types";

interface ProviderState {
  providers: ProviderConfig[];
  // actions
  setProviders: (providers: ProviderConfig[]) => void;
  addProvider: (provider: ProviderConfig) => void;
  updateProvider: (id: string, patch: Partial<ProviderConfig>) => void;
  removeProvider: (id: string) => void;
  setConnected: (id: string, connected: boolean) => void;
}

export const useProviderStore = create<ProviderState>((set) => ({
  providers: [],

  setProviders: (providers) => set({ providers }),

  addProvider: (provider) =>
    set((state) => ({ providers: [...state.providers, provider] })),

  updateProvider: (id, patch) =>
    set((state) => ({
      providers: state.providers.map((p) =>
        p.id === id ? { ...p, ...patch } : p
      ),
    })),

  removeProvider: (id) =>
    set((state) => ({
      providers: state.providers.filter((p) => p.id !== id),
    })),

  setConnected: (id, isConnected) =>
    set((state) => ({
      providers: state.providers.map((p) =>
        p.id === id ? { ...p, isConnected } : p
      ),
    })),
}));
