import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ErrorAlert } from '../../../components/ui/Alert'
import { Avatar } from '../../../components/ui/Avatar'
import { StatusBadge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../../components/ui/Card'
import { Field } from '../../../components/ui/Field'
import { PageHeader } from '../../../components/ui/PageHeader'
import { ErrorState, LoadingState } from '../../../components/ui/States'
import { useToast } from '../../../context/ToastContext'
import { useApi } from '../../../hooks/useApi'
import { useAsyncAction } from '../../../hooks/useAsyncAction'
import { VERIFICATION_STATUS } from '../../../utils/constants'
import { doctorName, formatCurrency, formatDateTime, formatShortDate } from '../../../utils/format'
import { WeeklySchedule } from '../../doctors/components/WeeklySchedule'
import { getDoctor, setUserActive, updateVerification } from '../api'

const ACTIONS = {
  pending: [
    { status: 'verified', label: 'Verify doctor', variant: 'primary' },
    { status: 'rejected', label: 'Reject', variant: 'danger-outline', needsNote: true },
  ],
  verified: [{ status: 'suspended', label: 'Suspend', variant: 'danger-outline', needsNote: true }],
  rejected: [
    { status: 'verified', label: 'Verify doctor', variant: 'primary' },
    { status: 'pending', label: 'Return to pending', variant: 'secondary' },
  ],
  suspended: [{ status: 'verified', label: 'Reinstate', variant: 'primary' }],
}

function VerificationPanel({ doctor, onUpdated }) {
  const { showToast } = useToast()
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState(null)
  const update = useAsyncAction(updateVerification)
  const activation = useAsyncAction(setUserActive)

  const apply = async (action) => {
    if (action.needsNote && !note.trim()) {
      setNoteError('Add a note explaining this decision. It is shared with the doctor.')
      return
    }
    setNoteError(null)
    try {
      onUpdated(await update.run(doctor.id, action.status, note.trim() || null))
      setNote('')
      showToast({ title: `Doctor ${VERIFICATION_STATUS[action.status].label.toLowerCase()}`, tone: 'success' })
    } catch {
      // Shown inline.
    }
  }

  const toggleActive = async () => {
    try {
      await activation.run(doctor.id, !doctor.is_active)
      onUpdated({ ...doctor, is_active: !doctor.is_active })
    } catch {
      // Shown inline.
    }
  }

  return (
    <Card>
      <CardHeader title="Verification" actions={<StatusBadge map={VERIFICATION_STATUS} value={doctor.verification_status} />} />
      <CardBody className="stack">
        {doctor.verified_at && <p className="text-sm muted">Verified on {formatDateTime(doctor.verified_at)}</p>}
        {doctor.verification_note && (
          <p className="text-sm">
            <span className="muted">Last note:</span> {doctor.verification_note}
          </p>
        )}
        <Field label="Note to doctor" optional hint="Required when rejecting or suspending." error={noteError}>
          <textarea className="textarea" rows={3} maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ErrorAlert error={update.error} />
        <div className="row-sm wrap">
          {ACTIONS[doctor.verification_status].map((action) => (
            <Button key={action.status} variant={action.variant} loading={update.pending} onClick={() => apply(action)}>
              {action.label}
            </Button>
          ))}
        </div>
        <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '4px 0' }} />
        <div className="row-between">
          <div>
            <div className="strong">Account {doctor.is_active ? 'active' : 'deactivated'}</div>
            <div className="text-sm muted">Deactivated accounts cannot sign in.</div>
          </div>
          <Button variant={doctor.is_active ? 'danger-outline' : 'secondary'} size="sm" loading={activation.pending} onClick={toggleActive}>
            {doctor.is_active ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
        <ErrorAlert error={activation.error} />
      </CardBody>
    </Card>
  )
}

export function AdminDoctorDetailPage() {
  const { doctorId } = useParams()
  const doctor = useApi(() => getDoctor(doctorId), [doctorId])
  const back = { to: '/admin/doctors', label: 'Doctors' }

  if (doctor.loading && !doctor.data) return <LoadingState />
  if (doctor.error) {
    return (
      <>
        <PageHeader title="Doctor" back={back} />
        <Card>
          <ErrorState error={doctor.error} onRetry={doctor.reload} />
        </Card>
      </>
    )
  }

  const d = doctor.data
  return (
    <>
      <PageHeader title={doctorName(d.full_name)} description={`${d.specialization.name} · registered ${formatShortDate(d.created_at)}`} back={back} />
      <div className="layout-2col-wide">
        <div className="stack-lg">
          <Card>
            <CardBody>
              <div className="row">
                <Avatar name={d.full_name} src={d.photo_url} size="lg" />
                <div>
                  <div className="strong">{doctorName(d.full_name)}</div>
                  <div className="text-sm muted">
                    {d.email} {d.phone && `· ${d.phone}`}
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Credentials" description="Check these against the medical council register before verifying." />
            <CardBody>
              <dl className="dl">
                <dt>License / registration ID</dt>
                <dd className="tabular strong">{d.license_number}</dd>
                <dt>Qualifications</dt>
                <dd>{d.qualifications}</dd>
                <dt>Medical institution</dt>
                <dd>{d.medical_institution || '—'}</dd>
                <dt>Specialization</dt>
                <dd>
                  {d.specialization.name}
                  {d.sub_specialization && ` · ${d.sub_specialization}`}
                </dd>
                <dt>Years of practice</dt>
                <dd>{d.years_of_practice}</dd>
                <dt>Clinic / hospital</dt>
                <dd>{d.clinic_affiliation || '—'}</dd>
                <dt>Languages</dt>
                <dd>{d.languages.join(', ') || '—'}</dd>
                <dt>Consultation fee</dt>
                <dd>{formatCurrency(d.consultation_fee)}</dd>
                <dt>Appointments</dt>
                <dd>{d.appointment_count}</dd>
              </dl>
            </CardBody>
          </Card>
          {d.bio && (
            <Card>
              <CardHeader title="Biography" />
              <CardBody>
                <p className="pre-line">{d.bio}</p>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Weekly hours" />
            <CardBody>
              <WeeklySchedule rules={d.weekly_schedule} />
            </CardBody>
          </Card>
        </div>
        <div className="sticky">
          <VerificationPanel doctor={d} onUpdated={doctor.setData} />
        </div>
      </div>
    </>
  )
}
