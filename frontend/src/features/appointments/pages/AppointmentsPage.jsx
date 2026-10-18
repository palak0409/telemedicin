import { CalendarDays } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { PageHeader } from '../../../components/ui/PageHeader'
import { Pagination } from '../../../components/ui/Pagination'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { Tabs } from '../../../components/ui/Tabs'
import { useAuth } from '../../../context/AuthContext'
import { useApi } from '../../../hooks/useApi'
import { useNotificationEvents } from '../../notifications/NotificationsContext'
import { listAppointments } from '../api'
import { AppointmentTable } from '../components/AppointmentTable'
import { useAppointmentActions } from '../components/useAppointmentActions'

const PAGE_SIZE = 15

const TABS = {
  patient: [
    { value: 'upcoming', label: 'Upcoming', query: { scope: 'upcoming' } },
    { value: 'past', label: 'Past', query: { scope: 'past' } },
  ],
  doctor: [
    { value: 'requests', label: 'Requests', query: { scope: 'upcoming', status: 'pending' } },
    { value: 'upcoming', label: 'Confirmed', query: { scope: 'upcoming', status: 'confirmed' } },
    { value: 'past', label: 'Past', query: { scope: 'past' } },
  ],
}

const EMPTY_TEXT = {
  requests: ['No pending requests', 'New appointment requests from patients will appear here.'],
  upcoming: ['No upcoming appointments', 'Confirmed and requested appointments will appear here.'],
  past: ['No past appointments', 'Completed, cancelled and declined appointments will appear here.'],
}

export function AppointmentsPage() {
  const { user } = useAuth()
  const isDoctor = user.role === 'doctor'
  const tabs = TABS[user.role]
  const [params, setParams] = useSearchParams()
  const active = tabs.find((t) => t.value === params.get('tab')) ?? tabs[0]
  const offset = Number(params.get('offset') ?? 0)

  const list = useApi(() => listAppointments({ ...active.query, limit: PAGE_SIZE, offset }), [active.value, offset])
  const pendingCount = useApi(
    () => (isDoctor ? listAppointments({ scope: 'upcoming', status: 'pending', limit: 1 }) : Promise.resolve(null)),
    [],
  )
  const refresh = () => {
    list.reload()
    pendingCount.reload()
  }
  useNotificationEvents(refresh)
  const actions = useAppointmentActions(refresh)

  const doctorActions =
    isDoctor && active.value === 'requests'
      ? (a) =>
          new Date(a.start_time) > new Date() && (
            <>
              <Button size="sm" loading={actions.accepting === a.id} onClick={() => actions.accept(a)}>
                Accept
              </Button>
              <Button size="sm" variant="secondary" onClick={() => actions.reject(a)}>
                Decline
              </Button>
            </>
          )
      : undefined

  const [emptyTitle, emptyText] = EMPTY_TEXT[active.value]

  return (
    <>
      <PageHeader
        title="Appointments"
        description={isDoctor ? 'Review requests and manage your consultations.' : 'Your requested, upcoming and past consultations.'}
        actions={!isDoctor && <Button to="/patient/doctors">Book an appointment</Button>}
      />
      <Card>
        <div style={{ padding: '0 12px' }}>
          <Tabs
            label="Appointment lists"
            value={active.value}
            onChange={(value) => setParams({ tab: value })}
            items={tabs.map((t) => ({
              value: t.value,
              label: t.label,
              count: t.value === 'requests' ? pendingCount.data?.total : undefined,
            }))}
          />
        </div>
        {list.loading && !list.data ? (
          <LoadingState />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={emptyTitle}
            description={emptyText}
            action={!isDoctor && active.value === 'upcoming' && <Button to="/patient/doctors" size="sm">Find a doctor</Button>}
          />
        ) : (
          <>
            <AppointmentTable appointments={list.data.items} role={user.role} actions={doctorActions} />
            <Pagination
              total={list.data.total}
              limit={PAGE_SIZE}
              offset={offset}
              onChange={(value) => setParams({ tab: active.value, offset: String(value) })}
            />
          </>
        )}
      </Card>
      {actions.dialog}
    </>
  )
}
