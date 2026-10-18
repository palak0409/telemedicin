/**
 * Real-time notifications.
 *
 * Loads the latest notifications over REST, then keeps a WebSocket open to
 * /ws/notifications for live pushes. The socket reconnects with exponential
 * backoff, and every (re)connect re-fetches the list so nothing sent while
 * offline is missed. Pages can subscribe to refresh themselves on new events.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { SOCKET_CLOSE, openSocket } from '../../services/socket'
import { listNotifications, markAllNotificationsRead, markNotificationRead } from './api'

const NotificationsContext = createContext(null)
const PING_INTERVAL_MS = 25000
const MAX_BACKOFF_MS = 30000

export function NotificationsProvider({ children }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const listeners = useRef(new Set())

  const refresh = useCallback(async () => {
    try {
      const result = await listNotifications(20)
      setItems(result.items)
      setUnreadCount(result.unread_count)
    } catch {
      // Non-critical: the bell simply keeps its previous state.
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setItems([])
      setUnreadCount(0)
      return undefined
    }

    let socket = null
    let retryTimer = null
    let attempts = 0
    let disposed = false

    const connect = () => {
      socket = openSocket('/ws/notifications', {
        onMessage: (message) => {
          if (message.type === 'ready') {
            attempts = 0
            refresh()
          } else if (message.type === 'notification') {
            const notification = message.data
            setItems((list) => [notification, ...list.filter((n) => n.id !== notification.id)].slice(0, 20))
            setUnreadCount((count) => count + 1)
            showToast({ title: notification.title, message: notification.message, link: notification.link })
            listeners.current.forEach((listener) => listener(notification))
          }
        },
        onClose: (event) => {
          if (disposed || event.code === SOCKET_CLOSE.UNAUTHORIZED) return
          const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempts)
          attempts += 1
          retryTimer = setTimeout(connect, delay)
        },
      })
    }

    connect()
    const pingTimer = setInterval(() => socket?.send('ping'), PING_INTERVAL_MS)
    return () => {
      disposed = true
      clearTimeout(retryTimer)
      clearInterval(pingTimer)
      socket?.close()
    }
  }, [user?.id, refresh, showToast])

  const markRead = useCallback(async (id) => {
    setItems((list) => list.map((n) => (n.id === id && !n.is_read ? { ...n, is_read: true } : n)))
    setUnreadCount((count) => Math.max(0, count - 1))
    await markNotificationRead(id).catch(() => {})
  }, [])

  const markAllRead = useCallback(async () => {
    setItems((list) => list.map((n) => ({ ...n, is_read: true })))
    setUnreadCount(0)
    await markAllNotificationsRead().catch(() => {})
  }, [])

  const subscribe = useCallback((listener) => {
    listeners.current.add(listener)
    return () => listeners.current.delete(listener)
  }, [])

  const value = useMemo(
    () => ({ items, unreadCount, markRead, markAllRead, subscribe, refresh }),
    [items, unreadCount, markRead, markAllRead, subscribe, refresh],
  )

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

export function useNotifications() {
  return useContext(NotificationsContext)
}

/** Runs `handler(notification)` whenever a live notification arrives, e.g. to reload a list. */
export function useNotificationEvents(handler) {
  const { subscribe } = useNotifications()
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  useEffect(() => subscribe((notification) => handlerRef.current(notification)), [subscribe])
}
