import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue'

/** Debounced search box that reports the trimmed value. */
export function SearchInput({ value, onChange, placeholder, label }) {
  const [text, setText] = useState(value)
  const debounced = useDebouncedValue(text.trim())
  useEffect(() => {
    if (debounced !== value) onChange(debounced)
  }, [debounced])

  return (
    <div className="input-with-icon" style={{ width: '100%', maxWidth: 300 }}>
      <Search aria-hidden="true" />
      <input className="input" type="search" placeholder={placeholder} aria-label={label ?? placeholder} value={text} onChange={(e) => setText(e.target.value)} />
    </div>
  )
}
