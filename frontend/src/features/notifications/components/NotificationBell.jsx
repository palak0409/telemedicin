import { Bell } from 'lucide-react'
import { useRef, useState } from 'react'
import { useClickOutside } from '../../../hooks/useClickOutside'
import { useNotifications } from '../NotificationsContext'
import { NotificationList } from './NotificationList'

export function NotificationBell() {
  const { unreadCount, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside(ref, () => setOpen(false), open)

  return (
    <div className="dropdown" ref={ref}>
      <button
        type="button"
        className="icon-button"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell />
        {unreadCount > 0 && <span className="count-indicator">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="dropdown-panel notifications-panel">
          <div className="dropdown-header row-between">
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button type="button" className="link-button text-sm" onClick={markAllRead}>
                Mark all as read
              </button>
            )}
          </div>
          <NotificationList onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
