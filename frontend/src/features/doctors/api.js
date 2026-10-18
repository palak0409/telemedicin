import { api } from '../../services/apiClient'

export const listSpecializations = () => api.get('/specializations')
export const listLanguages = () => api.get('/doctors/languages')
export const searchDoctors = (params) => api.get('/doctors', params)
export const getDoctor = (doctorId) => api.get(`/doctors/${doctorId}`)
export const getDoctorSlots = (doctorId, startDate, days = 7) =>
  api.get(`/doctors/${doctorId}/slots`, { start_date: startDate, days })

export const getMyDoctorProfile = () => api.get('/doctors/me/profile')
export const updateMyDoctorProfile = (data) => api.put('/doctors/me/profile', data)
export const getMyAvailability = () => api.get('/doctors/me/availability')
export const updateMyAvailability = (data) => api.put('/doctors/me/availability', data)
export const addTimeOff = (data) => api.post('/doctors/me/time-off', data)
export const deleteTimeOff = (id) => api.delete(`/doctors/me/time-off/${id}`)
