import { useCallback, useState } from 'react'

/**
 * Wraps a mutation (save, accept, cancel…) with pending and error state so
 * buttons can show progress and forms can show the server's message.
 */
export function useAsyncAction(action) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)

  const run = useCallback(
    async (...args) => {
      setPending(true)
      setError(null)
      try {
        return await action(...args)
      } catch (err) {
        setError(err)
        throw err
      } finally {
        setPending(false)
      }
    },
    [action],
  )

  return { run, pending, error, setError }
}
