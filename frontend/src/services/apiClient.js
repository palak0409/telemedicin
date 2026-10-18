/**
 * Shared HTTP client used by every feature's api.js.
 *
 * Adds the API base URL and JWT, serializes JSON, and converts FastAPI error
 * responses into an ApiError with a readable message and per-field errors.
 */
import { tokenStorage } from './tokenStorage'

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, status, fieldErrors = {}) {
    super(message)
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

let onUnauthorized = null

/** Called when an authenticated request is rejected with 401 (expired or revoked session). */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

function buildUrl(path, query) {
  const url = `${API_BASE_URL}${path}`
  if (!query) return url
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.append(key, value)
  })
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

function cleanMessage(message = '') {
  return message.replace(/^Value error, /, '')
}

function toApiError(status, data) {
  const detail = data?.detail
  if (Array.isArray(detail)) {
    const fieldErrors = {}
    detail.forEach((item) => {
      const field = [...(item.loc || [])].reverse().find((part) => typeof part === 'string' && part !== 'body')
      if (field && !fieldErrors[field]) fieldErrors[field] = cleanMessage(item.msg)
    })
    const message = Object.keys(fieldErrors).length
      ? 'Please check the highlighted fields.'
      : cleanMessage(detail[0]?.msg) || 'Please check your input.'
    return new ApiError(message, status, fieldErrors)
  }
  if (typeof detail === 'string') return new ApiError(detail, status)
  if (status >= 500) return new ApiError('The server encountered a problem. Please try again shortly.', status)
  return new ApiError('Something went wrong. Please try again.', status)
}

async function request(path, { method = 'GET', body, query, signal } = {}) {
  const headers = {}
  const token = tokenStorage.get()
  if (token) headers.Authorization = `Bearer ${token}`

  let payload
  if (body instanceof FormData) {
    payload = body
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let response
  try {
    response = await fetch(buildUrl(path, query), { method, headers, body: payload, signal })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new ApiError('Unable to reach the server. Check your connection and try again.', 0)
  }

  if (response.status === 204) return null
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401 && token) onUnauthorized?.()
    throw toApiError(response.status, data)
  }
  return data
}

export const api = {
  get: (path, query, options) => request(path, { ...options, query }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
}
