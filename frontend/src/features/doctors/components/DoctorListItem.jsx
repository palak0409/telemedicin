import { BadgeCheck, Briefcase, Building2, GraduationCap, Languages } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Avatar } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { doctorName, formatCurrency, formatDayAndTime } from '../../../utils/format'

export function DoctorListItem({ doctor }) {
  const profileUrl = `/patient/doctors/${doctor.id}`
  return (
    <article className="doctor-row">
      <Avatar name={doctor.full_name} src={doctor.photo_url} size="lg" />
      <div style={{ minWidth: 0 }}>
        <div className="row-sm wrap">
          <Link to={profileUrl} className="doctor-row-name">
            {doctorName(doctor.full_name)}
          </Link>
          {doctor.verification_status === 'verified' && (
            <span className="verified-mark" title="Registration verified by the clinic">
              <BadgeCheck aria-hidden="true" /> Verified
            </span>
          )}
        </div>
        <div className="muted">
          {doctor.specialization.name}
          {doctor.sub_specialization && ` · ${doctor.sub_specialization}`}
        </div>
        <div className="doctor-meta">
          <span>
            <GraduationCap aria-hidden="true" /> {doctor.qualifications}
          </span>
          <span>
            <Briefcase aria-hidden="true" /> {doctor.years_of_practice} years experience
          </span>
          {doctor.languages.length > 0 && (
            <span>
              <Languages aria-hidden="true" /> {doctor.languages.join(', ')}
            </span>
          )}
          {doctor.clinic_affiliation && (
            <span>
              <Building2 aria-hidden="true" /> {doctor.clinic_affiliation}
            </span>
          )}
        </div>
      </div>
      <div className="doctor-row-aside">
        <div>
          <div className="fee">{formatCurrency(doctor.consultation_fee)}</div>
          <div className="text-xs subtle">per consultation</div>
        </div>
        <div className="next-slot">
          {doctor.next_available_at ? (
            <>
              Next available <strong>{formatDayAndTime(doctor.next_available_at)}</strong>
            </>
          ) : (
            'No openings in the next 2 weeks'
          )}
        </div>
        <Button to={profileUrl} size="sm" variant={doctor.next_available_at ? 'primary' : 'secondary'}>
          View profile
        </Button>
      </div>
    </article>
  )
}
