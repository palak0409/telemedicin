import { BadgeCheck } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Person } from '../../../components/ui/Avatar'
import { StatusBadge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Card, CardHeader } from '../../../components/ui/Card'
import { PageHeader } from '../../../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { useApi } from '../../../hooks/useApi'
import { APPOINTMENT_STATUS } from '../../../utils/constants'
import { doctorName, formatDateTime, formatShortDate } from '../../../utils/format'
import { useNotificationEvents } from '../../notifications/NotificationsContext'
import { getStats, listAppointments, listDoctors } from '../api'

export function AdminDashboardPage() {
  const navigate = useNavigate()
  const stats = useApi(getStats, [])
  const pending = useApi(() => listDoctors({ status: 'pending', limit: 5 }), [])
  const recent = useApi(() => listAppointments({ limit: 8 }), [])
  useNotificationEvents(() => {
    stats.reload()
    pending.reload()
  })

  const s = stats.data
  const tiles = s && [
    { label: 'Patients', value: s.patients, to: '/admin/patients' },
    { label: 'Verified doctors', value: s.doctors_verified, to: '/admin/doctors?status=verified' },
    { label: 'Awaiting verification', value: s.doctors_pending, to: '/admin/doctors?status=pending' },
    { label: "Today's appointments", value: s.appointments_today, to: '/admin/appointments' },
    { label: 'Pending requests', value: s.appointments_pending, to: '/admin/appointments?status=pending' },
    { label: 'Consultations in progress', value: s.consultations_active, to: '/admin/consultations?status=active' },
  ]

  return (
    <>
      <PageHeader title="Dashboard" description="Platform activity and items that need attention." />
      <div className="stack-lg">
        {stats.error ? (
          <Card>
            <ErrorState compact error={stats.error} onRetry={stats.reload} />
          </Card>
        ) : (
          <div className="stats">
            {(tiles ?? Array.from({ length: 6 }, (_, i) => ({ label: '', value: '', to: '#', key: i }))).map((t, i) => (
              <Link key={t.label || i} to={t.to} className="stat stat-link">
                <div className="stat-label">{t.label || <span className="skeleton" style={{ display: 'block', height: 14, width: '60%' }} />}</div>
                <div className="stat-value">{s ? t.value : '—'}</div>
              </Link>
            ))}
          </div>
        )}

        <Card>
          <CardHeader
            title="Doctors awaiting verification"
            actions={<Link to="/admin/doctors?status=pending" className="text-sm">View all</Link>}
          />
          {pending.loading && !pending.data ? (
            <LoadingState compact />
          ) : pending.data?.items.length === 0 ? (
            <EmptyState compact icon={BadgeCheck} title="No doctors awaiting verification" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Doctor</th>
                    <th>Specialization</th>
                    <th>License / registration</th>
                    <th>Registered</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pending.data?.items.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <Person name={doctorName(d.full_name)} src={d.photo_url} meta={d.email} />
                      </td>
                      <td>{d.specialization}</td>
                      <td className="tabular">{d.license_number}</td>
                      <td className="nowrap">{formatShortDate(d.created_at)}</td>
                      <td className="cell-actions">
                        <Button size="sm" to={`/admin/doctors/${d.id}`}>
                          Review
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent appointments" actions={<Link to="/admin/appointments" className="text-sm">View all</Link>} />
          {recent.loading && !recent.data ? (
            <LoadingState compact />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Scheduled</th>
                    <th>Patient</th>
                    <th>Doctor</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.data?.items.map((a) => (
                    <tr key={a.id} className="table-row-link" onClick={() => navigate('/admin/appointments')}>
                      <td className="nowrap">{formatDateTime(a.start_time)}</td>
                      <td>{a.patient.full_name}</td>
                      <td>
                        {doctorName(a.doctor.full_name)}
                        <span className="cell-sub">{a.specialization}</span>
                      </td>
                      <td>
                        <StatusBadge map={APPOINTMENT_STATUS} value={a.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
