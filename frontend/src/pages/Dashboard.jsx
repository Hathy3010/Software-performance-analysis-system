import PropTypes from 'prop-types'
import { useState, useCallback, useRef, useEffect } from 'react'
import {
  AlertTriangle, Activity, Server, Cpu, Clock,
  TrendingUp, TrendingDown, Minus, GripVertical, Eye, EyeOff, Rss,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { DashboardLayout, PageHeader } from '@/components/layout/DashboardLayout'
import { Badge } from '@/components/ui/Badge'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { usePolling } from '@/hooks/usePolling'
import { dashboardApi } from '@/api/dashboard'
import { metricsApi } from '@/api/metrics'
import { alertsApi } from '@/api/alerts'
import { servicesApi } from '@/api/services'
import { formatDuration } from '@/utils/format'

// ── Constants ──────────────────────────────────────────────────────────────────
const SVC_COLOR = { backend: '#3b82f6', 'demo-app': '#10b981', 'ai-engine': '#a855f7' }
const PALETTE   = ['#6366f1', '#f59e0b', '#ec4899']
const svcColor  = (name, i) => SVC_COLOR[name] ?? PALETTE[i % PALETTE.length]

const WIDGET_IDS = ['timeseries', 'breakdowns', 'feed']
const STORAGE_KEY = 'dashboard-widgets-v1'

function loadWidgets() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.every((w) => w.id && 'visible' in w)) return parsed
    }
  } catch { /* ignore */ }
  return WIDGET_IDS.map((id) => ({ id, visible: true }))
}

function saveWidgets(widgets) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets)) } catch { /* ignore */ }
}

const ENV_ALL = 'all'

function trendMeta(trend) {
  if (trend === 'up')   return { Icon: TrendingUp,   color: 'text-red-400' }
  if (trend === 'down') return { Icon: TrendingDown, color: 'text-emerald-400' }
  return { Icon: Minus, color: 'text-zinc-500' }
}

function healthTrend(pct) {
  if (pct === 100) return 'down'
  if (pct < 80)   return 'up'
  return 'stable'
}

// ── StatCard ───────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, iconColor, trend, sub, loading }) {
  if (loading) return <SkeletonCard />
  const { Icon: TrendIcon, color: trendColor } = trendMeta(trend ?? 'stable')
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-zinc-400">{label}</p>
        <div className={`p-1.5 rounded-md bg-zinc-800 ${iconColor}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-2xl font-semibold text-zinc-50">{value}</p>
      {sub != null && (
        <div className={`flex items-center gap-1 mt-1.5 text-xs ${trendColor}`}>
          <TrendIcon className="h-3 w-3" />
          <span>{sub}</span>
        </div>
      )}
    </div>
  )
}
StatCard.propTypes = {
  label:     PropTypes.string.isRequired,
  value:     PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  icon:      PropTypes.elementType.isRequired,
  iconColor: PropTypes.string.isRequired,
  trend:     PropTypes.oneOf(['up', 'down', 'stable']),
  sub:       PropTypes.string,
  loading:   PropTypes.bool,
}

// ── SparkTooltip (module-level to avoid S6478) ────────────────────────────────
function SparkTooltip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 shadow-xl">
      <p className="text-zinc-500 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {fmt ? fmt(p.value) : p.value?.toFixed(4)}
        </p>
      ))}
    </div>
  )
}
SparkTooltip.propTypes = {
  active:  PropTypes.bool,
  payload: PropTypes.array,
  label:   PropTypes.string,
  fmt:     PropTypes.func,
}


// ── TimeSeriesOverview ─────────────────────────────────────────────────────────
function TimeSeriesOverview() {
  const { data, loading } = usePolling(
    useCallback(() => metricsApi.getHistory({ hours: 1, step: 60 }), []),
    60000,
  )

  const series = data?.series ?? []

  const CHARTS = [
    {
      key: 'cpu_rate',
      title: 'CPU Rate',
      fmt: (v) => `${(v * 100).toFixed(1)}%`,
    },
    {
      key: 'error_rate',
      title: 'Error Rate (5xx)',
      fmt: (v) => `${(v * 100).toFixed(2)}%`,
    },
  ]

  if (loading && !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 h-36 animate-pulse" />
        ))}
      </div>
    )
  }

  const tsSet = new Set()
  series.forEach((s) => s.cpu_rate?.forEach((p) => tsSet.add(p.ts)))
  const times = [...tsSet].sort((a, b) => a - b)
  const chartPoints = times.map((ts) => {
    const pt = {
      time: new Date(ts * 1000).toLocaleTimeString('en-US', {
        hour12: false, hour: '2-digit', minute: '2-digit',
      }),
    }
    series.forEach((s) => {
      const found = s.cpu_rate?.find((p) => p.ts === ts)
      pt[`${s.service}_cpu`] = found ? Math.round(found.value * 10000) / 10000 : null
      const ef = s.error_rate?.find((p) => p.ts === ts)
      pt[`${s.service}_err`] = ef ? Math.round(ef.value * 10000) / 10000 : null
    })
    return pt
  })

  const svcNames = series.map((s) => s.service)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {CHARTS.map(({ key, title, fmt }) => {
        const suffix = key === 'cpu_rate' ? '_cpu' : '_err'
        return (
          <div key={key} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <p className="text-xs font-medium text-zinc-400 mb-3">{title} — last 1 h</p>
            {chartPoints.length ? (
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={chartPoints} margin={{ top: 2, right: 8, left: -28, bottom: 0 }}>
                  <defs>
                    {svcNames.map((name, i) => {
                      const color = svcColor(name, i)
                      return (
                        <linearGradient key={name} id={`dash-${key}-${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                        </linearGradient>
                      )
                    })}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="time" tick={{ fill: '#52525b', fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#52525b', fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={fmt} />
                  <Tooltip content={<SparkTooltip fmt={fmt} />} />
                  {svcNames.map((name, i) => (
                    <Area
                      key={name}
                      type="monotone"
                      dataKey={`${name}${suffix}`}
                      stroke={svcColor(name, i)}
                      fill={`url(#dash-${key}-${i})`}
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 3 }}
                      isAnimationActive={false}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-24 flex items-center justify-center text-xs text-zinc-600">No data yet</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── AlertFeed ─────────────────────────────────────────────────────────────────
function severityBadge(severity) {
  if (severity === 'critical') return 'bg-red-950 text-red-400 border-red-900'
  if (severity === 'high')     return 'bg-orange-950 text-orange-400 border-orange-900'
  if (severity === 'medium')   return 'bg-amber-950 text-amber-400 border-amber-900'
  return 'bg-zinc-800 text-zinc-400 border-zinc-700'
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function AlertFeedItem({ alert, isNew }) {
  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
      isNew ? 'bg-blue-950/20 border-blue-900/30 animate-pulse' : 'bg-zinc-950 border-zinc-800'
    }`}>
      <span className={`text-xs px-1.5 py-0.5 rounded border font-medium shrink-0 mt-0.5 ${severityBadge(alert.severity)}`}>
        {alert.severity}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-zinc-200 truncate">{alert.name ?? alert.alert_name ?? 'Alert'}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{alert.service_name ?? '—'}</p>
      </div>
      <span className="text-xs text-zinc-600 shrink-0 mt-0.5">{timeAgo(alert.created_at ?? alert.fired_at)}</span>
    </div>
  )
}
AlertFeedItem.propTypes = {
  alert: PropTypes.object.isRequired,
  isNew: PropTypes.bool,
}

function AlertFeed() {
  const [prevIds, setPrevIds] = useState(new Set())
  const { data, loading } = usePolling(
    useCallback(() => alertsApi.list({ limit: 15, status: 'firing' }), []),
    5000,
  )

  const alerts = data?.items ?? []

  useEffect(() => {
    if (alerts.length) {
      setPrevIds((prev) => {
        const next = new Set(alerts.map((a) => a.id))
        return prev.size === 0 ? next : prev
      })
    }
  }, [alerts])

  const newIds = new Set(
    alerts
      .filter((a) => !prevIds.has(a.id))
      .map((a) => a.id)
  )

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs text-zinc-500">Live · updates every 5 s</span>
      </div>
      {loading && !data && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 bg-zinc-800 rounded-lg animate-pulse" />
          ))}
        </div>
      )}
      {!loading && alerts.length === 0 && (
        <div className="flex items-center justify-center h-24 text-xs text-zinc-600">
          No firing alerts — system healthy
        </div>
      )}
      {alerts.length > 0 && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {alerts.map((a) => (
            <AlertFeedItem key={a.id} alert={a} isNew={newIds.has(a.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── ServiceHealthWidget ────────────────────────────────────────────────────────
function ServiceHealthWidget({ summary, loading, filteredItems }) {
  const total = filteredItems.length || Math.max(summary?.total_services ?? 1, 1)
  const counts = filteredItems.length
    ? {
        healthy:  filteredItems.filter((s) => s.status === 'healthy').length,
        degraded: filteredItems.filter((s) => s.status === 'degraded').length,
        down:     filteredItems.filter((s) => s.status === 'down').length,
        unknown:  filteredItems.filter((s) => s.status === 'unknown').length,
      }
    : (summary?.service_status ?? { healthy: 0, degraded: 0, down: 0, unknown: 0 })

  if (loading && !summary) {
    return (
      <div className="space-y-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 bg-zinc-800 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  const healthPct = Math.round((counts.healthy / total) * 100)
  const bars = [
    { key: 'healthy',  color: 'text-emerald-400', bg: 'bg-emerald-950 border-emerald-900', bar: 'bg-emerald-500' },
    { key: 'degraded', color: 'text-amber-400',   bg: 'bg-amber-950 border-amber-900',     bar: 'bg-amber-500' },
    { key: 'down',     color: 'text-red-400',     bg: 'bg-red-950 border-red-900',          bar: 'bg-red-500' },
    { key: 'unknown',  color: 'text-zinc-400',    bg: 'bg-zinc-800 border-zinc-700',        bar: 'bg-zinc-600' },
  ]

  return (
    <>
      <div className="grid grid-cols-4 gap-2 mb-4">
        {bars.map(({ key, color, bg }) => (
          <div key={key} className={`rounded-lg border p-3 text-center ${bg}`}>
            <p className={`text-xl font-semibold ${color}`}>{counts[key]}</p>
            <p className="text-xs text-zinc-500 mt-0.5 capitalize">{key}</p>
          </div>
        ))}
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden flex">
        {bars.map(({ key, bar }) => (
          <div
            key={key}
            className={`h-full ${bar} transition-all duration-500`}
            style={{ width: `${(counts[key] / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs text-zinc-500">{total} services</span>
        <span className="text-xs text-emerald-400">{healthPct}% healthy</span>
      </div>
    </>
  )
}
ServiceHealthWidget.propTypes = {
  summary:       PropTypes.object,
  loading:       PropTypes.bool,
  filteredItems: PropTypes.array.isRequired,
}

// ── AlertBreakdownWidget ───────────────────────────────────────────────────────
function AlertBreakdownWidget({ summary, loading }) {
  if (loading && !summary) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-zinc-700" />
            <div className="flex-1 h-2 bg-zinc-800 rounded-full" />
            <div className="h-3 w-6 bg-zinc-800 rounded" />
          </div>
        ))}
      </div>
    )
  }
  if (!summary) return null

  const rows = [
    { label: 'Critical', count: summary.alert_severity.critical, color: 'bg-red-500',    text: 'text-red-400' },
    { label: 'High',     count: summary.alert_severity.high,     color: 'bg-orange-500', text: 'text-orange-400' },
    { label: 'Medium',   count: summary.alert_severity.medium,   color: 'bg-amber-500',  text: 'text-amber-400' },
    { label: 'Low',      count: summary.alert_severity.low,      color: 'bg-zinc-500',   text: 'text-zinc-400' },
  ]
  const max = Math.max(summary.firing_alerts, 1)

  return (
    <div className="space-y-3">
      {rows.map(({ label, count, color, text }) => (
        <div key={label} className="flex items-center gap-3">
          <span className="text-xs text-zinc-400 w-14">{label}</span>
          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${color} transition-all duration-500`}
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
          <span className={`text-xs font-medium w-6 text-right ${text}`}>{count}</span>
        </div>
      ))}
    </div>
  )
}
AlertBreakdownWidget.propTypes = {
  summary: PropTypes.object,
  loading: PropTypes.bool,
}

// ── WidgetShell ────────────────────────────────────────────────────────────────
function WidgetShell({ id, title, visible, onToggle, onDragStart, onDragOver, onDrop, isDragOver, children }) {
  const dropRef = useRef(null)

  useEffect(() => {
    const el = dropRef.current
    if (!el) return
    const over = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver(id) }
    const drop = (e) => { e.preventDefault(); onDrop(id) }
    el.addEventListener('dragover', over)
    el.addEventListener('drop', drop)
    return () => { el.removeEventListener('dragover', over); el.removeEventListener('drop', drop) }
  }, [id, onDragOver, onDrop])

  const handleDragStart = useCallback((e) => {
    e.dataTransfer.effectAllowed = 'move'
    onDragStart(id)
  }, [id, onDragStart])

  if (!visible) {
    return (
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-zinc-800 text-zinc-600 hover:border-zinc-700 hover:text-zinc-500 transition-colors text-xs"
      >
        <EyeOff className="h-3.5 w-3.5" />
        {title} — hidden. Click to show.
      </button>
    )
  }

  return (
    <div
      ref={dropRef}
      className={`transition-opacity ${isDragOver ? 'opacity-50' : 'opacity-100'}`}
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <button
            draggable
            onDragStart={handleDragStart}
            className="cursor-grab active:cursor-grabbing p-0 bg-transparent border-none text-zinc-600 hover:text-zinc-400"
            aria-label="Drag to reorder widget"
          >
            <GripVertical className="h-4 w-4 shrink-0" />
          </button>
          <h3 className="text-sm font-medium text-zinc-200 flex-1">{title}</h3>
          <button
            onClick={onToggle}
            className="h-6 w-6 flex items-center justify-center rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            title="Hide widget"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
WidgetShell.propTypes = {
  id:          PropTypes.string.isRequired,
  title:       PropTypes.string.isRequired,
  visible:     PropTypes.bool.isRequired,
  onToggle:    PropTypes.func.isRequired,
  onDragStart: PropTypes.func.isRequired,
  onDragOver:  PropTypes.func.isRequired,
  onDrop:      PropTypes.func.isRequired,
  isDragOver:  PropTypes.bool,
  children:    PropTypes.node,
}

// ── EnvironmentFilter ─────────────────────────────────────────────────────────
function EnvironmentFilter({ envs, selected, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {envs.map((e) => (
        <button
          key={e}
          onClick={() => onChange(e)}
          className={`h-7 px-3 rounded-md text-xs font-medium transition-colors capitalize ${
            selected === e
              ? 'bg-blue-600/15 text-blue-400 border border-blue-800/50'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
        >
          {e === ENV_ALL ? 'All Environments' : e}
        </button>
      ))}
    </div>
  )
}
EnvironmentFilter.propTypes = {
  envs:     PropTypes.array.isRequired,
  selected: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [env, setEnv]         = useState(ENV_ALL)
  const [widgets, setWidgets] = useState(loadWidgets)
  const dragId = useRef(null)
  const [dropId, setDropId]   = useState(null)

  const { data: summary, loading, error } = usePolling(dashboardApi.getSummary, 30000)
  const { data: servicesData } = usePolling(
    useCallback(() => servicesApi.list({ limit: 100 }), []),
    60000,
  )

  const allItems   = servicesData?.items ?? []
  const environments = [ENV_ALL, ...Array.from(new Set(allItems.map((s) => s.environment))).sort((a, b) => a.localeCompare(b))]
  const filteredItems = env === ENV_ALL ? allItems : allItems.filter((s) => s.environment === env)

  const healthPct = summary
    ? Math.round((summary.service_status.healthy / Math.max(summary.total_services, 1)) * 100)
    : null

  function handleDragStart(id) { dragId.current = id }
  function handleDragOver(id)  { setDropId(id) }

  function handleDrop(targetId) {
    const fromId = dragId.current
    if (!fromId || fromId === targetId) { dragId.current = null; setDropId(null); return }
    setWidgets((prev) => {
      const next = [...prev]
      const fromIdx = next.findIndex((w) => w.id === fromId)
      const toIdx   = next.findIndex((w) => w.id === targetId)
      const [item] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, item)
      saveWidgets(next)
      return next
    })
    dragId.current = null
    setDropId(null)
  }

  function toggleWidget(id) {
    setWidgets((prev) => {
      const next = prev.map((w) => w.id === id ? { ...w, visible: !w.visible } : w)
      saveWidgets(next)
      return next
    })
  }

  const widgetProps = (id) => ({
    id,
    visible:     widgets.find((w) => w.id === id)?.visible ?? true,
    onToggle:    () => toggleWidget(id),
    onDragStart: handleDragStart,
    onDragOver:  handleDragOver,
    onDrop:      handleDrop,
    isDragOver:  dropId === id,
  })

  return (
    <DashboardLayout>
      <PageHeader
        title="Dashboard"
        subtitle="Real-time platform overview"
        action={
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {' '}Live · refreshes every 30 s
          </div>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-900/50 bg-red-950/20 p-3 text-sm text-red-400">
          Failed to load dashboard data. Retrying…
        </div>
      )}

      {/* Environment filter */}
      {environments.length > 1 && (
        <div className="mb-4">
          <EnvironmentFilter envs={environments} selected={env} onChange={setEnv} />
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        <StatCard
          label="Total Alerts"
          value={summary
            ? summary.alert_severity.critical + summary.alert_severity.high
              + summary.alert_severity.medium + summary.alert_severity.low
            : '—'}
          icon={AlertTriangle}
          iconColor="text-amber-400"
          sub={summary ? `${summary.alert_severity.critical} critical` : null}
          trend={summary?.alert_severity.critical > 0 ? 'up' : 'stable'}
          loading={loading}
        />
        <StatCard
          label="Active Incidents"
          value={summary?.open_incidents ?? '—'}
          icon={Activity}
          iconColor="text-red-400"
          sub={summary ? `${summary.critical_incidents} critical` : null}
          trend={summary?.critical_incidents > 0 ? 'up' : 'stable'}
          loading={loading}
        />
        <StatCard
          label="Services Health"
          value={healthPct == null ? '—' : `${healthPct}%`}
          icon={Server}
          iconColor="text-emerald-400"
          sub={summary ? `${summary.total_services} monitored` : null}
          trend={healthTrend(healthPct)}
          loading={loading}
        />
        <StatCard
          label="Anomalies (24h)"
          value={summary?.recent_anomalies_24h ?? '—'}
          icon={Cpu}
          iconColor="text-blue-400"
          sub="detected by AI engine"
          loading={loading}
        />
        <StatCard
          label="Avg MTTR"
          value={summary?.mttr_seconds == null ? '—' : formatDuration(Math.round(summary.mttr_seconds))}
          icon={Clock}
          iconColor="text-purple-400"
          sub="mean time to resolve"
          loading={loading}
        />
      </div>

      {/* Draggable widgets */}
      <div className="space-y-4">
        {widgets.map((w) => {
          if (w.id === 'timeseries') {
            return (
              <WidgetShell key={w.id} title="Time-Series Overview" {...widgetProps(w.id)}>
                <TimeSeriesOverview />
              </WidgetShell>
            )
          }
          if (w.id === 'breakdowns') {
            return (
              <WidgetShell key={w.id} title="System Breakdown" {...widgetProps(w.id)}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
                      Firing Alerts by Severity
                    </p>
                    <AlertBreakdownWidget summary={summary} loading={loading} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
                      Service Health{env === ENV_ALL ? '' : ` · ${env}`}
                    </p>
                    <ServiceHealthWidget
                      summary={summary}
                      loading={loading}
                      filteredItems={filteredItems}
                    />
                  </div>
                </div>
              </WidgetShell>
            )
          }
          if (w.id === 'feed') {
            return (
              <WidgetShell key={w.id} title="Live Alert Feed" {...widgetProps(w.id)}>
                <div className="flex items-center gap-2 mb-1">
                  <Rss className="h-3.5 w-3.5 text-zinc-500" />
                  <span className="text-xs text-zinc-500">Real-time firing alerts</span>
                </div>
                <AlertFeed />
              </WidgetShell>
            )
          }
          return null
        })}
      </div>

      {/* Metric used for service row (kept for badge logic) */}
      <div className="hidden">
        {filteredItems.slice(0, 1).map((svc) => (
          <Badge key={svc.id} variant={svc.status} />
        ))}
      </div>
    </DashboardLayout>
  )
}
