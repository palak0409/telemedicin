export const ROLES = { PATIENT: 'patient', DOCTOR: 'doctor', ADMIN: 'admin' }

export const ROLE_HOME = {
  patient: '/patient/dashboard',
  doctor: '/doctor/dashboard',
  admin: '/admin/dashboard',
}

export const APPOINTMENT_STATUS = {
  pending: { label: 'Awaiting confirmation', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  rejected: { label: 'Declined', tone: 'danger' },
}

export const VERIFICATION_STATUS = {
  pending: { label: 'Pending review', tone: 'warning' },
  verified: { label: 'Verified', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  suspended: { label: 'Suspended', tone: 'danger' },
}

export const CONSULTATION_STATUS = {
  waiting: { label: 'Waiting', tone: 'warning' },
  active: { label: 'In progress', tone: 'info' },
  ended: { label: 'Ended', tone: 'neutral' },
}

export const GENDER_OPTIONS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

export const genderLabel = (value) => GENDER_OPTIONS.find((g) => g.value === value)?.label ?? null

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export const EXPERIENCE_FILTERS = [
  { value: '', label: 'Any experience' },
  { value: '5', label: '5+ years' },
  { value: '10', label: '10+ years' },
  { value: '15', label: '15+ years' },
  { value: '20', label: '20+ years' },
]

export const CONSULTATION_DURATIONS = [15, 20, 30, 45, 60]
