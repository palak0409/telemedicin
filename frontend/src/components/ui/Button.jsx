import { Link } from 'react-router-dom'

/**
 * Button with variants. Renders a router <Link> when `to` is given so
 * navigation actions look identical to regular buttons.
 */
export function Button({
  variant = 'primary',
  size,
  block = false,
  loading = false,
  icon: Icon,
  to,
  className = '',
  children,
  disabled,
  type = 'button',
  ...props
}) {
  const classes = ['btn', `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className]
    .filter(Boolean)
    .join(' ')
  const content = (
    <>
      {loading ? <span className="spinner" aria-hidden="true" /> : Icon && <Icon aria-hidden="true" />}
      {children}
    </>
  )

  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {content}
      </Link>
    )
  }
  return (
    <button type={type} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {content}
    </button>
  )
}
