import { cloneElement, isValidElement, useId } from 'react'

/**
 * Label + control + hint/error. The single child control receives the id and
 * aria attributes, so callers can pass a plain <input>, <select> or <textarea>.
 */
export function Field({ label, hint, error, optional = false, className = '', children }) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id ?? id,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': describedBy,
      })
    : children

  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="field-label" htmlFor={isValidElement(children) ? (children.props.id ?? id) : undefined}>
          {label} {optional && <span className="optional">(optional)</span>}
        </label>
      )}
      {control}
      {error ? (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      ) : (
        hint && (
          <span className="field-hint" id={`${id}-hint`}>
            {hint}
          </span>
        )
      )}
    </div>
  )
}
