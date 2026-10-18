import { ClipboardList } from 'lucide-react'
import { useState } from 'react'
import { StatusBadge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Pagination } from '../../../components/ui/Pagination'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { useToast } from '../../../context/ToastContext'
import { APPOINTMENT_STATUS, CONSULTATION_STATUS } from '../../../utils/constants'
import { doctorName, formatDate, formatTimeRange } from '../../../utils/format'
import { ReasonDialog } from '../../appointments/components/ReasonDialog'
import { cancelAppointment, listAppointments } from '../api'
import { SearchInput } from '../components/SearchInput'
import { usePagedQuery } from '../components/usePagedQuery'

export function AdminAppointmentsPage() {
  const { showToast } = useToast()
  const query = usePagedQuery(listAppointments, ['status', 'q', 'date_from', 'date_to'])
  const [cancelling, setCancelling] = useState(null)

  return (
    <>
      <PageHeader title="Appointments" description="All appointments across the platform." />
      <Card>
        <div className="card-header" style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
          <SearchInput value={query.filters.q} onChange={(v) => query.setFilter('q', v)} placeholder="Patient or doctor name" />
          <select className="select" style={{ width: 'auto' }} aria-label="Status" value={query.filters.status} onChange={(e) => query.setFilter('status', e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(APPOINTMENT_STATUS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label className="row-sm text-sm muted">
            From
            <input className="input" type="date" style={{ width: 'auto' }} value={query.filters.date_from} onChange={(e) => query.setFilter('date_from', e.target.value)} />
          </label>
          <label className="row-sm text-sm muted">
            To
            <input className="input" type="date" style={{ width: 'auto' }} value={query.filters.date_to} onChange={(e) => query.setFilter('date_to', e.target.value)} />
          </label>
        </div>
        {query.loading && !query.data ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={query.reload} />
        ) : query.data.items.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No appointments found" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Scheduled</th>
                    <th>Patient</th>
                    <th>Doctor</th>
                    <th>Status</th>
                    <th>Consultation</th>
                    <th className="cell-actions">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((a) => (
                    <tr key={a.id}>
                      <td className="nowrap">
                        {formatDate(a.start_time)}
                        <span className="cell-sub tabular">{formatTimeRange(a.start_time, a.end_time)}</span>
                      </td>
                      <td>{a.patient.full_name}</td>
                      <td>
                        {doctorName(a.doctor.full_name)}
                        <span className="cell-sub">{a.specialization}</span>
                      </td>
                      <td>
                        <StatusBadge map={APPOINTMENT_STATUS} value={a.status} />
                        {a.status_note && <span className="cell-sub truncate" style={{ maxWidth: 200 }}>{a.status_note}</span>}
                      </td>
                      <td>{a.consultation_status ? <StatusBadge map={CONSULTATION_STATUS} value={a.consultation_status} /> : '—'}</td>
                      <td className="cell-actions">
                        {['pending', 'confirmed'].includes(a.status) && new Date(a.start_time) > new Date() && (
                          <Button size="sm" variant="ghost" onClick={() => setCancelling(a)}>
                            Cancel
                          </Button>
                        )}
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
      {cancelling && (
        <ReasonDialog
          title="Cancel appointment"
          description={`The patient and ${doctorName(cancelling.doctor.full_name)} will both be notified.`}
          confirmLabel="Cancel appointment"
          onClose={() => setCancelling(null)}
          onConfirm={async (reason) => {
            await cancelAppointment(cancelling.id, reason)
            showToast({ title: 'Appointment cancelled' })
            query.reload()
          }}
        />
      )}
    </>
  )
}
