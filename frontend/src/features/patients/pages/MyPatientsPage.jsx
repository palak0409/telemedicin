import { Search, Users } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Person } from '../../../components/ui/Avatar'
import { Card } from '../../../components/ui/Card'
import { PageHeader } from '../../../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import { useApi } from '../../../hooks/useApi'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue'
import { genderLabel } from '../../../utils/constants'
import { formatDayAndTime, formatShortDate } from '../../../utils/format'
import { listMyPatients } from '../api'

export function MyPatientsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const q = useDebouncedValue(search.trim())
  const patients = useApi(() => listMyPatients(q), [q])

  return (
    <>
      <PageHeader title="Patients" description="Patients who have booked consultations with you." />
      <Card>
        <div className="card-header">
          <div className="input-with-icon" style={{ width: '100%', maxWidth: 320 }}>
            <Search aria-hidden="true" />
            <input className="input" type="search" placeholder="Search by name" aria-label="Search patients" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {patients.loading && !patients.data ? (
          <LoadingState />
        ) : patients.error ? (
          <ErrorState error={patients.error} onRetry={patients.reload} />
        ) : patients.data.length === 0 ? (
          <EmptyState
            icon={Users}
            title={q ? 'No matching patients' : 'No patients yet'}
            description="Patients appear here once they request an appointment with you."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Age / gender</th>
                  <th>Visits</th>
                  <th>Last consultation</th>
                  <th>Next appointment</th>
                </tr>
              </thead>
              <tbody>
                {patients.data.map((p) => (
                  <tr key={p.id} className="table-row-link" onClick={() => navigate(`/doctor/patients/${p.id}`)}>
                    <td>
                      <Person name={p.full_name} src={p.photo_url} />
                    </td>
                    <td className="nowrap">
                      {[p.age != null && `${p.age} y`, genderLabel(p.gender)].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="tabular">{p.total_appointments}</td>
                    <td className="nowrap">{p.last_visit_at ? formatShortDate(p.last_visit_at) : '—'}</td>
                    <td className="nowrap">{p.next_appointment_at ? formatDayAndTime(p.next_appointment_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
