import PropTypes from 'prop-types'
import { useState, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts'
import { Activity, Database, AlertCircle, TrendingUp } from 'lucide-react'
import { DashboardLayout, PageHeader } from '@/components/layout/DashboardLayout'
import { Skeleton } from '@/components/ui/Skeleton'
import { usePolling } from '@/hooks/usePolling'
import { analyticsApi } from '@/api/analytics'
import { useTimeRange } from '@/contexts/TimeRangeContext'

// ── Constants ──────────────────────────────────────────────────────────────────
const STATUS_COLOR = {
  '2xx': '#22c55e', '200': '#22c55e', '201': '#22c55e', '204': '#22c55e',
  '3xx': '#a3e635', '301': '#a3e635', '304': '#a3e635',
  '4xx': '#f59e0b', '400': '#f59e0b', '401': '#f59e0b', '403': '#f59e0b', '404': '#f59e0b',
  '5xx': '#ef4444', '500': '#ef4444', '502': '#ef4444', '503': '#ef4444',
}
const ANOMALY_COLOR = '#3b82f6'
const TABS = [
  { id: 'http',    label: 'HTTP Breakdown',    Icon: Activity   },
  { id: 'anomaly', label: 'Anomaly History',   Icon: TrendingUp },
  { id: 'db',      label: 'Slow DB Queries',   Icon: Database   },
  { id: 'exc',     label: 'Exceptions',        Icon: AlertCircle},
]

// ── Shared ─────────────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-zinc-400 mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="font-medium" style={{ color: p.fill ?? p.color ?? '#a1a1aa' }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  )
}
ChartTooltip.propTypes = {
  active:  PropTypes.bool,
  payload: PropTypes.array,
  label:   PropTypes.string,
}

function SectionCard({ title, subtitle, loading, children }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
      <div className="mb-4">
        <h3 className="text-sm font-medium text-zinc-200">{title}</h3>
        {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      {loading ? <Skeleton className="h-48 w-full" /> : children}
    </div>
  )
}
SectionCard.propTypes = {
  title:    PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  loading:  PropTypes.bool,
  children: PropTypes.node,
}

function EmptyState({ message }) {
  return (
    <div className="flex items-center justify-center h-40 text-sm text-zinc-600">{message}</div>
  )
}
EmptyState.propTypes = { message: PropTypes.string.isRequired }


function statusBucket(code) {
  const s = String(code)
  if (s.startsWith('2')) return '2xx'
  if (s.startsWith('3')) return '3xx'
  if (s.startsWith('4')) return '4xx'
  if (s.startsWith('5')) return '5xx'
  return 'other'
}

// ── HTTP Breakdown tab ─────────────────────────────────────────────────────────
function HttpBreakdown({ hours }) {
  const { data, loading } = usePolling(
    useCallback(() => analyticsApi.httpBreakdown({ hours }), [hours]),
    60000,
  )

  const services = data?.services ?? []
  if (!loading && !services.length) {
    return <EmptyState message="No HTTP metrics — ensure services expose http_requests_total" />
  }

  return (
    <div className="space-y-6">
      {services.map((svc) => {
        const buckets = {}
        Object.entries(svc.status_codes || {}).forEach(([code, count]) => {
          const b = statusBucket(code)
          buckets[b] = (buckets[b] ?? 0) + count
        })
        const barData = Object.entries(buckets).map(([status, count]) => ({ status, count }))

        return (
          <SectionCard
            key={svc.service}
            title={svc.service}
            subtitle={`${svc.total_requests?.toLocaleString() ?? 0} total · 5xx ${(svc.error_rate_5xx * 100).toFixed(2)}% · 4xx ${(svc.error_rate_4xx * 100).toFixed(2)}%`}
            loading={loading}
          >
            {barData.length ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={barData} margin={{ top: 4, right: 16, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="status" tick={{ fill: '#71717a', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {barData.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLOR[entry.status] ?? '#71717a'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No data in this window" />
            )}
          </SectionCard>
        )
      })}
    </div>
  )
}
HttpBreakdown.propTypes = { hours: PropTypes.number.isRequired }

// ── Anomaly History tab ────────────────────────────────────────────────────────
const SVC_COLOR = { 'backend': '#3b82f6', 'demo-app': '#10b981', 'ai-engine': '#a855f7' }
const defaultColor = (i) => ['#6366f1', '#f59e0b', '#ec4899'][i % 3]

function AnomalyHistory({ hours }) {
  const { data, loading } = usePolling(
    useCallback(() => analyticsApi.anomalyHistory({ hours }), [hours]),
    60000,
  )

  const series = data?.series ?? []
  if (!loading && !series.length) {
    return <EmptyState message="No anomaly data in this window" />
  }

  const allTs = new Set()
  series.forEach((s) => s.points.forEach((p) => allTs.add(p.ts)))
  const timePoints = [...allTs].sort().map((ts) => {
    const pt = { time: new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) }
    series.forEach((s) => {
      const found = s.points.find((p) => p.ts === ts)
      pt[s.service] = found ? Math.round(found.score * 1000) / 1000 : null
      if (found?.is_anomaly) pt[`${s.service}_anomaly`] = found.score
    })
    return pt
  })

  return (
    <SectionCard
      title="Anomaly Score History"
      subtitle="0 = normal, 1 = highly anomalous · threshold typically 0.5"
      loading={loading}
    >
      {timePoints.length ? (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={timePoints} margin={{ top: 4, right: 16, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis dataKey="time" tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis domain={[0, 1]} tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: '11px' }} formatter={(v) => <span style={{ color: '#a1a1aa' }}>{v}</span>} />
            {series.map((s, i) => (
              <Line
                key={s.service}
                type="monotone"
                dataKey={s.service}
                stroke={SVC_COLOR[s.service] ?? defaultColor(i)}
                dot={false}
                strokeWidth={1.5}
                activeDot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <EmptyState message="No data yet" />
      )}
    </SectionCard>
  )
}
AnomalyHistory.propTypes = { hours: PropTypes.number.isRequired }

// ── Slow DB Queries tab ────────────────────────────────────────────────────────
function DbQueries() {
  const { data, loading } = usePolling(() => analyticsApi.dbQueries({ limit: 50 }), 60000)
  const queries = data?.slow_queries ?? []

  return (
    <SectionCard
      title="Slow DB Queries"
      subtitle="Detected by RCA engine when span duration exceeds 200 ms"
      loading={loading}
    >
      {queries.length === 0 ? (
        <EmptyState message="No slow DB queries detected — good sign!" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Service', 'Duration', 'DB', 'Operation', 'Statement'].map((h) => (
                  <th key={h} className={`px-3 py-2 text-left font-medium text-zinc-400 uppercase tracking-wider ${h === 'Duration' ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {queries.map((q, i) => (
                <tr key={i} className="border-b border-zinc-800/40 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-3 py-2.5 text-zinc-200 font-medium">{q.service}</td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    <span className={q.duration_ms > 1000 ? 'text-red-400' : 'text-amber-400'}>
                      {q.duration_ms} ms
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-zinc-400">{q.db_system ?? '—'}</td>
                  <td className="px-3 py-2.5 text-zinc-400">{q.operation ?? '—'}</td>
                  <td className="px-3 py-2.5 text-zinc-500 font-mono max-w-xs truncate">
                    {q.statement_fragment || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  )
}

// ── Exceptions tab ─────────────────────────────────────────────────────────────
function Exceptions() {
  const { data, loading } = usePolling(() => analyticsApi.exceptions({ limit: 100 }), 60000)
  const summary = data?.summary ?? []
  const events  = data?.events  ?? []

  return (
    <div className="space-y-4">
      {/* Summary bar chart */}
      <SectionCard
        title="Exception Distribution"
        subtitle="Grouped by exception type across all services"
        loading={loading}
      >
        {summary.length ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={summary} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="exception_type" tick={{ fill: '#a1a1aa', fontSize: 10 }} tickLine={false} axisLine={false} width={160} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="total_occurrences" fill="#ec4899" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="No exceptions detected — great!" />
        )}
      </SectionCard>

      {/* Recent events */}
      {events.length > 0 && (
        <SectionCard title="Recent Exception Events" loading={loading}>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {events.slice(0, 20).map((e, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2.5">
                <div className="mt-0.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    e.category === 'infrastructure' ? 'bg-red-950 text-red-400' : 'bg-pink-950 text-pink-400'
                  }`}>{e.category}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-zinc-200 truncate">{e.exception_type}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{e.service} · {e.occurrence_count} occurrences</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Analytics() {
  const { range } = useTimeRange()
  const [tab, setTab] = useState('http')

  return (
    <DashboardLayout>
      <PageHeader
        title="Analytics"
        subtitle={`HTTP breakdown, anomaly history, DB performance, exceptions · last ${range.label}`}
      />

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-4">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 h-8 px-3 rounded-md text-xs font-medium transition-colors ${
              tab === id
                ? 'bg-blue-600/15 text-blue-400 border border-blue-800/50'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'http'    && <HttpBreakdown hours={range.hours} />}
      {tab === 'anomaly' && <AnomalyHistory hours={range.hours} />}
      {tab === 'db'      && <DbQueries />}
      {tab === 'exc'     && <Exceptions />}
    </DashboardLayout>
  )
}
