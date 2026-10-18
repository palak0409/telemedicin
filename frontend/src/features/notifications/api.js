import { api } from '../../services/apiClient'

export const listNotifications = (limit = 20) => api.get('/notifications', { limit })
export const markNotificationRead = (id) => api.post(`/notifications/${id}/read`)
export const markAllNotificationsRead = () => api.post('/notifications/read-all')
