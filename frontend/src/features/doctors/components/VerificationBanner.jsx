import { Link } from 'react-router-dom'
import { Alert } from '../../../components/ui/Alert'

/** Explains why a doctor who is not yet verified is invisible to patients. */
export function VerificationBanner({ status, note, showProfileLink = true }) {
  if (!status || status === 'verified') return null
  const profileLink = showProfileLink && <Link to="/doctor/profile">Review your profile</Link>

  if (status === 'pending') {
    return (
      <Alert tone="warning" title="Your profile is under review">
        Patients cannot find or book you until an administrator verifies your registration. You can complete your
        profile and set your availability in the meantime. {profileLink}
      </Alert>
    )
  }
  if (status === 'rejected') {
    return (
      <Alert tone="danger" title="Verification was not approved">
        {note && <p>Reason: {note}</p>}
        <p>Update your professional details and save them to resubmit for review. {profileLink}</p>
      </Alert>
    )
  }
  return (
    <Alert tone="danger" title="Your profile is suspended">
      {note && <p>Reason: {note}</p>}
      <p>Your profile is hidden from patients. Please contact the clinic administrator.</p>
    </Alert>
  )
}
