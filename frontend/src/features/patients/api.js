import { api } from '../../services/apiClient'

export const getMedicalProfile = () => api.get('/patients/me/medical-profile')
export const updateMedicalProfile = (data) => api.put('/patients/me/medical-profile', data)
export const listMyPatients = (q) => api.get('/patients', { q })
export const getPatientRecord = (id) => api.get(`/patients/${id}`)
