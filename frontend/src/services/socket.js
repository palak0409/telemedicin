/**
 * Authenticated WebSocket helper shared by notifications and call signaling.
 *
 * Every message uses the envelope {type, data}. Browsers cannot attach an
 * Authorization header to a WebSocket, so the JWT is sent as the first
 * message ({type: "auth", token}) rather than in the URL.
 */
import { API_BASE_URL } from './apiClient'
import { tokenStorage } from './tokenStorage'

export function socketUrl(path) {
  if (/^https?:\/\//.test(API_BASE_URL)) {
    const origin = new URL(API_BASE_URL).origin
    return origin.replace(/^http/, 'ws') + path
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}

export function openSocket(path, { onOpen, onMessage, onClose } = {}) {
  const ws = new WebSocket(socketUrl(path))
  let closedByClient = false

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'auth', token: tokenStorage.get() }))
    onOpen?.()
  }
  ws.onmessage = (event) => {
    let message
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }
    onMessage?.(message)
  }
  ws.onclose = (event) => {
    if (!closedByClient) onClose?.(event)
  }

  return {
    send(type, data = {}) {
      if (ws.readyState !== WebSocket.OPEN) return false
      ws.send(JSON.stringify({ type, data }))
      return true
    },
    close() {
      closedByClient = true
      if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) ws.close(1000)
    },
  }
}

export const SOCKET_CLOSE = {
  UNAUTHORIZED: 4401,
  FORBIDDEN: 4403,
  REPLACED: 4409,
}
