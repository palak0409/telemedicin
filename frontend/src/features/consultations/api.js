import { api } from '../../services/apiClient'

export const joinConsultation = (appointmentId) => api.post('/consultations/join', { appointment_id: appointmentId })
export const listConsultations = (params) => api.get('/consultations', params)
export const updateConsultationNotes = (id, notes) => api.put(`/consultations/${id}/notes`, { notes })
