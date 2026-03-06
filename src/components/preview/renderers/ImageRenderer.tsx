import { useState } from "react";
import type { RenderableContent } from "@/types";

interface ImageRendererProps {
  content: RenderableContent;
}

export function ImageRenderer({ content }: ImageRendererProps) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="img-error">
        <span>Image could not be loaded.</span>
      </div>
    );
  }

  return (
    <div className="img-renderer">
      <img
        src={content.content}
        alt={content.filename ?? "Preview"}
        onError={() => setError(true)}
        style={{ maxWidth: "100%", borderRadius: 6 }}
      />
      {content.filename && (
        <div className="img-caption">{content.filename}</div>
      )}
    </div>
  );
}
