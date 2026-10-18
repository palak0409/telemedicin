import { X } from 'lucide-react'
import { useState } from 'react'

/** Free-text multi-value input: Enter or comma adds a value, Backspace removes the last one. */
export function TagInput({ value, onChange, placeholder, id, ...aria }) {
  const [draft, setDraft] = useState('')

  const add = () => {
    const next = draft.trim()
    if (next && !value.some((v) => v.toLowerCase() === next.toLowerCase())) onChange([...value, next])
    setDraft('')
  }

  const onKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      add()
    } else if (event.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="tag-input">
      {value.map((item) => (
        <span className="tag" key={item}>
          {item}
          <button type="button" onClick={() => onChange(value.filter((v) => v !== item))} aria-label={`Remove ${item}`}>
            <X />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={add}
        placeholder={value.length ? '' : placeholder}
        {...aria}
      />
    </div>
  )
}
