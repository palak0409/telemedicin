import { Video } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Avatar } from '../../../components/ui/Avatar'
import { StatusBadge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../../components/ui/Card'
import { PageHeader } from '../../../components/ui/PageHeader'
import { ErrorState, LoadingState } from '../../../components/ui/States'
import { useAuth } from '../../../context/AuthContext'
import { useApi } from '../../../hooks/useApi'
import { CONSULTATION_STATUS } from '../../../utils/constants'
import {
  doctorName,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDuration,
  formatTimeRange,
} from '../../../utils/format'
import { ApprovedSummary } from '../../documentation/components/ApprovedSummary'
import { DocumentationPanel } from '../../documentation/components/DocumentationPanel'
import { useNotificationEvents } from '../../notifications/NotificationsContext'
import { MedicalSummary } from '../../patients/components/MedicalSummary'
import { getAppointment } from '../api'
import { AppointmentStatusBadge } from '../components/AppointmentStatusBadge'
import { useAppointmentActions } from '../components/useAppointmentActions'

const SOON_MS = 60 * 60 * 1000

function JoinCard({ appointment }) {
  if (appointment.status !== 'confirmed') return null
  return (
    <Card>
      <CardHeader title="Video consultation" />
      <CardBody className="stack-sm">
        {appointment.can_join ? (
          <>
            <p className="muted text-sm">The consultation room is open.</p>
            <Button icon={Video} block to={`/consultation/${appointment.id}`}>
              Join consultation
            </Button>
          </>
        ) : new Date(appointment.end_time) > new Date() ? (
          <p className="muted text-sm">
            The room opens shortly before {formatDateTime(appointment.start_time)}. Use a quiet place with a stable
            internet connection, and allow camera and microphone access when asked.
          </p>
        ) : (
          <p className="muted text-sm">This appointment's time has passed.</p>
        )}
      </CardBody>
    </Card>
  )
}

export function AppointmentDetailPage() {
  const { appointmentId } = useParams()
  const { user } = useAuth()
  const isDoctor = user.role === 'doctor'
  const appointment = useApi(() => getAppointment(appointmentId), [appointmentId])
  const actions = useAppointmentActions((updated) => appointment.setData(updated))
  useNotificationEvents(() => appointment.reload())

  // When the visit is close, re-check periodically so the Join button appears on time.
  const a = appointment.data
  const startsSoon = a?.status === 'confirmed' && !a.can_join && new Date(a.start_time) - Date.now() < SOON_MS
  useEffect(() => {
    if (!startsSoon) return undefined
    const timer = setInterval(appointment.reload, 30000)
    return () => clearInterval(timer)
  }, [startsSoon, appointment.reload])

  const back = { to: `/${user.role}/appointments`, label: 'Appointments' }

  if (appointment.loading && !a) return <LoadingState />
  if (appointment.error && !a) {
    return (
      <>
        <PageHeader title="Appointment" back={back} />
        <Card>
          <ErrorState error={appointment.error} onRetry={appointment.reload} />
        </Card>
      </>
    )
  }

  const upcoming = new Date(a.start_time) > new Date()
  const counterpart = isDoctor ? a.patient : a.doctor
  const counterpartName = isDoctor ? a.patient.full_name : doctorName(a.doctor.full_name)

  return (
    <>
      <PageHeader
        title={`Appointment with ${counterpartName}`}
        description={`${formatDate(a.start_time)} · ${formatTimeRange(a.start_time, a.end_time)}`}
        back={back}
        actions={
          <>
            {isDoctor && a.status === 'pending' && upcoming && (
              <>
                <Button variant="secondary" onClick={() => actions.reject(a)}>
                  Decline
                </Button>
                <Button loading={actions.accepting === a.id} onClick={() => actions.accept(a)}>
                  Accept request
                </Button>
              </>
            )}
            {['pending', 'confirmed'].includes(a.status) && upcoming && !(isDoctor && a.status === 'pending') && (
              <Button variant="danger-outline" onClick={() => actions.cancel(a)}>
                Cancel appointment
              </Button>
            )}
          </>
        }
      />

      <div className="layout-2col">
        <div className="stack-lg">
          <Card>
            <CardHeader title="Appointment details" actions={<AppointmentStatusBadge appointment={a} />} />
            <CardBody>
              <dl className="dl">
                <dt>Date</dt>
                <dd>{formatDate(a.start_time)}</dd>
                <dt>Time</dt>
                <dd className="tabular">
                  {formatTimeRange(a.start_time, a.end_time)} ({a.duration_minutes} min)
                </dd>
                <dt>Type</dt>
                <dd>Video consultation</dd>
                {a.consultation_fee != null && (
                  <>
                    <dt>Consultation fee</dt>
                    <dd>{formatCurrency(a.consultation_fee)}</dd>
                  </>
                )}
                <dt>Requested on</dt>
                <dd>{formatDateTime(a.created_at)}</dd>
                <dt>Reason for visit</dt>
                <dd className="pre-line">{a.reason}</dd>
                {a.status_note && (
                  <>
                    <dt>{a.status === 'rejected' ? 'Reason declined' : 'Cancellation reason'}</dt>
                    <dd>{a.status_note}</dd>
                  </>
                )}
              </dl>
            </CardBody>
          </Card>

          {a.consultation && (
            <Card>
              <CardHeader title="Consultation" actions={<StatusBadge map={CONSULTATION_STATUS} value={a.consultation.status} />} />
              <CardBody className="stack">
                <dl className="dl">
                  <dt>Started</dt>
                  <dd>{a.consultation.started_at ? formatDateTime(a.consultation.started_at) : 'Participants did not connect'}</dd>
                  {a.consultation.ended_at && (
                    <>
                      <dt>Ended</dt>
                      <dd>{formatDateTime(a.consultation.ended_at)}</dd>
                    </>
                  )}
                  {a.consultation.duration_seconds != null && (
                    <>
                      <dt>Duration</dt>
                      <dd>{formatDuration(a.consultation.duration_seconds)}</dd>
                    </>
                  )}
                </dl>
              </CardBody>
            </Card>
          )}

          {a.consultation?.status === 'ended' &&
            (isDoctor ? (
              <DocumentationPanel consultationId={a.consultation.id} notes={a.consultation.notes} />
            ) : (
              <Card>
                <CardHeader title="Visit summary" description="Reviewed and approved by your doctor." />
                <CardBody>
                  <ApprovedSummary summary={a.consultation.summary} notes={a.consultation.notes} />
                </CardBody>
              </Card>
            ))}

          {isDoctor && (
            <Card>
              <CardHeader
                title="Patient medical information"
                actions={<Link to={`/doctor/patients/${a.patient.id}`} className="text-sm">Full record</Link>}
              />
              <CardBody>
                <MedicalSummary medical={a.patient_info?.medical} age={a.patient_info?.age} gender={a.patient_info?.gender} />
              </CardBody>
            </Card>
          )}
        </div>

        <div className="stack-lg">
          <JoinCard appointment={a} />
          <Card>
            <CardHeader title={isDoctor ? 'Patient' : 'Doctor'} />
            <CardBody className="stack-sm">
              <div className="row">
                <Avatar name={counterpart.full_name} src={counterpart.photo_url} size="lg" />
                <div>
                  <div className="strong">{counterpartName}</div>
                  <div className="text-sm muted">
                    {isDoctor ? a.patient_info?.phone || 'No phone on file' : a.doctor.specialization}
                  </div>
                </div>
              </div>
              {!isDoctor && (
                <Link to={`/patient/doctors/${a.doctor.id}`} className="text-sm">
                  View doctor profile
                </Link>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
      {actions.dialog}
    </>
  )
}
