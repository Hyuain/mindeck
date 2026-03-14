import { useMemo } from "react"
import hljs from "highlight.js"
import DOMPurify from "dompurify"
import type { RenderableContent } from "@/types"

interface CodeRendererProps {
  content: RenderableContent
}

export function CodeRenderer({ content }: CodeRendererProps) {
  const { sanitizedHtml, language } = useMemo(() => {
    const highlighted = content.language
      ? hljs.highlight(content.content, {
          language: content.language,
          ignoreIllegals: true,
        })
      : hljs.highlightAuto(content.content)
    return {
      sanitizedHtml: DOMPurify.sanitize(highlighted.value),
      language: highlighted.language ?? "",
    }
  }, [content.content, content.language])

  return (
    <pre className="code-block">
      <code
        style={{ padding: 0 }}
        className={`hljs language-${language}`}
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    </pre>
  )
}
