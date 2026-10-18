import { useNavigate } from 'react-router-dom'
import { Person } from '../../../components/ui/Avatar'
import { StatusBadge } from '../../../components/ui/Badge'
import { CONSULTATION_STATUS } from '../../../utils/constants'
import { doctorName, formatDate, formatDuration, formatTime } from '../../../utils/format'

export function ConsultationHistoryTable({ consultations, role }) {
  const navigate = useNavigate()
  const isDoctor = role === 'doctor'

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>{isDoctor ? 'Patient' : 'Doctor'}</th>
            <th>Duration</th>
            <th>Summary</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {consultations.map((c) => (
            <tr key={c.id} className="table-row-link" onClick={() => navigate(`/${role}/appointments/${c.appointment_id}`)}>
              <td className="nowrap">
                {formatDate(c.scheduled_start)}
                <span className="cell-sub tabular">{formatTime(c.started_at || c.scheduled_start)}</span>
              </td>
              <td>
                {isDoctor ? (
                  <Person name={c.patient.full_name} src={c.patient.photo_url} />
                ) : (
                  <Person name={doctorName(c.doctor.full_name)} src={c.doctor.photo_url} meta={c.doctor.specialization} />
                )}
              </td>
              <td className="tabular nowrap">{c.started_at ? formatDuration(c.duration_seconds) : 'Not connected'}</td>
              <td style={{ maxWidth: 360 }}>
                <span className="truncate" style={{ display: 'block' }}>
                  {c.summary?.assessment || c.summary?.chief_complaint || c.notes || (
                    <span className="subtle">{isDoctor && c.documentation_status === 'ready_for_review' ? 'Draft awaiting your review' : 'No summary yet'}</span>
                  )}
                </span>
              </td>
              <td>
                <StatusBadge map={CONSULTATION_STATUS} value={c.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
