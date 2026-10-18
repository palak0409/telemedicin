import { AlertTriangle, Inbox } from 'lucide-react'
import { Button } from './Button'

export function Spinner({ large = false, label = 'Loading' }) {
  return <span className={`spinner ${large ? 'spinner-lg' : ''}`} role="status" aria-label={label} />
}

export function LoadingState({ label = 'Loading…', compact = false }) {
  return (
    <div className={`state ${compact ? 'state-compact' : ''}`}>
      <Spinner large label={label} />
      <p>{label}</p>
    </div>
  )
}

export function FullPageLoader() {
  return (
    <div className="full-page-state">
      <Spinner large />
    </div>
  )
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, compact = false }) {
  return (
    <div className={`state ${compact ? 'state-compact' : ''}`}>
      <span className="state-icon">
        <Icon aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry, compact = false }) {
  return (
    <div className={`state ${compact ? 'state-compact' : ''}`} role="alert">
      <span className="state-icon state-icon-danger">
        <AlertTriangle aria-hidden="true" />
      </span>
      <h3>Could not load this information</h3>
      <p>{error?.message || 'Something went wrong.'}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}
