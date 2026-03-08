import hljs from "highlight.js"
import type { RenderableContent } from "@/types"

interface CodeRendererProps {
  content: RenderableContent
}

export function CodeRenderer({ content }: CodeRendererProps) {
  const highlighted = content.language
    ? hljs.highlight(content.content, {
        language: content.language,
        ignoreIllegals: true,
      })
    : hljs.highlightAuto(content.content)

  return (
    <pre className="code-block">
      <code
        style={{ padding: 0 }}
        className={`hljs language-${highlighted.language ?? ""}`}
        dangerouslySetInnerHTML={{ __html: highlighted.value }}
      />
    </pre>
  )
}
