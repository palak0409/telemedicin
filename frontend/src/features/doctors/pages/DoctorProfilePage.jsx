import { BadgeCheck } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { Avatar } from '../../../components/ui/Avatar'
import { Card, CardBody, CardHeader } from '../../../components/ui/Card'
import { ErrorState, LoadingState } from '../../../components/ui/States'
import { useApi } from '../../../hooks/useApi'
import { doctorName, formatCurrency } from '../../../utils/format'
import { getDoctor } from '../api'
import { BookingPanel } from '../components/BookingPanel'
import { WeeklySchedule } from '../components/WeeklySchedule'
import { PageHeader } from '../../../components/ui/PageHeader'

export function DoctorProfilePage() {
  const { doctorId } = useParams()
  const doctor = useApi(() => getDoctor(doctorId), [doctorId])
  const back = { to: '/patient/doctors', label: 'All doctors' }

  if (doctor.loading && !doctor.data) return <LoadingState label="Loading profile…" />
  if (doctor.error) {
    return (
      <>
        <PageHeader title="Doctor profile" back={back} />
        <Card>
          <ErrorState error={doctor.error} onRetry={doctor.reload} />
        </Card>
      </>
    )
  }

  const d = doctor.data
  return (
    <>
      <PageHeader title={doctorName(d.full_name)} back={back} />
      <div className="layout-2col-wide">
        <div className="stack-lg">
          <Card>
            <CardBody>
              <div className="profile-header">
                <Avatar name={d.full_name} src={d.photo_url} size="xl" />
                <div className="stack-sm grow">
                  <div>
                    <div className="row-sm wrap">
                      <h2 style={{ fontSize: 'var(--text-xl)' }}>{doctorName(d.full_name)}</h2>
                      {d.verification_status === 'verified' && (
                        <span className="verified-mark">
                          <BadgeCheck aria-hidden="true" /> Verified
                        </span>
                      )}
                    </div>
                    <p className="muted">
                      {d.specialization.name}
                      {d.sub_specialization && ` · ${d.sub_specialization}`}
                    </p>
                  </div>
                  <p>{d.qualifications}</p>
                  <p className="text-sm muted">
                    {d.years_of_practice} years of practice
                    {d.clinic_affiliation && ` · ${d.clinic_affiliation}`}
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          {d.bio && (
            <Card>
              <CardHeader title="About" />
              <CardBody>
                <p className="pre-line">{d.bio}</p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Professional details" />
            <CardBody>
              <dl className="dl">
                <dt>Specialization</dt>
                <dd>{d.specialization.name}</dd>
                {d.sub_specialization && (
                  <>
                    <dt>Sub-specialization</dt>
                    <dd>{d.sub_specialization}</dd>
                  </>
                )}
                <dt>Qualifications</dt>
                <dd>{d.qualifications}</dd>
                {d.medical_institution && (
                  <>
                    <dt>Medical institution</dt>
                    <dd>{d.medical_institution}</dd>
                  </>
                )}
                <dt>License / registration ID</dt>
                <dd className="tabular">{d.license_number}</dd>
                <dt>Years of practice</dt>
                <dd>{d.years_of_practice}</dd>
                <dt>Languages</dt>
                <dd>{d.languages.join(', ') || '—'}</dd>
                {d.clinic_affiliation && (
                  <>
                    <dt>Clinic / hospital</dt>
                    <dd>{d.clinic_affiliation}</dd>
                  </>
                )}
                <dt>Consultation fee</dt>
                <dd>
                  {formatCurrency(d.consultation_fee)} for {d.consultation_duration_minutes} minutes
                </dd>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Weekly hours" description="Regular consultation hours in the clinic's time zone." />
            <CardBody>
              <WeeklySchedule rules={d.weekly_schedule} />
            </CardBody>
          </Card>
        </div>

        <div className="sticky">
          <BookingPanel doctor={d} />
        </div>
      </div>
    </>
  )
}
