import { useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { useModalStore, type ModalEntry } from "@/stores/modal"
import { Z } from "./layers"

function ConfirmDialog({ entry }: { readonly entry: ModalEntry }) {
  const remove = useModalStore((s) => s.remove)

  const handleCancel = useCallback(() => {
    remove(entry.id)
    entry.onCancel?.()
  }, [entry, remove])

  const handleConfirm = useCallback(async () => {
    remove(entry.id)
    await entry.onConfirm()
  }, [entry, remove])

  // Escape key closes this dialog
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation()
        handleCancel()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [handleCancel])

  return (
    <div
      className="overlay open"
      style={{ zIndex: Z.MODAL }}
      onClick={handleCancel}
    >
      <div className="sheet" style={{ width: 380 }} onClick={(e) => e.stopPropagation()}>
        {entry.title && (
          <div className="sheet-head">
            <span className="sheet-title">{entry.title}</span>
          </div>
        )}
        <div className="modal-confirm-body">{entry.message}</div>
        <div className="sheet-foot">
          <button className="btn-ghost" onClick={handleCancel}>
            {entry.cancelLabel ?? "Cancel"}
          </button>
          <button
            className={entry.danger ? "btn-danger" : "btn-solid"}
            onClick={handleConfirm}
          >
            {entry.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ModalHost() {
  const modals = useModalStore((s) => s.modals)

  if (modals.length === 0) return null

  return createPortal(
    <>
      {modals.map((entry) => (
        <ConfirmDialog key={entry.id} entry={entry} />
      ))}
    </>,
    document.body
  )
}
