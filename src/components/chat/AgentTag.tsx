interface AgentTagProps {
  label: string
  color?: string
}

/** Small colored tag showing which agent produced a message */
export function AgentTag({ label, color = "var(--color-sa)" }: AgentTagProps) {
  return (
    <span className="agent-tag" style={{ borderColor: color, color }}>
      {label}
    </span>
  )
}
