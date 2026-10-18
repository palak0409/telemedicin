import { Button } from './Button'

export function Pagination({ total, limit, offset, onChange }) {
  if (total <= limit) return null
  const from = offset + 1
  const to = Math.min(offset + limit, total)
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="tabular">
        {from}–{to} of {total}
      </span>
      <div className="row-sm">
        <Button variant="secondary" size="sm" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={to >= total} onClick={() => onChange(offset + limit)}>
          Next
        </Button>
      </div>
    </nav>
  )
}
