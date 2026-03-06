import type { RenderableContent } from "@/types";
import { MarkdownRenderer } from "./renderers/MarkdownRenderer";
import { CodeRenderer } from "./renderers/CodeRenderer";
import { ImageRenderer } from "./renderers/ImageRenderer";

export interface Renderer {
  id: string;
  name: string;
  canRender: (content: RenderableContent) => boolean;
  Component: React.ComponentType<{ content: RenderableContent }>;
}

const RENDERERS: Renderer[] = [
  {
    id: "markdown",
    name: "Markdown",
    canRender: (c) => c.type === "markdown",
    Component: MarkdownRenderer,
  },
  {
    id: "code",
    name: "Code",
    canRender: (c) => c.type === "code",
    Component: CodeRenderer,
  },
  {
    id: "image",
    name: "Image",
    canRender: (c) => c.type === "image",
    Component: ImageRenderer,
  },
];

export function detectRenderer(content: RenderableContent): Renderer {
  return (
    RENDERERS.find((r) => r.id === content.type) ??
    RENDERERS.find((r) => r.id === "markdown")!
  );
}

export function getRenderer(id: string): Renderer | undefined {
  return RENDERERS.find((r) => r.id === id);
}

export { RENDERERS };
