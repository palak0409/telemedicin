import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullPageLoader } from '../components/ui/States'
import { useAuth } from '../context/AuthContext'
import { ROLE_HOME } from '../utils/constants'

/**
 * Renders child routes only for signed-in users with one of `roles`.
 * Anonymous users go to /login (and come back afterwards); users with another
 * role are sent to their own dashboard. The backend enforces the same rules.
 */
export function ProtectedRoute({ roles }) {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullPageLoader />
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location }} />
  if (roles && !roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role]} replace />
  return <Outlet />
}

/** Login and registration are only for signed-out visitors. */
export function PublicOnlyRoute() {
  const { status, user } = useAuth()
  if (status === 'loading') return <FullPageLoader />
  if (status === 'authenticated') return <Navigate to={ROLE_HOME[user.role]} replace />
  return <Outlet />
}

export function HomeRedirect() {
  const { status, user } = useAuth()
  if (status === 'loading') return <FullPageLoader />
  return <Navigate to={status === 'authenticated' ? ROLE_HOME[user.role] : '/login'} replace />
}
