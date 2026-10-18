import { useSearchParams } from 'react-router-dom'
import { useApi } from '../../../hooks/useApi'

/**
 * Admin list state kept in the URL: filters plus offset. Changing a filter
 * resets to the first page.
 */
export function usePagedQuery(fetcher, filterKeys, pageSize = 20) {
  const [params, setParams] = useSearchParams()
  const filters = Object.fromEntries(filterKeys.map((key) => [key, params.get(key) ?? '']))
  const offset = Number(params.get('offset') ?? 0)
  const result = useApi(() => fetcher({ ...filters, limit: pageSize, offset }), [params.toString()])

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'offset') next.delete('offset')
    setParams(next, { replace: true })
  }

  return { ...result, filters, offset, pageSize, setFilter, setOffset: (value) => setFilter('offset', value ? String(value) : '') }
}
