import {
  CalendarClock,
  CalendarDays,
  ClipboardList,
  FileClock,
  HeartPulse,
  LayoutDashboard,
  Search,
  Stethoscope,
  Tags,
  UserRound,
  Users,
  Video,
} from 'lucide-react'

export const NAVIGATION = {
  patient: [
    { to: '/patient/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/patient/doctors', label: 'Find Doctors', icon: Search },
    { to: '/patient/appointments', label: 'Appointments', icon: CalendarDays },
    { to: '/patient/medical-history', label: 'Medical History', icon: HeartPulse },
    { to: '/patient/profile', label: 'Profile', icon: UserRound },
  ],
  doctor: [
    { to: '/doctor/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/doctor/appointments', label: 'Appointments', icon: CalendarDays },
    { to: '/doctor/patients', label: 'Patients', icon: Users },
    { to: '/doctor/availability', label: 'Availability', icon: CalendarClock },
    { to: '/doctor/consultations', label: 'Consultation History', icon: FileClock },
    { to: '/doctor/profile', label: 'Profile', icon: UserRound },
  ],
  admin: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin/doctors', label: 'Doctors', icon: Stethoscope },
    { to: '/admin/patients', label: 'Patients', icon: Users },
    { to: '/admin/appointments', label: 'Appointments', icon: ClipboardList },
    { to: '/admin/consultations', label: 'Consultations', icon: Video },
    { to: '/admin/specializations', label: 'Specializations', icon: Tags },
  ],
}

export const ROLE_LABEL = { patient: 'Patient', doctor: 'Doctor', admin: 'Administrator' }
