import { useParams } from 'react-router-dom'
import { Avatar } from '../../../components/ui/Avatar'
import { Card, CardBody, CardHeader } from '../../../components/ui/Card'
import { PageHeader } from '../../../components/ui/PageHeader'
import { ErrorState, LoadingState } from '../../../components/ui/States'
import { useApi } from '../../../hooks/useApi'
import { genderLabel } from '../../../utils/constants'
import { AppointmentTable } from '../../appointments/components/AppointmentTable'
import { getPatientRecord } from '../api'
import { MedicalSummary } from '../components/MedicalSummary'

export function PatientRecordPage() {
  const { patientId } = useParams()
  const record = useApi(() => getPatientRecord(patientId), [patientId])
  const back = { to: '/doctor/patients', label: 'All patients' }

  if (record.loading && !record.data) return <LoadingState />
  if (record.error) {
    return (
      <>
        <PageHeader title="Patient record" back={back} />
        <Card>
          <ErrorState error={record.error} onRetry={record.reload} />
        </Card>
      </>
    )
  }

  const p = record.data
  return (
    <>
      <PageHeader title={p.full_name} back={back} />
      <div className="layout-2col">
        <div className="stack-lg">
          <Card>
            <CardHeader title="Medical information" description="Provided and maintained by the patient." />
            <CardBody>
              <MedicalSummary medical={p.medical} age={p.age} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Appointments with you" />
            <AppointmentTable appointments={p.appointments} role="doctor" />
          </Card>
        </div>
        <Card>
          <CardBody className="stack">
            <div className="row">
              <Avatar name={p.full_name} src={p.photo_url} size="lg" />
              <div>
                <div className="strong">{p.full_name}</div>
                <div className="text-sm muted">
                  {[p.age != null && `${p.age} years`, genderLabel(p.medical.gender)].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>
            <dl className="dl-stacked dl-single">
              <div>
                <dt>Email</dt>
                <dd>{p.email}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{p.phone || '—'}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
