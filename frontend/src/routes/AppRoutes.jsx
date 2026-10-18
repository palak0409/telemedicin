import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { AdminAppointmentsPage } from '../features/admin/pages/AdminAppointmentsPage'
import { AdminConsultationsPage } from '../features/admin/pages/AdminConsultationsPage'
import { AdminDashboardPage } from '../features/admin/pages/AdminDashboardPage'
import { AdminDoctorDetailPage } from '../features/admin/pages/AdminDoctorDetailPage'
import { AdminDoctorsPage } from '../features/admin/pages/AdminDoctorsPage'
import { AdminPatientsPage } from '../features/admin/pages/AdminPatientsPage'
import { AdminSpecializationsPage } from '../features/admin/pages/AdminSpecializationsPage'
import { AppointmentDetailPage } from '../features/appointments/pages/AppointmentDetailPage'
import { AppointmentsPage } from '../features/appointments/pages/AppointmentsPage'
import { LoginPage } from '../features/auth/pages/LoginPage'
import { RegisterPage } from '../features/auth/pages/RegisterPage'
import { ConsultationHistoryPage } from '../features/consultations/pages/ConsultationHistoryPage'
import { ConsultationRoomPage } from '../features/consultations/pages/ConsultationRoomPage'
import { AvailabilityPage } from '../features/doctors/pages/AvailabilityPage'
import { DoctorDashboardPage } from '../features/doctors/pages/DoctorDashboardPage'
import { DoctorProfilePage } from '../features/doctors/pages/DoctorProfilePage'
import { DoctorSettingsPage } from '../features/doctors/pages/DoctorSettingsPage'
import { FindDoctorsPage } from '../features/doctors/pages/FindDoctorsPage'
import { MedicalHistoryPage } from '../features/patients/pages/MedicalHistoryPage'
import { MyPatientsPage } from '../features/patients/pages/MyPatientsPage'
import { PatientDashboardPage } from '../features/patients/pages/PatientDashboardPage'
import { PatientProfilePage } from '../features/patients/pages/PatientProfilePage'
import { PatientRecordPage } from '../features/patients/pages/PatientRecordPage'
import { HomeRedirect, ProtectedRoute, PublicOnlyRoute } from './guards'
import { NotFoundPage } from './NotFoundPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />

      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute roles={['patient']} />}>
        <Route element={<AppShell />}>
          <Route path="/patient" element={<Navigate to="/patient/dashboard" replace />} />
          <Route path="/patient/dashboard" element={<PatientDashboardPage />} />
          <Route path="/patient/doctors" element={<FindDoctorsPage />} />
          <Route path="/patient/doctors/:doctorId" element={<DoctorProfilePage />} />
          <Route path="/patient/appointments" element={<AppointmentsPage />} />
          <Route path="/patient/appointments/:appointmentId" element={<AppointmentDetailPage />} />
          <Route path="/patient/medical-history" element={<MedicalHistoryPage />} />
          <Route path="/patient/profile" element={<PatientProfilePage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['doctor']} />}>
        <Route element={<AppShell />}>
          <Route path="/doctor" element={<Navigate to="/doctor/dashboard" replace />} />
          <Route path="/doctor/dashboard" element={<DoctorDashboardPage />} />
          <Route path="/doctor/appointments" element={<AppointmentsPage />} />
          <Route path="/doctor/appointments/:appointmentId" element={<AppointmentDetailPage />} />
          <Route path="/doctor/patients" element={<MyPatientsPage />} />
          <Route path="/doctor/patients/:patientId" element={<PatientRecordPage />} />
          <Route path="/doctor/availability" element={<AvailabilityPage />} />
          <Route path="/doctor/consultations" element={<ConsultationHistoryPage />} />
          <Route path="/doctor/profile" element={<DoctorSettingsPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['admin']} />}>
        <Route element={<AppShell />}>
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="/admin/doctors" element={<AdminDoctorsPage />} />
          <Route path="/admin/doctors/:doctorId" element={<AdminDoctorDetailPage />} />
          <Route path="/admin/patients" element={<AdminPatientsPage />} />
          <Route path="/admin/appointments" element={<AdminAppointmentsPage />} />
          <Route path="/admin/consultations" element={<AdminConsultationsPage />} />
          <Route path="/admin/specializations" element={<AdminSpecializationsPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['patient', 'doctor']} />}>
        <Route path="/consultation/:appointmentId" element={<ConsultationRoomPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
