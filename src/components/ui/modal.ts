import { useModalStore } from "@/stores/modal"

export const modal = {
  confirm(opts: {
    title?: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
    onConfirm: () => void | Promise<void>
    onCancel?: () => void
  }): void {
    useModalStore.getState().push({
      id: crypto.randomUUID(),
      type: "confirm",
      ...opts,
    })
  },
}
