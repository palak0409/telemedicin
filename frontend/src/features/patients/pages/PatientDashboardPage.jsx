import { CalendarDays, Search, Video } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Avatar } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../../components/ui/Card'
import { PageHeader } from '../../../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { useAuth } from '../../../context/AuthContext'
import { useApi } from '../../../hooks/useApi'
import { doctorName, formatDate, formatShortDate, formatTimeRange, greeting } from '../../../utils/format'
import { listAppointments } from '../../appointments/api'
import { AppointmentStatusBadge } from '../../appointments/components/AppointmentStatusBadge'
import { listSpecializations } from '../../doctors/api'
import { NotificationList } from '../../notifications/components/NotificationList'
import { useNotificationEvents } from '../../notifications/NotificationsContext'
import { getMedicalProfile } from '../api'

function NextConsultation({ appointment }) {
  const doctor = appointment.doctor
  return (
    <div className="stack">
      <div className="next-consult">
        <Avatar name={doctor.full_name} src={doctor.photo_url} size="lg" />
        <div className="grow">
          <div className="next-consult-time">
            {formatDate(appointment.start_time)} · <span className="tabular">{formatTimeRange(appointment.start_time, appointment.end_time)}</span>
          </div>
          <div className="muted">
            {doctorName(doctor.full_name)} · {doctor.specialization}
          </div>
        </div>
        <AppointmentStatusBadge appointment={appointment} />
      </div>
      <div className="row wrap">
        {appointment.can_join ? (
          <Button icon={Video} to={`/consultation/${appointment.id}`}>
            Join consultation
          </Button>
        ) : (
          <span className="text-sm muted grow">
            {appointment.status === 'pending'
              ? 'Waiting for the doctor to confirm your request.'
              : 'You can join the video room shortly before the appointment starts.'}
          </span>
        )}
        <Button variant="secondary" to={`/patient/appointments/${appointment.id}`}>
          View details
        </Button>
      </div>
    </div>
  )
}

export function PatientDashboardPage() {
  const { user } = useAuth()
  const upcoming = useApi(() => listAppointments({ scope: 'upcoming', limit: 5 }), [])
  const medical = useApi(getMedicalProfile, [])
  const specializations = useApi(listSpecializations, [])
  useNotificationEvents(() => upcoming.reload())

  const items = upcoming.data?.items ?? []
  const next = items.find((a) => a.can_join) ?? items.find((a) => a.status === 'confirmed') ?? items[0]
  const others = items.filter((a) => a !== next)
  const firstName = user.full_name.split(' ')[0]

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(new Date())}
        actions={
          <Button icon={Search} to="/patient/doctors">
            Find a doctor
          </Button>
        }
      />
      <div className="layout-2col">
        <div className="stack-lg">
          <Card>
            <CardHeader title="Next consultation" />
            <CardBody>
              {upcoming.loading && !upcoming.data ? (
                <LoadingState compact />
              ) : upcoming.error ? (
                <ErrorState compact error={upcoming.error} onRetry={upcoming.reload} />
              ) : next ? (
                <NextConsultation appointment={next} />
              ) : (
                <EmptyState
                  compact
                  icon={CalendarDays}
                  title="No upcoming consultations"
                  description="Find a doctor and choose a time that suits you."
                  action={<Button to="/patient/doctors" size="sm">Find a doctor</Button>}
                />
              )}
            </CardBody>
          </Card>

          {others.length > 0 && (
            <Card>
              <CardHeader title="Also scheduled" actions={<Link to="/patient/appointments" className="text-sm">View all</Link>} />
              <ul className="list">
                {others.map((a) => (
                  <li key={a.id}>
                    <Link to={`/patient/appointments/${a.id}`} className="list-item">
                      <Avatar name={a.doctor.full_name} src={a.doctor.photo_url} size="sm" />
                      <div className="grow">
                        <div className="strong">{doctorName(a.doctor.full_name)}</div>
                        <div className="text-sm muted">
                          {formatDate(a.start_time)} · {formatTimeRange(a.start_time, a.end_time)}
                        </div>
                      </div>
                      <AppointmentStatusBadge appointment={a} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="Browse by specialty" />
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px 16px' }}>
                {specializations.data?.map((s) => (
                  <Link key={s.id} to={`/patient/doctors?specialization_id=${s.id}`}>
                    {s.name}
                  </Link>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="stack-lg">
          <Card>
            <CardHeader title="Notifications" />
            <NotificationList limit={5} />
          </Card>
          <Card>
            <CardHeader title="Medical information" actions={<Link to="/patient/medical-history" className="text-sm">Update</Link>} />
            <CardBody>
              {medical.data ? (
                <dl className="dl-stacked dl-single">
                  <div>
                    <dt>Allergies</dt>
                    <dd>{medical.data.allergies || 'Not recorded'}</dd>
                  </div>
                  <div>
                    <dt>Current medications</dt>
                    <dd>{medical.data.current_medications || 'Not recorded'}</dd>
                  </div>
                  <div>
                    <dt>Last updated</dt>
                    <dd>{formatShortDate(medical.data.updated_at)}</dd>
                  </div>
                </dl>
              ) : (
                <LoadingState compact />
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}
