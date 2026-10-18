import { useCallback, useEffect, useState } from 'react'

/**
 * Loads data with a promise-returning function and tracks loading/error state.
 * Previous data is kept while reloading so lists do not flash empty.
 */
export function useApi(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let active = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fetcher().then(
      (data) => active && setState({ data, error: null, loading: false }),
      (error) => active && setState((s) => ({ ...s, error, loading: false })),
    )
    return () => {
      active = false
    }
  }, [...deps, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const setData = useCallback(
    (updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })),
    [],
  )

  return { ...state, reload, setData }
}
