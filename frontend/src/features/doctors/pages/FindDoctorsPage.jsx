import { Search, SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Pagination } from '../../../components/ui/Pagination'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { useApi } from '../../../hooks/useApi'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue'
import { EXPERIENCE_FILTERS } from '../../../utils/constants'
import { listLanguages, listSpecializations, searchDoctors } from '../api'
import { DoctorListItem } from '../components/DoctorListItem'

const PAGE_SIZE = 10
const FILTER_KEYS = ['q', 'specialization_id', 'language', 'min_experience', 'available', 'sort']

/** Doctor search. Filters live in the URL so results can be bookmarked and shared. */
export function FindDoctorsPage() {
  const [params, setParams] = useSearchParams()
  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) ?? '']))
  const offset = Number(params.get('offset') ?? 0)

  const [searchText, setSearchText] = useState(filters.q)
  const debouncedSearch = useDebouncedValue(searchText.trim())

  const specializations = useApi(listSpecializations, [])
  const languages = useApi(listLanguages, [])
  const results = useApi(() => searchDoctors({ ...filters, limit: PAGE_SIZE, offset }), [params.toString()])

  const setFilters = (changes) => {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)))
    if (!('offset' in changes)) next.delete('offset')
    setParams(next, { replace: true })
  }

  useEffect(() => {
    if (debouncedSearch !== filters.q) setFilters({ q: debouncedSearch })
    // Only react to the debounced text, not to every URL change.
  }, [debouncedSearch])

  const hasFilters = FILTER_KEYS.some((key) => key !== 'sort' && filters[key])
  const clearFilters = () => {
    setSearchText('')
    setParams({}, { replace: true })
  }

  return (
    <>
      <PageHeader title="Find a doctor" description="Search verified doctors and book a video consultation." />

      <Card style={{ marginBottom: 16 }}>
        <div className="filter-bar">
          <div className="input-with-icon">
            <Search aria-hidden="true" />
            <input
              className="input"
              type="search"
              placeholder="Doctor name or specialty"
              aria-label="Search doctors"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>
          <select
            className="select"
            aria-label="Specialization"
            value={filters.specialization_id}
            onChange={(e) => setFilters({ specialization_id: e.target.value })}
          >
            <option value="">All specializations</option>
            {specializations.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select className="select" aria-label="Language" value={filters.language} onChange={(e) => setFilters({ language: e.target.value })}>
            <option value="">Any language</option>
            {languages.data?.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
          <select
            className="select"
            aria-label="Experience"
            value={filters.min_experience}
            onChange={(e) => setFilters({ min_experience: e.target.value })}
          >
            {EXPERIENCE_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select className="select" aria-label="Availability" value={filters.available} onChange={(e) => setFilters({ available: e.target.value })}>
            <option value="">Any availability</option>
            <option value="today">Available today</option>
            <option value="week">Available this week</option>
          </select>
        </div>
      </Card>

      <Card>
        <div className="card-header">
          <span className="muted text-sm" aria-live="polite">
            {results.data ? `${results.data.total} ${results.data.total === 1 ? 'doctor' : 'doctors'}` : ' '}
          </span>
          <div className="row-sm">
            <label htmlFor="sort" className="text-sm muted">
              Sort by
            </label>
            <select id="sort" className="select" style={{ width: 'auto' }} value={filters.sort || 'name'} onChange={(e) => setFilters({ sort: e.target.value })}>
              <option value="name">Name</option>
              <option value="availability">Earliest availability</option>
              <option value="experience">Most experienced</option>
              <option value="fee_low">Fee: low to high</option>
              <option value="fee_high">Fee: high to low</option>
            </select>
          </div>
        </div>

        {results.loading && !results.data ? (
          <LoadingState label="Finding doctors…" />
        ) : results.error ? (
          <ErrorState error={results.error} onRetry={results.reload} />
        ) : results.data.items.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No doctors match your search"
            description="Try a different name or specialty, or remove some filters."
            action={
              hasFilters && (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <>
            <div style={{ opacity: results.loading ? 0.6 : 1 }}>
              {results.data.items.map((doctor) => (
                <DoctorListItem key={doctor.id} doctor={doctor} />
              ))}
            </div>
            <Pagination
              total={results.data.total}
              limit={PAGE_SIZE}
              offset={offset}
              onChange={(value) => setFilters({ offset: value ? String(value) : '' })}
            />
          </>
        )}
      </Card>
    </>
  )
}
