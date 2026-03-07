/** Thin visual separator showing a task was dispatched from Majordomo */
export function DispatchDivider({ label = "Task from Majordomo" }: { label?: string }) {
  return (
    <div className="dispatch-divider" aria-label={label}>
      <div className="dispatch-divider-line" />
      <span className="dispatch-divider-label">
        <span className="dispatch-divider-dot">🟣</span>
        {label}
      </span>
      <div className="dispatch-divider-line" />
    </div>
  )
}
