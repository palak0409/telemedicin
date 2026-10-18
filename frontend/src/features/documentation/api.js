import { api } from '../../services/apiClient'

const EXTENSIONS = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a' }

export const getDocumentationConfig = () => api.get('/documentation/config')
export const getDocumentation = (consultationId) => api.get(`/consultations/${consultationId}/documentation`)
export const saveDocumentationDraft = (consultationId, data) => api.put(`/consultations/${consultationId}/documentation`, data)
export const approveDocumentation = (consultationId, data) =>
  api.post(`/consultations/${consultationId}/documentation/approve`, data)
export const retryDocumentation = (consultationId) => api.post(`/consultations/${consultationId}/documentation/retry`)

/** Uploads per-speaker recordings; the server transcribes and summarizes them in the background. */
export function uploadRecordings(consultationId, recordings) {
  const form = new FormData()
  recordings.forEach(({ speaker, offset, blob }, index) => {
    const extension = EXTENSIONS[blob.type.split(';')[0]] ?? 'webm'
    form.append('files', blob, `${speaker}-${index}.${extension}`)
    form.append('speakers', speaker)
    form.append('offsets', String(offset))
  })
  return api.post(`/consultations/${consultationId}/documentation/recordings`, form)
}
