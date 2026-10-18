import { Video } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Person } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { doctorName, formatDate, formatTimeRange } from '../../../utils/format'
import { AppointmentStatusBadge } from './AppointmentStatusBadge'

/**
 * Appointment list for patients and doctors. The "other party" column shows the
 * doctor to patients and the patient to doctors.
 */
export function AppointmentTable({ appointments, role, actions, showReason = true }) {
  const navigate = useNavigate()
  const isDoctor = role === 'doctor'
  const detailUrl = (a) => `/${role}/appointments/${a.id}`

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Date &amp; time</th>
            <th>{isDoctor ? 'Patient' : 'Doctor'}</th>
            {showReason && <th>Reason for visit</th>}
            <th>Status</th>
            <th className="cell-actions">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((a) => (
            <tr key={a.id} className="table-row-link" onClick={() => navigate(detailUrl(a))}>
              <td className="nowrap">
                {formatDate(a.start_time)}
                <span className="cell-sub tabular">{formatTimeRange(a.start_time, a.end_time)}</span>
              </td>
              <td>
                {isDoctor ? (
                  <Person name={a.patient.full_name} src={a.patient.photo_url} />
                ) : (
                  <Person name={doctorName(a.doctor.full_name)} src={a.doctor.photo_url} meta={a.doctor.specialization} />
                )}
              </td>
              {showReason && (
                <td style={{ maxWidth: 280 }}>
                  <span className="truncate" style={{ display: 'block' }}>
                    {a.reason}
                  </span>
                </td>
              )}
              <td>
                <AppointmentStatusBadge appointment={a} />
              </td>
              <td className="cell-actions" onClick={(event) => event.stopPropagation()}>
                <div className="row-sm">
                  {a.can_join && (
                    <Button size="sm" icon={Video} to={`/consultation/${a.id}`}>
                      Join
                    </Button>
                  )}
                  {actions?.(a)}
                  {!a.can_join && !actions && (
                    <Button size="sm" variant="ghost" to={detailUrl(a)}>
                      View
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
