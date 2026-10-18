import { Video } from 'lucide-react'
import { StatusBadge } from '../../../components/ui/Badge'
import { Card } from '../../../components/ui/Card'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Pagination } from '../../../components/ui/Pagination'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { CONSULTATION_STATUS } from '../../../utils/constants'
import { doctorName, formatDateTime, formatDuration, formatTime } from '../../../utils/format'
import { listConsultations } from '../api'
import { usePagedQuery } from '../components/usePagedQuery'

export function AdminConsultationsPage() {
  const query = usePagedQuery(listConsultations, ['status'])

  return (
    <>
      <PageHeader
        title="Consultations"
        description="Video consultation records. Clinical notes are visible only to the doctor and patient."
      />
      <Card>
        <div className="card-header" style={{ justifyContent: 'flex-start' }}>
          <select className="select" style={{ width: 'auto' }} aria-label="Status" value={query.filters.status} onChange={(e) => query.setFilter('status', e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(CONSULTATION_STATUS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {query.loading && !query.data ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={query.reload} />
        ) : query.data.items.length === 0 ? (
          <EmptyState icon={Video} title="No consultations found" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Scheduled</th>
                    <th>Doctor</th>
                    <th>Patient</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Ended</th>
                    <th>Duration</th>
                    <th>Room</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((c) => (
                    <tr key={c.id}>
                      <td className="nowrap">{formatDateTime(c.scheduled_start)}</td>
                      <td>{doctorName(c.doctor.full_name)}</td>
                      <td>{c.patient.full_name}</td>
                      <td>
                        <StatusBadge map={CONSULTATION_STATUS} value={c.status} />
                      </td>
                      <td className="tabular">{c.started_at ? formatTime(c.started_at) : '—'}</td>
                      <td className="tabular">{c.ended_at ? formatTime(c.ended_at) : '—'}</td>
                      <td className="tabular nowrap">{formatDuration(c.duration_seconds)}</td>
                      <td className="mono subtle" title={c.room_id}>
                        {c.room_id.slice(0, 8)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={query.data.total} limit={query.pageSize} offset={query.offset} onChange={query.setOffset} />
          </>
        )}
      </Card>
    </>
  )
}
