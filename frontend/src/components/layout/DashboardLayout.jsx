import PropTypes from 'prop-types'
import { Navigate } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { useAuth } from '@/contexts/AuthContext'
import { useTimeRange, RANGE_OPTIONS } from '@/contexts/TimeRangeContext'

function TimeRangePicker() {
  const { range, setRange } = useTimeRange()
  return (
    <div className="flex items-center gap-1.5">
      <Clock className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
      {RANGE_OPTIONS.map((o) => (
        <button
          key={o.label}
          onClick={() => setRange(o)}
          className={`h-7 px-2.5 rounded text-xs font-medium transition-colors ${
            range.label === o.label
              ? 'bg-blue-600/15 text-blue-400 border border-blue-800/50'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function DashboardLayout({ children }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-50 overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center justify-end h-10 px-6 border-b border-zinc-800 bg-zinc-900/40 shrink-0">
          <TimeRangePicker />
        </div>
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}

DashboardLayout.propTypes = { children: PropTypes.node.isRequired }

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">{title}</h1>
        {subtitle && <p className="text-sm text-zinc-400 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  )
}

PageHeader.propTypes = {
  title:    PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  action:   PropTypes.node,
}
