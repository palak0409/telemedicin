import { Users } from 'lucide-react'
import { useState } from 'react'
import { Person } from '../../../components/ui/Avatar'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Pagination } from '../../../components/ui/Pagination'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { useToast } from '../../../context/ToastContext'
import { formatShortDate } from '../../../utils/format'
import { listPatients, setUserActive } from '../api'
import { SearchInput } from '../components/SearchInput'
import { usePagedQuery } from '../components/usePagedQuery'

export function AdminPatientsPage() {
  const { showToast } = useToast()
  const query = usePagedQuery(listPatients, ['q'])
  const [busy, setBusy] = useState(null)

  const toggle = async (patient) => {
    setBusy(patient.id)
    try {
      await setUserActive(patient.id, !patient.is_active)
      query.setData((data) => ({
        ...data,
        items: data.items.map((p) => (p.id === patient.id ? { ...p, is_active: !p.is_active } : p)),
      }))
      showToast({ title: patient.is_active ? 'Account deactivated' : 'Account activated' })
    } catch (error) {
      showToast({ title: 'Could not update account', message: error.message, tone: 'danger' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Patients"
        description="Registered patient accounts. Medical information is visible only to a patient's treating doctors."
      />
      <Card>
        <div className="card-header">
          <SearchInput value={query.filters.q} onChange={(v) => query.setFilter('q', v)} placeholder="Name or email" />
        </div>
        {query.loading && !query.data ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={query.reload} />
        ) : query.data.items.length === 0 ? (
          <EmptyState icon={Users} title="No patients found" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Phone</th>
                    <th>Appointments</th>
                    <th>Joined</th>
                    <th>Account</th>
                    <th className="cell-actions">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Person name={p.full_name} src={p.photo_url} meta={p.email} />
                      </td>
                      <td className="nowrap">{p.phone || '—'}</td>
                      <td className="tabular">{p.appointment_count}</td>
                      <td className="nowrap">{formatShortDate(p.created_at)}</td>
                      <td>{p.is_active ? 'Active' : <Badge tone="danger">Deactivated</Badge>}</td>
                      <td className="cell-actions">
                        <Button size="sm" variant={p.is_active ? 'ghost' : 'secondary'} loading={busy === p.id} onClick={() => toggle(p)}>
                          {p.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
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
