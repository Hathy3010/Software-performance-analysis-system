import PropTypes from 'prop-types'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth, useRole } from '@/contexts/AuthContext'
import { ToastProvider } from '@/contexts/ToastContext'
import { TimeRangeProvider } from '@/contexts/TimeRangeContext'
import { useAlertNotifications } from '@/hooks/useAlertNotifications'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Metrics from '@/pages/Metrics'
import Incidents from '@/pages/Incidents'
import Services from '@/pages/Services'
import Traces from '@/pages/Traces'
import ServiceMap from '@/pages/ServiceMap'
import Analytics from '@/pages/Analytics'
import Logs from '@/pages/Logs'
import Settings from '@/pages/Settings'
import AdminUsers from '@/pages/admin/Users'

function AlertBanner() {
  const { alarmActive, criticalAlerts, stopAlarm } = useAlertNotifications()

  if (!alarmActive) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-4 bg-red-600 px-4 py-2 text-white shadow-lg">
      <div className="flex items-center gap-3">
        <span className="animate-pulse text-lg font-bold">🚨</span>
        <span className="text-sm font-semibold">
          {criticalAlerts.length === 1
            ? `CRITICAL: ${criticalAlerts[0].name}`
            : `${criticalAlerts.length} CRITICAL alerts firing`}
        </span>
      </div>
      <button
        onClick={stopAlarm}
        className="rounded border border-red-300 px-3 py-1 text-xs font-medium hover:bg-red-700 transition-colors"
      >
        Silence Alarm
      </button>
    </div>
  )
}

function AlertListener() {
  const { token } = useAuth()
  if (!token) return null
  return <AlertBanner />
}

function PrivateRoute({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" replace />
}
PrivateRoute.propTypes = { children: PropTypes.node.isRequired }

function AnalystRoute({ children }) {
  const { token } = useAuth()
  const { isAnalyst } = useRole()
  if (!token) return <Navigate to="/login" replace />
  if (!isAnalyst) return <Navigate to="/" replace />
  return children
}
AnalystRoute.propTypes = { children: PropTypes.node.isRequired }

function AdminRoute({ children }) {
  const { token } = useAuth()
  const { isAdmin } = useRole()
  if (!token) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return children
}
AdminRoute.propTypes = { children: PropTypes.node.isRequired }

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <TimeRangeProvider>
            <AlertListener />
            <Routes>
              <Route path="/login"        element={<Login />} />
              <Route path="/"             element={<PrivateRoute><Dashboard /></PrivateRoute>} />
              <Route path="/metrics"      element={<PrivateRoute><Metrics /></PrivateRoute>} />
              <Route path="/logs"         element={<PrivateRoute><Logs /></PrivateRoute>} />
              <Route path="/incidents"    element={<PrivateRoute><Incidents /></PrivateRoute>} />
              <Route path="/services"     element={<PrivateRoute><Services /></PrivateRoute>} />
              <Route path="/traces"       element={<AnalystRoute><Traces /></AnalystRoute>} />
              <Route path="/service-map"  element={<AnalystRoute><ServiceMap /></AnalystRoute>} />
              <Route path="/analytics"    element={<AnalystRoute><Analytics /></AnalystRoute>} />
              <Route path="/settings"     element={<PrivateRoute><Settings /></PrivateRoute>} />
              <Route path="/admin/users"  element={<AdminRoute><AdminUsers /></AdminRoute>} />
              <Route path="*"             element={<Navigate to="/" replace />} />
            </Routes>
          </TimeRangeProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
