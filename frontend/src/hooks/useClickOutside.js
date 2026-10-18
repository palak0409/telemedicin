import { useEffect } from 'react'

/** Calls `onOutside` on a click outside `ref` or on Escape, while `active` is true. */
export function useClickOutside(ref, onOutside, active = true) {
  useEffect(() => {
    if (!active) return undefined
    const onPointer = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onOutside()
    }
    const onKey = (event) => event.key === 'Escape' && onOutside()
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, onOutside, active])
}
