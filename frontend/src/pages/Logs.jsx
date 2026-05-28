import PropTypes from 'prop-types'
import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, FileText, ExternalLink, AlertTriangle } from 'lucide-react'
import { DashboardLayout, PageHeader } from '@/components/layout/DashboardLayout'
import { usePolling } from '@/hooks/usePolling'
import { logsApi } from '@/api/logs'
import { useTimeRange } from '@/contexts/TimeRangeContext'

// ── Constants ──────────────────────────────────────────────────────────────────
const LEVELS = ['all', 'info', 'warn', 'error', 'critical']

const LEVEL_STYLE = {
  info:     { badge: 'text-blue-400 bg-blue-400/10 border-blue-800/40',     dot: 'bg-blue-400'    },
  warn:     { badge: 'text-amber-400 bg-amber-400/10 border-amber-800/40',  dot: 'bg-amber-400'   },
  error:    { badge: 'text-red-400 bg-red-400/10 border-red-800/40',        dot: 'bg-red-400'     },
  critical: { badge: 'text-pink-400 bg-pink-400/10 border-pink-800/40',     dot: 'bg-pink-400'    },
  info_default: { badge: 'text-zinc-400 bg-zinc-800/60 border-zinc-700/40', dot: 'bg-zinc-500'    },
}

function levelStyle(lvl) {
  return LEVEL_STYLE[lvl] ?? LEVEL_STYLE.info_default
}

const ALERT_COMPONENTS = new Set(['alertmanager', 'incident-manager'])

// ── Log entry row ──────────────────────────────────────────────────────────────
function LogRow({ entry, onTraceClick, onAlertClick }) {
  const { badge, dot } = levelStyle(entry.level)
  const ts = entry.timestamp
    ? new Date(entry.timestamp).toLocaleTimeString('en-US', {
        hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
      })
    : '—'
  const isAlertEntry = ALERT_COMPONENTS.has(entry.component)

  return (
    <div className="flex items-start gap-3 px-4 py-2.5 border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors group">
      {/* Dot */}
      <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${dot}`} />

      {/* Timestamp */}
      <span className="text-xs font-mono text-zinc-500 shrink-0 w-20">{ts}</span>

      {/* Level badge */}
      <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded border shrink-0 w-16 text-center ${badge}`}>
        {entry.level.toUpperCase()}
      </span>

      {/* Service */}
      <span className="text-xs text-zinc-400 shrink-0 w-24 truncate">{entry.service}</span>

      {/* Component */}
      <span className="text-xs text-zinc-600 shrink-0 w-32 truncate">{entry.component}</span>

      {/* Message */}
      <span className="text-xs text-zinc-200 flex-1 leading-relaxed">{entry.message}</span>

      {/* Alert cross-link — alertmanager / incident-manager entries link to Incidents */}
      {isAlertEntry && (
        <button
          type="button"
          onClick={() => onAlertClick(entry.service)}
          className="shrink-0 flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 opacity-0 group-hover:opacity-100 transition-opacity"
          title="View related incidents"
        >
          <AlertTriangle className="h-3 w-3" />
          Incidents
        </button>
      )}

      {/* Trace cross-link */}
      {entry.trace_id && (
        <button
          type="button"
          onClick={() => onTraceClick(entry.trace_id)}
          className="shrink-0 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Open trace"
        >
          <ExternalLink className="h-3 w-3" />
          Trace
        </button>
      )}
    </div>
  )
}
LogRow.propTypes = {
  entry:        PropTypes.object.isRequired,
  onTraceClick: PropTypes.func.isRequired,
  onAlertClick: PropTypes.func.isRequired,
}

// ── Log table body (extracted to avoid nested ternaries) ──────────────────────
function LogTableBody({ loading, data, error, logs, onTraceClick, onAlertClick }) {
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-zinc-500 animate-pulse">
        Loading logs…
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-red-400">
        Failed to load logs
      </div>
    )
  }
  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <FileText className="h-8 w-8 text-zinc-700" />
        <p className="text-sm text-zinc-500">No log entries in this window</p>
      </div>
    )
  }
  return logs.map((entry, i) => (
    <LogRow
      key={`${entry.timestamp}-${i}`}
      entry={entry}
      onTraceClick={onTraceClick}
      onAlertClick={onAlertClick}
    />
  ))
}
LogTableBody.propTypes = {
  loading:      PropTypes.bool,
  data:         PropTypes.object,
  error:        PropTypes.any,
  logs:         PropTypes.array.isRequired,
  onTraceClick: PropTypes.func.isRequired,
  onAlertClick: PropTypes.func.isRequired,
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Logs() {
  const navigate                  = useNavigate()
  const { range }                 = useTimeRange()
  const [search,   setSearch]     = useState('')
  const [service,  setService]    = useState('')
  const [level,    setLevel]      = useState('all')

  const fetchFn = useCallback(
    () => logsApi.list({
      hours:   range.hours,
      limit:   300,
      service: service || undefined,
      level:   level === 'all' ? undefined : level,
      search:  search || undefined,
    }),
    [range.hours, service, level, search],
  )

  const { data, loading, error } = usePolling(fetchFn, 15000)
  const logs = data?.logs ?? []

  function handleTraceClick(traceId) {
    window.open(`/traces?trace=${traceId}`, '_blank')
  }

  function handleAlertClick(svc) {
    navigate(`/incidents?service=${encodeURIComponent(svc)}`)
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Logs"
        subtitle={data ? `${data.total} entries · last ${range.label} · refreshes every 15 s` : 'Loading…'}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search messages…"
            className="h-8 pl-9 pr-4 bg-zinc-900 border border-zinc-800 rounded-md text-sm
                       text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1
                       focus:ring-blue-500 w-64"
          />
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder="Filter by service…"
            className="h-8 pl-9 pr-4 bg-zinc-900 border border-zinc-800 rounded-md text-sm
                       text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1
                       focus:ring-blue-500 w-48"
          />
        </div>

        <div className="flex items-center gap-1">
          {LEVELS.map((l) => {
            const isActive = level === l
            const style    = l === 'all' ? null : levelStyle(l)
            return (
              <button
                key={l}
                type="button"
                onClick={() => setLevel(l)}
                className={`h-8 px-3 rounded-md text-xs font-medium capitalize transition-colors ${
                  isActive && style
                    ? `${style.badge} border`
                    : isActive
                      ? 'bg-blue-600/15 text-blue-400 border border-blue-800/50'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                {l}
              </button>
            )
          })}
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-900/50 rounded-t-lg text-xs font-medium text-zinc-500 uppercase tracking-wider">
        <div className="w-2 shrink-0" />
        <div className="w-20 shrink-0">Time</div>
        <div className="w-16 shrink-0">Level</div>
        <div className="w-24 shrink-0">Service</div>
        <div className="w-32 shrink-0">Component</div>
        <div className="flex-1">Message</div>
      </div>

      {/* Log rows */}
      <div className="bg-zinc-900 border border-t-0 border-zinc-800 rounded-b-lg overflow-hidden">
        <LogTableBody
          loading={loading}
          data={data}
          error={error}
          logs={logs}
          onTraceClick={handleTraceClick}
          onAlertClick={handleAlertClick}
        />
      </div>
    </DashboardLayout>
  )
}
