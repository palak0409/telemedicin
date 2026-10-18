import { useState } from 'react'
import { initials } from '../../utils/format'

export function Avatar({ name, src, size = 'md' }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className={`avatar avatar-${size}`} aria-hidden="true">
      {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : initials(name)}
    </span>
  )
}

/** Avatar with a name and optional secondary line, used in tables and lists. */
export function Person({ name, src, meta, size = 'sm' }) {
  return (
    <div className="person">
      <Avatar name={name} src={src} size={size} />
      <div style={{ minWidth: 0 }}>
        <div className="person-name truncate">{name}</div>
        {meta && <div className="person-meta truncate">{meta}</div>}
      </div>
    </div>
  )
}
