import PropTypes from 'prop-types'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Activity, AlertTriangle,
  Server, LogOut, Cpu, GitBranch, Network, BarChart2,
  ScrollText, Shield, User, Users, Settings, ChevronDown,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/utils/cn'
import { useAuth } from '@/contexts/AuthContext'

// ── Nav config ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { to: '/',            label: 'Dashboard',   Icon: LayoutDashboard, roles: ['admin', 'analyst', 'viewer'] },
  { to: '/metrics',     label: 'Metrics',     Icon: Cpu,             roles: ['admin', 'analyst', 'viewer'] },
  { to: '/logs',        label: 'Logs',        Icon: ScrollText,      roles: ['admin', 'analyst', 'viewer'] },
  { to: '/incidents',   label: 'Incidents',   Icon: AlertTriangle,   roles: ['admin', 'analyst', 'viewer'] },
  { to: '/services',    label: 'Services',    Icon: Server,          roles: ['admin', 'analyst', 'viewer'] },
  { to: '/traces',      label: 'Traces',      Icon: GitBranch,       roles: ['admin', 'analyst'] },
  { to: '/service-map', label: 'Service Map', Icon: Network,         roles: ['admin', 'analyst'] },
  { to: '/analytics',   label: 'Analytics',   Icon: BarChart2,       roles: ['admin', 'analyst'] },
]

const ADMIN_ITEMS = [
  { to: '/admin/users', label: 'Users',   Icon: Users   },
]

const ROLE_META = {
  admin:   { label: 'Administrator', color: 'text-red-400',  bg: 'bg-red-900/20',  Icon: Shield   },
  analyst: { label: 'Analyst',       color: 'text-blue-400', bg: 'bg-blue-900/20', Icon: BarChart2 },
  viewer:  { label: 'Viewer',        color: 'text-gray-400', bg: 'bg-gray-800',    Icon: User     },
}

// ── Nav link ──────────────────────────────────────────────────────────────────

function NavItem({ to, label, Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
          isActive
            ? 'bg-blue-600/15 text-blue-400 border border-blue-800/40'
            : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100 border border-transparent'
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </NavLink>
  )
}
NavItem.propTypes = {
  to:    PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  Icon:  PropTypes.elementType.isRequired,
  end:   PropTypes.bool,
}
NavItem.defaultProps = { end: false }

// ── Main Sidebar ──────────────────────────────────────────────────────────────

export function Sidebar() {
  const { user, logout } = useAuth()
  const role = user?.role ?? 'viewer'
  const meta = ROLE_META[role] ?? ROLE_META.viewer
  const RoleIcon = meta.Icon
  const isAdmin = role === 'admin'

  const [adminOpen, setAdminOpen] = useState(true)

  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(role))

  return (
    <aside className="flex flex-col w-64 shrink-0 border-r border-gray-700 bg-gray-900">

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-14 border-b border-gray-700">
        <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/50">
          <Activity className="h-4 w-4 text-white" />
        </div>
        <div>
          <span className="font-bold text-white tracking-tight text-sm">AIOps</span>
          <span className="ml-1.5 text-xs text-gray-500 font-normal">Platform</span>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {visibleNav.map(({ to, label, Icon }) => (
          <NavItem key={to} to={to} label={label} Icon={Icon} end={to === '/'} />
        ))}

        {/* Admin section */}
        {isAdmin && (
          <div className="pt-3 mt-3 border-t border-gray-800">
            <button
              type="button"
              onClick={() => setAdminOpen((o) => !o)}
              className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-semibold
                         text-gray-500 uppercase tracking-wider hover:text-gray-300 transition-colors"
            >
              <span className="flex items-center gap-2">
                <Shield className="h-3 w-3 text-red-500" />
                Administration
              </span>
              <ChevronDown className={`h-3 w-3 transition-transform ${adminOpen ? '' : '-rotate-90'}`} />
            </button>
            {adminOpen && (
              <div className="mt-0.5 space-y-0.5">
                {ADMIN_ITEMS.map(({ to, label, Icon }) => (
                  <NavItem key={to} to={to} label={label} Icon={Icon} end={false} />
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Settings + user footer */}
      <div className="px-3 py-3 border-t border-gray-700 space-y-0.5">
        <NavItem to="/settings" label="Settings" Icon={Settings} end={false} />

        {/* User identity */}
        <div className={`flex items-center gap-2.5 px-3 py-2.5 mt-1 rounded-lg border border-gray-700 ${meta.bg}`}>
          <div className="h-7 w-7 rounded-full bg-gray-700 border border-gray-600 flex items-center justify-center shrink-0">
            <RoleIcon className={`h-3.5 w-3.5 ${meta.color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-gray-200 truncate">{user?.id ?? 'unknown'}</p>
            <p className={`text-xs font-semibold uppercase tracking-wider ${meta.color}`}>
              {meta.label}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
