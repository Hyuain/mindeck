import { create } from "zustand"

export type DropPosition = "left" | "right" | "top" | "bottom" | null

export interface DragPreview {
  id: string
  type: "file" | "agent"
  title: string
  filePath?: string
  workspaceId?: string
}

interface DragState {
  isDragging: boolean
  previewData: DragPreview | null
  dropPosition: DropPosition
  setDragging: (data: DragPreview) => void
  setDropPosition: (pos: DropPosition) => void
  clearDragging: () => void
}

export const useDragState = create<DragState>((set) => ({
  isDragging: false,
  previewData: null,
  dropPosition: null,
  setDragging: (data) => set({ isDragging: true, previewData: data }),
  setDropPosition: (pos) => set({ dropPosition: pos }),
  clearDragging: () => set({ isDragging: false, previewData: null, dropPosition: null }),
}))
