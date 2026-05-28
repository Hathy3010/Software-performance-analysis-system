import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { authApi } from '@/api/auth'

const AuthContext = createContext(null)

function parseToken(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return { id: payload.sub, role: payload.role }
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('access_token'))
  const [user, setUser] = useState(() => {
    const t = localStorage.getItem('access_token')
    return t ? parseToken(t) : null
  })
  const [loading, setLoading] = useState(false)

  const login = useCallback(async (username, password) => {
    setLoading(true)
    try {
      const data = await authApi.login(username, password)
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      setToken(data.access_token)
      setUser(parseToken(data.access_token))
      return { ok: true }
    } catch (err) {
      return { ok: false, message: err.response?.data?.detail ?? 'Login failed' }
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function useRole() {
  const { user } = useAuth()
  const role = user?.role ?? 'viewer'
  return {
    role,
    isAdmin:   role === 'admin',
    isAnalyst: role === 'analyst' || role === 'admin',
    isViewer:  role === 'viewer',
    can: (action) => {
      const permissions = {
        acknowledge_alert:  ['admin', 'analyst'],
        create_incident:    ['admin', 'analyst'],
        close_incident:     ['admin', 'analyst'],
        view_traces:        ['admin', 'analyst'],
        view_analytics:     ['admin', 'analyst'],
        view_service_map:   ['admin', 'analyst'],
      }
      return (permissions[action] ?? ['admin', 'analyst', 'viewer']).includes(role)
    },
  }
}
