import PropTypes from 'prop-types'
import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Search, GitBranch, Clock, AlertCircle,
  ChevronDown, ChevronRight, Database, Globe, Zap, X, TrendingUp, Flame,
} from 'lucide-react'
import { DashboardLayout, PageHeader } from '@/components/layout/DashboardLayout'
import { Badge } from '@/components/ui/Badge'
import { usePolling } from '@/hooks/usePolling'
import { tracesApi } from '@/api/traces'
import { useTimeRange } from '@/contexts/TimeRangeContext'

// ── Span colour coding ─────────────────────────────────────────────────────────
function spanColor(span) {
  if (span.has_error)   return 'bg-red-500'
  if (span.db_system)   return 'bg-orange-400'
  if (span.http_method) return 'bg-blue-500'
  return 'bg-zinc-500'
}

function spanBg(span) {
  if (span.has_error)   return 'bg-red-500/15 border-red-800/40'
  if (span.db_system)   return 'bg-orange-500/10 border-orange-800/30'
  if (span.http_method) return 'bg-blue-500/10 border-blue-800/30'
  return 'bg-zinc-800/40 border-zinc-700/30'
}

function SpanIcon({ span }) {
  if (span.db_system)   return <Database  className="h-3 w-3 text-orange-400 shrink-0" />
  if (span.http_method) return <Globe     className="h-3 w-3 text-blue-400 shrink-0" />
  if (span.has_error)   return <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />
  return <Zap className="h-3 w-3 text-zinc-500 shrink-0" />
}
SpanIcon.propTypes = { span: PropTypes.object.isRequired }

// ── Span attribute panel ───────────────────────────────────────────────────────
function SpanDetail({ span, onClose }) {
  const entries = Object.entries(span.tags || {})
  const sections = [
    { label: 'HTTP',      pairs: [['Method', span.http_method], ['Route', span.http_route], ['Status', span.http_status_code]] },
    { label: 'Database',  pairs: [['System', span.db_system], ['Operation', span.db_operation], ['Statement', span.db_statement]] },
    { label: 'Exception', pairs: [['Type', span.exception_type], ['Message', span.exception_message]] },
    { label: 'Timing',    pairs: [['Duration', `${((span.duration_us || 0) / 1000).toFixed(2)} ms`], ['Peer', span.peer_service]] },
  ]

  return (
    <div className="border-t border-zinc-800 bg-zinc-950 px-5 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Span Detail</p>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X className="h-4 w-4" /></button>
      </div>
      <div className="font-mono text-xs text-zinc-500 break-all">{span.span_id} · {span.service_name} · {span.operation_name}</div>
      {sections.map(({ label, pairs }) => {
        const visible = pairs.filter(([, v]) => v != null && v !== '' && v !== false)
        if (!visible.length) return null
        return (
          <div key={label}>
            <p className="text-xs font-medium text-zinc-400 mb-1.5">{label}</p>
            <div className="grid grid-cols-[120px_1fr] gap-y-1 gap-x-3">
              {visible.map(([k, v]) => (
                <div key={k} className="contents">
                  <span className="text-xs text-zinc-500">{k}</span>
                  <span className="text-xs text-zinc-200 break-all">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {entries.length > 0 && (
        <details className="group">
          <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300 list-none flex items-center gap-1">
            <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
            All tags ({entries.length})
          </summary>
          <div className="mt-2 rounded bg-zinc-900 border border-zinc-800 p-2 max-h-40 overflow-y-auto font-mono text-xs text-zinc-400 space-y-0.5">
            {entries.map(([k, v]) => (
              <div key={k}><span className="text-blue-400">{k}</span>: {String(v)}</div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
SpanDetail.propTypes = { span: PropTypes.object.isRequired, onClose: PropTypes.func.isRequired }

// ── Waterfall row ──────────────────────────────────────────────────────────────
function WaterfallRow({ span, depth, traceDuration, selected, onSelect }) {
  const indent      = depth * 16
  const leftPct     = ((span.offset_us || 0) / Math.max(traceDuration, 1)) * 100
  const widthPct    = Math.max(span.width_pct || 0, 0.5)
  const durationMs  = ((span.duration_us || 0) / 1000).toFixed(2)
  const isSelected  = selected?.span_id === span.span_id
  function handleKey(e) { if (e.key === 'Enter' || e.key === ' ') onSelect(isSelected ? null : span) }

  return (
    <button
      type="button"
      className={`w-full text-left border-b border-zinc-800/50 cursor-pointer transition-colors ${isSelected ? 'bg-zinc-800/60' : 'hover:bg-zinc-800/30'}`}
      onClick={() => onSelect(isSelected ? null : span)}
      onKeyDown={handleKey}
    >
      <div className="flex items-center h-9">
        <div className="w-72 shrink-0 flex items-center gap-1.5 px-3 border-r border-zinc-800/50"
             style={{ paddingLeft: `${12 + indent}px` }}>
          <SpanIcon span={span} />
          <span className="text-xs text-zinc-300 truncate">{span.service_name}</span>
          <span className="text-xs text-zinc-600 truncate">· {span.operation_name}</span>
        </div>
        <div className="flex-1 relative h-full flex items-center px-2">
          <div className="w-full h-4 relative">
            <div className={`absolute h-full rounded-sm ${spanColor(span)} opacity-80`}
                 style={{ left: `${leftPct}%`, width: `${widthPct}%`, minWidth: '3px' }} />
          </div>
        </div>
        <div className="w-20 shrink-0 text-right px-3 text-xs text-zinc-400">{durationMs} ms</div>
      </div>
    </button>
  )
}
WaterfallRow.propTypes = {
  span:          PropTypes.object.isRequired,
  depth:         PropTypes.number.isRequired,
  traceDuration: PropTypes.number.isRequired,
  selected:      PropTypes.object,
  onSelect:      PropTypes.func.isRequired,
}

// ── Flame graph ────────────────────────────────────────────────────────────────
const FLAME_ROW_H = 22

function flameColor(span) {
  if (span.has_error)   return '#ef4444'
  if (span.db_system)   return '#fb923c'
  if (span.http_method) return '#3b82f6'
  return '#52525b'
}

function FlameSpan({ span, depth, totalDuration, chartWidth, selected, onSelect }) {
  const leftPx   = ((span.offset_us || 0) / totalDuration) * chartWidth
  const widthPx  = Math.max((span.duration_us / totalDuration) * chartWidth, 1)
  const topPx    = depth * FLAME_ROW_H
  const isActive = selected?.span_id === span.span_id
  const label    = `${span.service_name} · ${span.operation_name}`

  return (
    <button
      type="button"
      title={`${label} · ${((span.duration_us || 0) / 1000).toFixed(2)} ms`}
      onClick={() => onSelect(isActive ? null : span)}
      style={{
        position: 'absolute',
        left: leftPx,
        top: topPx,
        width: widthPx,
        height: FLAME_ROW_H - 2,
        backgroundColor: flameColor(span),
        opacity: isActive ? 1 : 0.82,
        border: isActive ? '1px solid #fff' : '1px solid rgba(0,0,0,0.3)',
        borderRadius: 2,
        overflow: 'hidden',
        cursor: 'pointer',
        boxSizing: 'border-box',
        padding: 0,
      }}
    >
      {widthPx > 36 && (
        <span style={{
          display: 'block', paddingLeft: 4, fontSize: 10, color: '#fff',
          lineHeight: `${FLAME_ROW_H - 2}px`, whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis', userSelect: 'none',
        }}>
          {label}
        </span>
      )}
    </button>
  )
}
FlameSpan.propTypes = {
  span:          PropTypes.object.isRequired,
  depth:         PropTypes.number.isRequired,
  totalDuration: PropTypes.number.isRequired,
  chartWidth:    PropTypes.number.isRequired,
  selected:      PropTypes.object,
  onSelect:      PropTypes.func.isRequired,
}

function FlameGraph({ data, depthMap, selectedSpan, onSelectSpan }) {
  const containerRef = useRef(null)
  const [chartWidth, setChartWidth] = useState(800)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setChartWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const maxDepth    = Math.max(...Object.values(depthMap), 0)
  const totalHeight = (maxDepth + 1) * FLAME_ROW_H + 8
  const totalDuration = data.duration_us || 1

  return (
    <div ref={containerRef} className="relative overflow-x-auto" style={{ height: totalHeight, minHeight: 80 }}>
      {(data.spans || []).map((span) => (
        <FlameSpan
          key={span.span_id}
          span={span}
          depth={depthMap[span.span_id] || 0}
          totalDuration={totalDuration}
          chartWidth={chartWidth}
          selected={selectedSpan}
          onSelect={onSelectSpan}
        />
      ))}
    </div>
  )
}
FlameGraph.propTypes = {
  data:         PropTypes.object.isRequired,
  depthMap:     PropTypes.object.isRequired,
  selectedSpan: PropTypes.object,
  onSelectSpan: PropTypes.func.isRequired,
}

// ── Trace waterfall / flame modal ──────────────────────────────────────────────
function TraceWaterfall({ traceId, onClose }) {
  const [selectedSpan, setSelectedSpan] = useState(null)
  const [viewMode,     setViewMode]     = useState('waterfall')

  const { data, loading } = usePolling(
    () => traceId ? tracesApi.get(traceId) : Promise.resolve(null),
    0
  )

  if (!data && loading) return (
    <div className="fixed inset-0 z-50 bg-zinc-950/90 flex items-center justify-center">
      <div className="text-sm text-zinc-400 animate-pulse">Loading trace…</div>
    </div>
  )
  if (!data) return null

  const depthMap  = {}
  const spanById  = Object.fromEntries((data.spans || []).map((s) => [s.span_id, s]))
  function getDepth(span) {
    if (depthMap[span.span_id] !== undefined) return depthMap[span.span_id]
    if (!span.parent_span_id || !spanById[span.parent_span_id]) {
      depthMap[span.span_id] = 0
    } else {
      depthMap[span.span_id] = getDepth(spanById[span.parent_span_id]) + 1
    }
    return depthMap[span.span_id]
  }
  ;(data.spans || []).forEach(getDepth)

  const totalDuration = data.duration_us || 1

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/95 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 h-14 border-b border-zinc-800 shrink-0">
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100"><X className="h-5 w-5" /></button>
        <div>
          <p className="text-sm font-semibold text-zinc-100">Trace Detail</p>
          <p className="text-xs font-mono text-zinc-500">{traceId}</p>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 ml-4">
          {[
            { mode: 'waterfall', label: 'Waterfall', Icon: GitBranch },
            { mode: 'flame',     label: 'Flame Graph', Icon: Flame },
          ].map(({ mode, label, Icon }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-1.5 h-7 px-2.5 rounded text-xs font-medium transition-colors ${
                viewMode === mode
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-800/50'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-4 text-xs text-zinc-400">
          <span>{data.span_count} spans</span>
          <span>{(totalDuration / 1000).toFixed(2)} ms total</span>
          <span>{data.services?.join(', ')}</span>
          {data.has_error && <Badge variant="critical" className="text-xs">Error</Badge>}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-5 py-2 border-b border-zinc-800 bg-zinc-900/50 shrink-0">
        {[
          { color: 'bg-blue-500',   label: 'HTTP'     },
          { color: 'bg-orange-400', label: 'Database' },
          { color: 'bg-red-500',    label: 'Error'    },
          { color: 'bg-zinc-500',   label: 'Internal' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5 text-xs text-zinc-400">
            <div className={`h-2 w-2 rounded-sm ${color}`} />
            {label}
          </div>
        ))}
      </div>

      {viewMode === 'waterfall' && (
        <>
          <div className="flex items-center h-8 border-b border-zinc-800 bg-zinc-900/30 shrink-0 text-xs text-zinc-500 font-medium uppercase tracking-wider">
            <div className="w-72 shrink-0 px-3 border-r border-zinc-800/50">Service / Operation</div>
            <div className="flex-1 px-3">Timeline</div>
            <div className="w-20 shrink-0 text-right px-3">Duration</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {(data.spans || []).map((span) => (
              <WaterfallRow
                key={span.span_id}
                span={span}
                depth={depthMap[span.span_id] || 0}
                traceDuration={totalDuration}
                selected={selectedSpan}
                onSelect={setSelectedSpan}
              />
            ))}
            {selectedSpan && <SpanDetail span={selectedSpan} onClose={() => setSelectedSpan(null)} />}
          </div>
        </>
      )}

      {viewMode === 'flame' && (
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2 space-y-2">
          <FlameGraph
            data={data}
            depthMap={depthMap}
            selectedSpan={selectedSpan}
            onSelectSpan={setSelectedSpan}
          />
          {selectedSpan && (
            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900">
              <SpanDetail span={selectedSpan} onClose={() => setSelectedSpan(null)} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
TraceWaterfall.propTypes = {
  traceId: PropTypes.string,
  onClose: PropTypes.func.isRequired,
}

// ── Top endpoints ──────────────────────────────────────────────────────────────
function computeEndpoints(traces) {
  const map = {}
  traces.forEach((t) => {
    const key = `${t.root_service}::${t.root_operation}`
    if (!map[key]) {
      map[key] = { service: t.root_service, operation: t.root_operation, count: 0, errors: 0, durations: [] }
    }
    map[key].count++
    if (t.has_error) map[key].errors++
    if (t.duration_ms) map[key].durations.push(t.duration_ms)
  })
  return Object.values(map).map((e) => {
    const sorted = [...e.durations].sort((a, b) => a - b)
    const len    = sorted.length
    return {
      ...e,
      error_rate: e.count > 0 ? e.errors / e.count : 0,
      avg_ms:     len > 0 ? sorted.reduce((s, v) => s + v, 0) / len : 0,
      p99_ms:     len > 0 ? (sorted[Math.max(0, Math.floor(len * 0.99) - 1)] ?? 0) : 0,
    }
  }).sort((a, b) => b.count - a.count)
}

function EndpointRow({ ep }) {
  return (
    <tr className="border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors">
      <td className="px-4 py-2.5 text-zinc-400 text-xs">{ep.service}</td>
      <td className="px-4 py-2.5 text-zinc-200 text-xs font-mono max-w-[200px] truncate">{ep.operation}</td>
      <td className="px-4 py-2.5 text-right text-zinc-300 text-xs">{ep.count}</td>
      <td className="px-4 py-2.5 text-right text-zinc-300 text-xs font-mono">{ep.avg_ms.toFixed(1)} ms</td>
      <td className="px-4 py-2.5 text-right text-zinc-300 text-xs font-mono">{ep.p99_ms.toFixed(1)} ms</td>
      <td className="px-4 py-2.5 text-right text-xs">
        <span className={ep.error_rate > 0.01 ? 'text-red-400' : 'text-zinc-400'}>
          {(ep.error_rate * 100).toFixed(1)}%
        </span>
      </td>
    </tr>
  )
}
EndpointRow.propTypes = { ep: PropTypes.object.isRequired }

function TopEndpoints({ traces }) {
  const [open, setOpen] = useState(false)
  const endpoints = computeEndpoints(traces)
  if (endpoints.length === 0) return null

  return (
    <div className="mb-4 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-blue-400" />
          <span className="text-sm font-medium text-zinc-200">Top Endpoints</span>
          <span className="text-xs text-zinc-500">{endpoints.length} operations in window</span>
        </div>
        {open
          ? <ChevronDown  className="h-4 w-4 text-zinc-500" />
          : <ChevronRight className="h-4 w-4 text-zinc-500" />
        }
      </button>
      {open && (
        <div className="border-t border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/50">
                {['Service', 'Operation', 'Requests', 'Avg', 'P99', 'Error %'].map((h) => (
                  <th
                    key={h}
                    className={`px-4 py-2 text-xs font-medium text-zinc-400 uppercase tracking-wider ${
                      h === 'Service' || h === 'Operation' ? 'text-left' : 'text-right'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {endpoints.slice(0, 10).map((ep) => <EndpointRow key={`${ep.service}::${ep.operation}`} ep={ep} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
TopEndpoints.propTypes = { traces: PropTypes.array.isRequired }

// ── Trace list helpers ─────────────────────────────────────────────────────────
function statusColor(trace) {
  if (trace.has_error)               return 'text-red-400'
  if (trace.http_status_code >= 400) return 'text-yellow-400'
  return 'text-emerald-400'
}

function statusLabel(trace) {
  if (trace.has_error || trace.http_status_code >= 500) return 'ERROR'
  if (trace.http_status_code >= 400) return `${trace.http_status_code}`
  return 'OK'
}

// ── Trace table body (extracted to avoid nested ternaries) ────────────────────
function TraceTableBody({ loading, data, error, traces, onOpen }) {
  if (loading && !data) {
    return (
      <tr>
        <td colSpan={8} className="px-4 py-10 text-center text-sm text-zinc-500 animate-pulse">
          Loading traces…
        </td>
      </tr>
    )
  }
  if (error) {
    return (
      <tr>
        <td colSpan={8} className="px-4 py-8 text-center text-sm text-red-400">
          Failed to load — Jaeger may be unreachable
        </td>
      </tr>
    )
  }
  if (traces.length === 0) {
    return (
      <tr>
        <td colSpan={8} className="px-4 py-12 text-center text-sm text-zinc-500">No traces found</td>
      </tr>
    )
  }
  return traces.map((t) => (
    <tr
      key={t.trace_id}
      onClick={() => onOpen(t.trace_id)}
      className="border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors cursor-pointer group"
    >
      <td className="px-4 py-3">
        <span className={`text-xs font-mono font-bold ${statusColor(t)}`}>{statusLabel(t)}</span>
      </td>
      <td className="px-4 py-3 text-zinc-200 font-medium">{t.root_service}</td>
      <td className="px-4 py-3 text-zinc-400 text-xs font-mono max-w-[200px] truncate">{t.root_operation}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {(t.services || []).map((s) => (
            <span key={s} className="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{s}</span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 text-zinc-400 text-xs">{t.span_count}</td>
      <td className="px-4 py-3 text-zinc-400 text-xs">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />{' '}{t.duration_ms} ms
        </span>
      </td>
      <td className="px-4 py-3 text-zinc-500 text-xs">
        {t.start_time_ms ? new Date(t.start_time_ms).toLocaleTimeString() : '—'}
      </td>
      <td className="px-4 py-3">
        <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
      </td>
    </tr>
  ))
}
TraceTableBody.propTypes = {
  loading: PropTypes.bool,
  data:    PropTypes.object,
  error:   PropTypes.any,
  traces:  PropTypes.array.isRequired,
  onOpen:  PropTypes.func.isRequired,
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Traces() {
  const { range } = useTimeRange()
  const [service,     setService]     = useState('')
  const [errorOnly,   setErrorOnly]   = useState(false)
  const [minDuration, setMinDuration] = useState('')
  const [openTraceId, setOpenTraceId] = useState(null)

  const lookbackMinutes = Math.round(range.hours * 60)

  const fetchFn = useCallback(
    () => tracesApi.list({
      service:           service || undefined,
      lookback_minutes:  lookbackMinutes,
      error_only:        errorOnly,
      min_duration_ms:   minDuration ? Number(minDuration) : undefined,
      limit:             100,
    }),
    [service, lookbackMinutes, errorOnly, minDuration]
  )

  const { data, loading, error } = usePolling(fetchFn, 30000)
  const traces = data?.traces ?? []

  return (
    <DashboardLayout>
      <PageHeader
        title="Traces"
        subtitle={data ? `${data.total} traces · last ${range.label}` : 'Loading…'}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder="Filter by service…"
            className="h-8 pl-9 pr-4 bg-zinc-900 border border-zinc-800 rounded-md text-sm
                       text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1
                       focus:ring-blue-500 w-52"
          />
        </div>

        <input
          type="number"
          value={minDuration}
          onChange={(e) => setMinDuration(e.target.value)}
          placeholder="Min ms"
          className="h-8 w-24 px-3 bg-zinc-900 border border-zinc-800 rounded-md text-sm
                     text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={errorOnly}
            onChange={(e) => setErrorOnly(e.target.checked)}
            className="accent-red-500"
          />
          Errors only
        </label>
      </div>

      {/* Top endpoints accordion */}
      {traces.length > 0 && <TopEndpoints traces={traces} />}

      {/* Trace table */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50">
              {['Status', 'Root Service', 'Operation', 'Services', 'Spans', 'Duration', 'Time', ''].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TraceTableBody
              loading={loading}
              data={data}
              error={error}
              traces={traces}
              onOpen={setOpenTraceId}
            />
          </tbody>
        </table>
      </div>

      {openTraceId && (
        <TraceWaterfall traceId={openTraceId} onClose={() => setOpenTraceId(null)} />
      )}
    </DashboardLayout>
  )
}
