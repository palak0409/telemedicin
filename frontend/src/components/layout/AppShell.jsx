import { Menu } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { NotificationBell } from '../../features/notifications/components/NotificationBell'
import { useNotificationEvents } from '../../features/notifications/NotificationsContext'
import { ROLE_HOME } from '../../utils/constants'
import { BrandMark, PRODUCT_NAME } from './BrandMark'
import { NAVIGATION, ROLE_LABEL } from './navigation'
import { UserMenu } from './UserMenu'

/** Authenticated layout: role-specific sidebar, top bar with notifications, and page outlet. */
export function AppShell() {
  const { user, refreshUser } = useAuth()
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setNavOpen(false), [location.pathname])
  // A doctor's verification status is part of the signed-in user; refresh it when an admin changes it.
  useNotificationEvents((n) => n.type === 'verification_updated' && refreshUser())

  return (
    <div className={`app-shell ${navOpen ? 'nav-open' : ''}`}>
      <aside className="sidebar" aria-label="Main navigation">
        <Link to={ROLE_HOME[user.role]} className="sidebar-brand">
          <BrandMark />
          {PRODUCT_NAME}
        </Link>
        <nav className="sidebar-nav">
          <ul>
            {NAVIGATION[user.role].map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink to={to} className="nav-link">
                  <Icon aria-hidden="true" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-footer">Signed in as {ROLE_LABEL[user.role].toLowerCase()}</div>
      </aside>
      <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-button topbar-menu" aria-label="Open navigation" onClick={() => setNavOpen(true)}>
            <Menu />
          </button>
          <div className="topbar-spacer" />
          <NotificationBell />
          <UserMenu />
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
