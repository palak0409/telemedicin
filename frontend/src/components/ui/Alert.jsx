import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'

const ICONS = { info: Info, warning: AlertTriangle, danger: AlertCircle, success: CheckCircle2 }

export function Alert({ tone = 'info', title, children, action }) {
  const Icon = ICONS[tone]
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon aria-hidden="true" />
      <div className="alert-body">
        {title && <p className="alert-title">{title}</p>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  )
}

/** Shows an ApiError (or any Error) as an inline danger alert. */
export function ErrorAlert({ error }) {
  if (!error) return null
  return <Alert tone="danger">{error.message}</Alert>
}
