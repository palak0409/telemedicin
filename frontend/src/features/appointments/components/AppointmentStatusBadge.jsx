import { Badge } from '../../../components/ui/Badge'
import { APPOINTMENT_STATUS } from '../../../utils/constants'

/**
 * Status as the user should understand it. A pending request whose time has
 * passed is shown as expired, and a confirmed visit nobody joined as missed.
 */
export function appointmentStatus(appointment) {
  const now = Date.now()
  if (appointment.status === 'pending' && new Date(appointment.start_time).getTime() < now) {
    return { label: 'Expired', tone: 'neutral' }
  }
  if (
    appointment.status === 'confirmed' &&
    !appointment.can_join &&
    new Date(appointment.end_time).getTime() < now
  ) {
    return { label: 'Missed', tone: 'neutral' }
  }
  if (appointment.consultation?.status === 'active') return { label: 'In progress', tone: 'info' }
  return APPOINTMENT_STATUS[appointment.status] ?? { label: appointment.status, tone: 'neutral' }
}

export function AppointmentStatusBadge({ appointment }) {
  const { label, tone } = appointmentStatus(appointment)
  return <Badge tone={tone}>{label}</Badge>
}
