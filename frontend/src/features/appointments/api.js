import { api } from '../../services/apiClient'

export const listAppointments = (params) => api.get('/appointments', params)
export const getAppointment = (id) => api.get(`/appointments/${id}`)
export const bookAppointment = (data) => api.post('/appointments', data)
export const acceptAppointment = (id) => api.post(`/appointments/${id}/accept`)
export const rejectAppointment = (id, reason) => api.post(`/appointments/${id}/reject`, { reason })
export const cancelAppointment = (id, reason) => api.post(`/appointments/${id}/cancel`, { reason })
