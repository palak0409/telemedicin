import { api } from '../../services/apiClient'

export const login = (email, password) => api.post('/auth/login', { email, password })
export const registerPatient = (data) => api.post('/auth/register/patient', data)
export const registerDoctor = (data) => api.post('/auth/register/doctor', data)
export const fetchCurrentUser = () => api.get('/auth/me')

export const updateAccount = (data) => api.patch('/users/me', data)
export const changePassword = (data) => api.post('/users/me/password', data)
export const removePhoto = () => api.delete('/users/me/photo')
export function uploadPhoto(file) {
  const form = new FormData()
  form.append('file', file)
  return api.post('/users/me/photo', form)
}
