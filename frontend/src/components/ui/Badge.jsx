export function Badge({ tone = 'neutral', icon: Icon, children }) {
  return (
    <span className={`badge badge-${tone}`}>
      {Icon && <Icon aria-hidden="true" />}
      {children}
    </span>
  )
}

/** Renders a status value using a {value: {label, tone}} map from utils/constants. */
export function StatusBadge({ map, value }) {
  const entry = map[value] ?? { label: value, tone: 'neutral' }
  return <Badge tone={entry.tone}>{entry.label}</Badge>
}
