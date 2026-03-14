import type { PaneNode } from "./FlexibleWorkspace"

export function updateSizesInTree(
  node: PaneNode,
  currentKey: string,
  targetKey: string,
  sizes: [number, number]
): PaneNode {
  if (node.type === "pane") return node
  if (currentKey === targetKey) return { ...node, sizes }
  return {
    ...node,
    children: [
      updateSizesInTree(node.children[0], currentKey + "-0", targetKey, sizes),
      updateSizesInTree(node.children[1], currentKey + "-1", targetKey, sizes),
    ],
  }
}

export function splitPaneInLayout(
  layout: PaneNode,
  targetPaneId: string,
  newPaneId: string,
  position: "top" | "bottom" | "left" | "right"
): PaneNode {
  if (layout.type === "pane") {
    if (layout.paneId !== targetPaneId) return layout
    const direction =
      position === "left" || position === "right" ? "horizontal" : "vertical"
    const putNewFirst = position === "left" || position === "top"
    const newNode: PaneNode = { type: "pane", paneId: newPaneId }
    return {
      type: "split",
      direction,
      sizes: [50, 50],
      children: putNewFirst ? [newNode, layout] : [layout, newNode],
    }
  }
  const [c0, c1] = layout.children
  return {
    ...layout,
    children: [
      splitPaneInLayout(c0, targetPaneId, newPaneId, position),
      splitPaneInLayout(c1, targetPaneId, newPaneId, position),
    ],
  }
}

export function removePaneFromTree(
  currentLayout: PaneNode,
  paneIdToRemove: string
): PaneNode | null {
  if (currentLayout.type === "pane") {
    return currentLayout.paneId === paneIdToRemove ? null : currentLayout
  }

  const [child0, child1] = currentLayout.children
  const newChild0 = removePaneFromTree(child0, paneIdToRemove)
  const newChild1 = removePaneFromTree(child1, paneIdToRemove)

  if (newChild0 === null) return newChild1
  if (newChild1 === null) return newChild0

  return { ...currentLayout, children: [newChild0, newChild1] }
}

export function addPaneToTree(
  currentLayout: PaneNode | null,
  paneId: string,
  dropPos: "top" | "bottom" | "left" | "right" | null,
  containerRect?: { width: number; height: number; left: number; top: number },
  cursor?: { x: number; y: number }
): PaneNode {
  const newPaneNode: PaneNode = { type: "pane", paneId }

  if (!currentLayout) return newPaneNode

  let effectiveDropPos = dropPos
  if (!effectiveDropPos && cursor && containerRect) {
    const x = cursor.x - containerRect.left
    const y = cursor.y - containerRect.top
    if (x > containerRect.width / 2) effectiveDropPos = "right"
    else if (y > containerRect.height / 2) effectiveDropPos = "bottom"
    else effectiveDropPos = "left"
  }

  if (!effectiveDropPos) {
    return {
      type: "split",
      direction: "horizontal",
      sizes: [50, 50],
      children: [currentLayout, newPaneNode],
    }
  }

  const direction: "horizontal" | "vertical" =
    effectiveDropPos === "left" || effectiveDropPos === "right"
      ? "horizontal"
      : "vertical"
  const putNewPaneFirst = effectiveDropPos === "left" || effectiveDropPos === "top"

  return {
    type: "split",
    direction,
    sizes: [50, 50],
    children: putNewPaneFirst
      ? [newPaneNode, currentLayout]
      : [currentLayout, newPaneNode],
  }
}
