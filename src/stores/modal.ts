import { create } from "zustand"

export interface ModalEntry {
  readonly id: string
  readonly type: "confirm"
  readonly title?: string
  readonly message: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  readonly danger?: boolean
  readonly onConfirm: () => void | Promise<void>
  readonly onCancel?: () => void
}

interface ModalState {
  readonly modals: readonly ModalEntry[]
  push: (entry: ModalEntry) => void
  remove: (id: string) => void
}

export const useModalStore = create<ModalState>((set) => ({
  modals: [],
  push: (entry) => set((s) => ({ modals: [...s.modals, entry] })),
  remove: (id) => set((s) => ({ modals: s.modals.filter((m) => m.id !== id) })),
}))
