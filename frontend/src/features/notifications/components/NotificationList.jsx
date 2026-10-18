import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../../components/ui/States'
import { formatRelative } from '../../../utils/format'
import { useNotifications } from '../NotificationsContext'

export function NotificationList({ limit, onNavigate }) {
  const { items, markRead } = useNotifications()
  const visible = limit ? items.slice(0, limit) : items

  if (!visible.length) {
    return <EmptyState compact icon={Bell} title="No notifications" description="Appointment updates will appear here." />
  }

  return (
    <ul className="list">
      {visible.map((notification) => {
        const content = (
          <>
            <span className="notification-dot" aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <div className="notification-title">
                {!notification.is_read && <span className="sr-only">Unread: </span>}
                {notification.title}
              </div>
              <div className="notification-message">{notification.message}</div>
              <div className="notification-time">{formatRelative(notification.created_at)}</div>
            </div>
          </>
        )
        const className = `notification-item ${notification.is_read ? '' : 'unread'}`
        const handleClick = () => {
          if (!notification.is_read) markRead(notification.id)
          onNavigate?.()
        }
        return (
          <li key={notification.id}>
            {notification.link ? (
              <Link to={notification.link} className={className} onClick={handleClick}>
                {content}
              </Link>
            ) : (
              <div className={className} onClick={handleClick}>
                {content}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
