/**
 * Central authentication state: the current user, sign-in/out and session restore.
 *
 * On load, a stored token is validated by calling /auth/me; any 401 from the API
 * afterwards (expired token, deactivated account) signs the user out.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as authApi from '../features/auth/api'
import { setUnauthorizedHandler } from '../services/apiClient'
import { tokenStorage } from '../services/tokenStorage'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState(() => (tokenStorage.get() ? 'loading' : 'anonymous'))

  const logout = useCallback(() => {
    tokenStorage.clear()
    setUser(null)
    setStatus('anonymous')
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    if (!tokenStorage.get()) return
    authApi
      .fetchCurrentUser()
      .then((me) => {
        setUser(me)
        setStatus('authenticated')
      })
      .catch(logout)
  }, [logout])

  const startSession = useCallback(({ access_token, user: signedIn }) => {
    tokenStorage.set(access_token)
    setUser(signedIn)
    setStatus('authenticated')
    return signedIn
  }, [])

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      login: async (email, password) => startSession(await authApi.login(email, password)),
      registerPatient: async (data) => startSession(await authApi.registerPatient(data)),
      registerDoctor: async (data) => startSession(await authApi.registerDoctor(data)),
      refreshUser: async () => setUser(await authApi.fetchCurrentUser()),
      setUser,
      logout,
    }),
    [user, status, startSession, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
