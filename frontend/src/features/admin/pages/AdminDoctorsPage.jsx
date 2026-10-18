import { Stethoscope } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Person } from '../../../components/ui/Avatar'
import { Badge, StatusBadge } from '../../../components/ui/Badge'
import { Card } from '../../../components/ui/Card'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Pagination } from '../../../components/ui/Pagination'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { Tabs } from '../../../components/ui/Tabs'
import { VERIFICATION_STATUS } from '../../../utils/constants'
import { doctorName, formatShortDate } from '../../../utils/format'
import { listDoctors } from '../api'
import { SearchInput } from '../components/SearchInput'
import { usePagedQuery } from '../components/usePagedQuery'

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'suspended', label: 'Suspended' },
]

export function AdminDoctorsPage() {
  const navigate = useNavigate()
  const query = usePagedQuery(listDoctors, ['status', 'q'])

  return (
    <>
      <PageHeader title="Doctors" description="Verify registrations and manage doctor accounts." />
      <Card>
        <div style={{ padding: '0 12px' }}>
          <Tabs label="Verification status" items={STATUS_TABS} value={query.filters.status} onChange={(v) => query.setFilter('status', v)} />
        </div>
        <div className="card-header">
          <SearchInput value={query.filters.q} onChange={(v) => query.setFilter('q', v)} placeholder="Name, email or license" />
        </div>
        {query.loading && !query.data ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={query.reload} />
        ) : query.data.items.length === 0 ? (
          <EmptyState icon={Stethoscope} title="No doctors found" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Doctor</th>
                    <th>Specialization</th>
                    <th>License / registration</th>
                    <th>Experience</th>
                    <th>Verification</th>
                    <th>Account</th>
                    <th>Registered</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((d) => (
                    <tr key={d.id} className="table-row-link" onClick={() => navigate(`/admin/doctors/${d.id}`)}>
                      <td>
                        <Person name={doctorName(d.full_name)} src={d.photo_url} meta={d.email} />
                      </td>
                      <td>{d.specialization}</td>
                      <td className="tabular">{d.license_number}</td>
                      <td className="nowrap">{d.years_of_practice} years</td>
                      <td>
                        <StatusBadge map={VERIFICATION_STATUS} value={d.verification_status} />
                      </td>
                      <td>{d.is_active ? 'Active' : <Badge tone="danger">Deactivated</Badge>}</td>
                      <td className="nowrap">{formatShortDate(d.created_at)}</td>
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
