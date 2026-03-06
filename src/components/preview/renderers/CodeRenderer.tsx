import type { RenderableContent } from "@/types";

interface CodeRendererProps {
  content: RenderableContent;
}

export function CodeRenderer({ content }: CodeRendererProps) {
  return (
    <div className="code-renderer">
      {content.filename && (
        <div className="code-filename">{content.filename}</div>
      )}
      <pre className="code-block">
        <code className={content.language ? `language-${content.language}` : ""}>
          {content.content}
        </code>
      </pre>
    </div>
  );
}
