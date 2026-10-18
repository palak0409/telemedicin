import { CalendarCheck, Inbox } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Card, CardHeader } from '../../../components/ui/Card'
import { PageHeader } from '../../../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { useAuth } from '../../../context/AuthContext'
import { useApi } from '../../../hooks/useApi'
import { greeting, isSameLocalDay } from '../../../utils/format'
import { listAppointments } from '../../appointments/api'
import { AppointmentTable } from '../../appointments/components/AppointmentTable'
import { useAppointmentActions } from '../../appointments/components/useAppointmentActions'
import { listConsultations } from '../../consultations/api'
import { NotificationList } from '../../notifications/components/NotificationList'
import { useNotificationEvents } from '../../notifications/NotificationsContext'
import { VerificationBanner } from '../components/VerificationBanner'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function DoctorDashboardPage() {
  const { user } = useAuth()
  const upcoming = useApi(() => listAppointments({ scope: 'upcoming', limit: 100 }), [])
  const history = useApi(() => listConsultations({ limit: 1 }), [])
  const refresh = () => {
    upcoming.reload()
    history.reload()
  }
  useNotificationEvents(refresh)
  const actions = useAppointmentActions(refresh)

  const items = upcoming.data?.items ?? []
  const now = Date.now()
  const pending = items.filter((a) => a.status === 'pending' && new Date(a.start_time) > now)
  const confirmed = items.filter((a) => a.status === 'confirmed')
  const today = confirmed.filter((a) => isSameLocalDay(a.start_time) || a.can_join)
  const thisWeek = confirmed.filter((a) => new Date(a.start_time).getTime() - now < WEEK_MS)

  const stats = [
    { label: "Today's consultations", value: today.length, to: '/doctor/appointments?tab=upcoming' },
    { label: 'Pending requests', value: pending.length, to: '/doctor/appointments?tab=requests' },
    { label: 'Confirmed this week', value: thisWeek.length, to: '/doctor/appointments?tab=upcoming' },
    { label: 'Consultations held', value: history.data?.total ?? '—', to: '/doctor/consultations' },
  ]

  return (
    <>
      <PageHeader title={`${greeting()}, Dr. ${user.full_name.split(' ').slice(-1)[0]}`} description="Your schedule and requests at a glance." />
      <div className="stack-lg">
        <VerificationBanner status={user.verification_status} />
        <div className="stats">
          {stats.map((s) => (
            <Link key={s.label} to={s.to} className="stat stat-link">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value">{upcoming.data ? s.value : '—'}</div>
            </Link>
          ))}
        </div>

        <div className="layout-2col">
          <div className="stack-lg">
            <Card>
              <CardHeader title="Today's schedule" />
              {upcoming.loading && !upcoming.data ? (
                <LoadingState compact />
              ) : upcoming.error ? (
                <ErrorState compact error={upcoming.error} onRetry={upcoming.reload} />
              ) : today.length === 0 ? (
                <EmptyState compact icon={CalendarCheck} title="No consultations today" />
              ) : (
                <AppointmentTable appointments={today} role="doctor" showReason={false} />
              )}
            </Card>

            <Card>
              <CardHeader
                title="Requests awaiting your response"
                actions={pending.length > 0 && <Link to="/doctor/appointments?tab=requests" className="text-sm">View all</Link>}
              />
              {upcoming.data && pending.length === 0 ? (
                <EmptyState compact icon={Inbox} title="No pending requests" />
              ) : (
                <AppointmentTable
                  appointments={pending.slice(0, 5)}
                  showReason={false}
                  role="doctor"
                  actions={(a) => (
                    <>
                      <Button size="sm" loading={actions.accepting === a.id} onClick={() => actions.accept(a)}>
                        Accept
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => actions.reject(a)}>
                        Decline
                      </Button>
                    </>
                  )}
                />
              )}
            </Card>
          </div>

          <Card>
            <CardHeader title="Notifications" />
            <NotificationList limit={6} />
          </Card>
        </div>
      </div>
      {actions.dialog}
    </>
  )
}
