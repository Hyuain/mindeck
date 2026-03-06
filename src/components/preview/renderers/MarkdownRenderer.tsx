import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import type { RenderableContent } from "@/types";

interface MarkdownRendererProps {
  content: RenderableContent;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="md-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Style tables
          table: ({ children }) => (
            <div className="tbl-wrap">
              <table>{children}</table>
            </div>
          ),
          // Open links externally (Tauri safety)
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (href) window.open(href, "_blank", "noopener,noreferrer");
              }}
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
        }}
      >
        {content.content}
      </ReactMarkdown>
    </div>
  );
}
