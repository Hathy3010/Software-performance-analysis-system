import PropTypes from 'prop-types'
import { useCallback, useEffect, useState, useRef } from 'react'
import {
  LineChart, Line, AreaChart, Area, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Brush, ResponsiveContainer,
} from 'recharts'
import { Wifi, WifiOff, TrendingUp, TrendingDown, Minus, Download, Layers, Target } from 'lucide-react'
import { DashboardLayout, PageHeader } from '@/components/layout/DashboardLayout'
import { Skeleton } from '@/components/ui/Skeleton'
import { usePolling } from '@/hooks/usePolling'
import { useMetricsWS } from '@/hooks/useMetricsWS'
import { metricsApi } from '@/api/metrics'
import { formatCpu, formatLatency } from '@/utils/format'
import { useTimeRange } from '@/contexts/TimeRangeContext'

// ── Constants ──────────────────────────────────────────────────────────────────
const SVC_COLOR = {
  'aiops-platform':    '#3b82f6',
  'storefront-service': '#10b981',
}
const PALETTE = ['#6366f1', '#f59e0b', '#ec4899']
const defaultColor = (i) => PALETTE[i % PALETTE.length]

const QUANTILE_OPTIONS = [
  { label: 'P50', value: 0.5  },
  { label: 'P75', value: 0.75 },
  { label: 'P95', value: 0.95 },
  { label: 'P99', value: 0.99 },
]

const SLO_DEFAULTS = {
  cpu_rate:   0.8,
  memory_mb:  512,
  latency_s:  0.5,
  error_rate: 0.01,
}

const MAX_LIVE = 60

// ── Pure helpers ───────────────────────────────────────────────────────────────
function round4(v) { return Math.round((v ?? 0) * 10000) / 10000 }
const fmtErr = (v) => `${(v * 100).toFixed(2)}%`
const fmtMem = (v) => `${v?.toFixed(0)}MB`
const fmtRps = (v) => `${v?.toFixed(2)}/s`

function trendMeta(trend) {
  if (trend === 'increasing') return { Icon: TrendingUp,   color: 'text-red-400' }
  if (trend === 'decreasing') return { Icon: TrendingDown, color: 'text-emerald-400' }
  return { Icon: Minus, color: 'text-zinc-500' }
}

function buildHistoryPoints(series, metric) {
  if (!series?.length) return []
  const tsSet = new Set()
  series.forEach((s) => s[metric]?.forEach((p) => tsSet.add(p.ts)))
  const times = [...tsSet].sort((a, b) => a - b)
  return times.map((ts) => {
    const pt = {
      time: new Date(ts * 1000).toLocaleTimeString('en-US', {
        hour12: false, hour: '2-digit', minute: '2-digit',
      }),
    }
    series.forEach((s) => {
      const found = s[metric]?.find((p) => p.ts === ts)
      pt[s.service] = found ? round4(found.value) : null
    })
    return pt
  })
}

function appendLivePoint(arr, result, key) {
  const time = new Date().toLocaleTimeString('en-US', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const pt = { time }
  result.services.forEach((s) => { pt[s.service] = round4(s[key] ?? 0) })
  return [...arr.slice(-(MAX_LIVE - 1)), pt]
}

function aggregatePoints(points, services) {
  return points.map((pt) => {
    const vals = services.map((s) => pt[s]).filter((v) => v != null)
    return { ...pt, avg: vals.length ? round4(vals.reduce((a, b) => a + b, 0) / vals.length) : null }
  })
}

function exportCsv(chartData, services, filename) {
  const header = ['time', 'service', 'cpu', 'memory_mb', 'latency_s', 'error_rate', 'rps']
  const rows = [header.join(',')]
  const times = chartData.cpu.map((p) => p.time)
  times.forEach((time, i) => {
    services.forEach((svc) => {
      rows.push([
        time, svc,
        chartData.cpu[i]?.[svc]       ?? '',
        chartData.memory[i]?.[svc]    ?? '',
        chartData.latency[i]?.[svc]   ?? '',
        chartData.errorRate[i]?.[svc] ?? '',
        chartData.rps[i]?.[svc]       ?? '',
      ].join(','))
    })
  })
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── Custom data hook (keeps Metrics() complexity within limits) ────────────────
function useMetricsData(isLive, hours, step, quantile) {
  const { connected: wsConnected, data: wsData } = useMetricsWS({ enabled: isLive })
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    if (wsData && isLive) setLastUpdated(new Date())
  }, [wsData, isLive])

  // Historical mode: REST polling (unchanged)
  const { data: histData, loading: histLoading, error: histError } = usePolling(
    useCallback(
      () => (isLive ? Promise.resolve(null) : metricsApi.getHistory({ hours, step, quantile })),
      [isLive, hours, step, quantile],
    ),
    isLive ? null : 60000,
  )

  const { data: forecastData, loading: fcLoading } = usePolling(
    () => metricsApi.getForecast(),
    60000,
  )

  const liveData = wsData
    ? { cpu: wsData.cpu, memory: wsData.memory, latency: wsData.latency, errorRate: wsData.errorRate, rps: [] }
    : { cpu: [], memory: [], latency: [], errorRate: [], rps: [] }

  const services  = wsData?.services ?? []
  const liveError = isLive && !wsConnected ? new Error('WebSocket disconnected') : null

  return { liveData, services, lastUpdated, liveError, wsConnected, histData, histLoading, histError, forecastData, fcLoading }
}

// ── Module-level sub-components ────────────────────────────────────────────────
function legendFormatter(value) {
  return <span style={{ color: '#a1a1aa' }}>{value}</span>
}

function ChartTooltip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-zinc-400 mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="font-medium" style={{ color: p.color }}>
          {p.name}: {fmt ? fmt(p.value) : p.value?.toFixed(4)}
        </p>
      ))}
    </div>
  )
}
ChartTooltip.propTypes = {
  active:  PropTypes.bool,
  payload: PropTypes.array,
  label:   PropTypes.string,
  fmt:     PropTypes.func,
}

function MetricLineChart({ points, services, fmt, height, sloValue, sloLabel, aggregate, showBrush }) {
  const displayPoints = aggregate ? aggregatePoints(points, services) : points
  const empty = !displayPoints?.length
  const totalHeight = showBrush ? height + 40 : height

  return (
    <div style={{ position: 'relative', height: totalHeight }}>
      {empty && (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-sm pointer-events-none">
          Waiting for data…
        </div>
      )}
      <ResponsiveContainer width="100%" height={totalHeight}>
        <LineChart data={displayPoints ?? []} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis dataKey="time" tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmt} width={56} />
          <Tooltip content={<ChartTooltip fmt={fmt} />} />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} formatter={legendFormatter} />
          {sloValue != null && (
            <ReferenceLine y={sloValue} stroke="#ef4444" strokeDasharray="4 3"
              label={{ value: sloLabel ?? 'SLO', fill: '#ef4444', fontSize: 9, position: 'insideTopRight' }} />
          )}
          {aggregate
            ? (
              <Line type="monotone" dataKey="avg" name="avg (all)" stroke="#60a5fa"
                dot={false} strokeWidth={2} strokeDasharray="4 2"
                activeDot={{ r: 3 }} isAnimationActive={false} />
            )
            : services.map((svc, i) => {
              const color = SVC_COLOR[svc] ?? defaultColor(i)
              return (
                <Line key={svc} type="monotone" dataKey={svc} stroke={color}
                  dot={{ r: 2, strokeWidth: 0, fill: color }} strokeWidth={2}
                  activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
              )
            })
          }
          {showBrush && (
            <Brush dataKey="time" height={28} stroke="#3f3f46" fill="#18181b" travellerWidth={6} tickFormatter={() => ''} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
MetricLineChart.defaultProps = { height: 180 }
MetricLineChart.propTypes = {
  points:    PropTypes.array.isRequired,
  services:  PropTypes.array.isRequired,
  fmt:       PropTypes.func,
  height:    PropTypes.number,
  sloValue:  PropTypes.number,
  sloLabel:  PropTypes.string,
  aggregate: PropTypes.bool,
  showBrush: PropTypes.bool,
}

function ForecastServiceArea({ fc, index }) {
  const color     = SVC_COLOR[fc.service] ?? defaultColor(index)
  const { Icon, color: trendColor } = trendMeta(fc.trend)

  // Build a unified timeline: history (actual + fitted) then future (forecast).
  // Each point carries whichever fields apply so Recharts renders two separate lines.
  const histActual = fc.history_actual || []
  const histFitted = fc.history_fitted || []
  const histLen    = Math.min(histActual.length, histFitted.length)

  // Downsample history to at most 30 points so the chart stays readable
  const step   = histLen > 30 ? Math.ceil(histLen / 30) : 1
  const histPts = []
  for (let i = 0; i < histLen; i += step) {
    histPts.push({
      label:  `-${histLen - i}m`,
      actual: round4(histActual[i]),
      fitted: round4(histFitted[i]),
    })
  }

  const futurePts = (fc.predictions || []).map((v, i) => ({
    label:    `+${i + 1}m`,
    forecast: round4(v),
  }))

  // Divider point — connects the last history fitted value to the first forecast value
  const divider = histPts.length > 0 && futurePts.length > 0
    ? [{ label: '0m', fitted: histPts[histPts.length - 1].fitted, forecast: futurePts[0].forecast }]
    : []

  const allPoints = [...histPts, ...divider, ...futurePts]

  // Compute Y-axis domain across all values for a tight, curve-revealing scale
  const allVals = [
    ...histActual,
    ...histFitted,
    ...(fc.predictions || []),
  ].filter((v) => v != null && isFinite(v))
  const minV = allVals.length ? Math.min(...allVals) : 0
  const maxV = allVals.length ? Math.max(...allVals) : 1
  const pad  = Math.max((maxV - minV) * 0.35, 0.004)
  const yDomain = [Math.max(0, minV - pad), maxV + pad]

  const gradId = `fg-${index}`

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap gap-y-1">
        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs font-medium text-zinc-300">{fc.service}</span>
        <Icon className={`h-3.5 w-3.5 ${trendColor}`} />
        <span className={`text-xs capitalize ${trendColor}`}>{fc.trend}</span>
        <span className="ml-auto text-xs text-zinc-500">{fc.confidence_note}</span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-1 ml-1">
        <span className="flex items-center gap-1 text-[10px] text-zinc-500">
          <span className="inline-block w-4 h-px border-t border-dashed border-zinc-500" />
          actual
        </span>
        <span className="flex items-center gap-1 text-[10px]" style={{ color }}>
          <span className="inline-block w-4 h-0.5 rounded" style={{ backgroundColor: color }} />
          poly fit
        </span>
        <span className="flex items-center gap-1 text-[10px] text-yellow-400">
          <span className="inline-block w-4 h-px border-t-2 border-dashed border-yellow-400" />
          forecast
        </span>
      </div>

      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={allPoints} margin={{ top: 4, right: 12, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.15} />
              <stop offset="95%" stopColor={color} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#52525b', fontSize: 9 }} tickLine={false}
                 axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fill: '#71717a', fontSize: 9 }} tickLine={false} axisLine={false}
                 width={44} tickFormatter={formatCpu} domain={yDomain} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              return (
                <div className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-[10px]">
                  <p className="text-zinc-400 mb-1">{label}</p>
                  {payload.map((p) => (
                    <p key={p.dataKey} style={{ color: p.color }}>
                      {p.name}: {formatCpu(p.value)}
                    </p>
                  ))}
                </div>
              )
            }}
          />
          {/* Raw historical CPU — faint dashed to show noise */}
          <Line type="monotone" dataKey="actual" name="actual" stroke="#52525b"
                strokeWidth={1} strokeDasharray="3 2" dot={false} connectNulls={false} />
          {/* Polynomial fit through history — solid curved line, clearly non-linear */}
          <Line type="natural" dataKey="fitted" name="poly fit" stroke={color}
                strokeWidth={2} dot={false} connectNulls />
          {/* Future forecast — dashed yellow, extends the curve forward */}
          <Line type="natural" dataKey="forecast" name="forecast" stroke="#facc15"
                strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
ForecastServiceArea.propTypes = {
  fc:    PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
}

function ForecastChart({ forecasts }) {
  if (!forecasts?.length) {
    return (
      <div className="flex items-center justify-center text-zinc-600 text-sm h-40">
        No forecast data — AI engine generates this every 60 s
      </div>
    )
  }
  return (
    <div className="space-y-4">
      {forecasts.map((fc, i) => <ForecastServiceArea key={fc.service} fc={fc} index={i} />)}
    </div>
  )
}
ForecastChart.propTypes = { forecasts: PropTypes.array }

function ChartCardBody({ loading, error, children }) {
  if (loading) return <Skeleton className="h-44 w-full" />
  if (error)   return <div className="h-44 flex items-center justify-center text-sm text-red-400">Unable to load</div>
  return children
}
ChartCardBody.propTypes = {
  loading:  PropTypes.bool,
  error:    PropTypes.any,
  children: PropTypes.node,
}

function ChartCard({ title, subtitle, loading, error, children }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
      <div className="mb-4">
        <h3 className="text-sm font-medium text-zinc-200">{title}</h3>
        {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      <ChartCardBody loading={loading} error={error}>{children}</ChartCardBody>
    </div>
  )
}
ChartCard.propTypes = {
  title:    PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  loading:  PropTypes.bool,
  error:    PropTypes.any,
  children: PropTypes.node,
}

function SnapshotRow({ svc, index, chartData }) {
  const cpuLast = chartData.cpu[chartData.cpu.length - 1]
  const memLast = chartData.memory[chartData.memory.length - 1]
  const latLast = chartData.latency[chartData.latency.length - 1]
  const errLast = chartData.errorRate[chartData.errorRate.length - 1]
  const rpsLast = chartData.rps[chartData.rps.length - 1]
  const errVal  = errLast?.[svc] ?? 0
  return (
    <tr className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
      <td className="px-4 py-2.5 text-zinc-200 font-medium">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SVC_COLOR[svc] ?? defaultColor(index) }} />
          {svc}
        </div>
      </td>
      <td className="px-4 py-2.5 text-right text-zinc-300 font-mono text-xs">{formatCpu(cpuLast?.[svc])}</td>
      <td className="px-4 py-2.5 text-right text-zinc-300 font-mono text-xs">{fmtMem(memLast?.[svc])}</td>
      <td className="px-4 py-2.5 text-right text-zinc-300 font-mono text-xs">{formatLatency(latLast?.[svc])}</td>
      <td className="px-4 py-2.5 text-right font-mono text-xs">
        <span className={errVal > 0.01 ? 'text-red-400' : 'text-zinc-300'}>{fmtErr(errVal)}</span>
      </td>
      <td className="px-4 py-2.5 text-right text-zinc-300 font-mono text-xs">{fmtRps(rpsLast?.[svc])}</td>
    </tr>
  )
}
SnapshotRow.propTypes = {
  svc:       PropTypes.string.isRequired,
  index:     PropTypes.number.isRequired,
  chartData: PropTypes.object.isRequired,
}

// ── Toolbar components ─────────────────────────────────────────────────────────
function PillGroup({ options, value, onChange, keyProp, labelProp }) {
  return (
    <div className="flex items-center gap-1">
      {options.map((o) => (
        <button
          key={o[keyProp]}
          onClick={() => onChange(o[keyProp])}
          className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${
            value === o[keyProp]
              ? 'bg-blue-600/15 text-blue-400 border border-blue-800/50'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
          }`}
        >
          {o[labelProp]}
        </button>
      ))}
    </div>
  )
}
PillGroup.propTypes = {
  options:   PropTypes.array.isRequired,
  value:     PropTypes.any.isRequired,
  onChange:  PropTypes.func.isRequired,
  keyProp:   PropTypes.string.isRequired,
  labelProp: PropTypes.string.isRequired,
}

function TogglePill({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`h-8 px-3 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
        active
          ? 'bg-blue-600/15 text-blue-400 border border-blue-800/50'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}
TogglePill.propTypes = {
  active:  PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
  icon:    PropTypes.elementType.isRequired,
  label:   PropTypes.string.isRequired,
}

// ── MetricCharts — extracted to keep Metrics() complexity in bounds ────────────
function MetricCharts({ chartData, chartSvcs, isLive, loading, error, hasData, quantileLabel, showSlo, aggregate, showBrush }) {
  const sharedProps = { services: chartSvcs, aggregate, showBrush }
  const cardLoading = loading && !hasData
  const cardError   = error && !hasData

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="CPU Rate" subtitle="cores/s · 5 m rate" loading={cardLoading} error={cardError}>
          <MetricLineChart points={chartData.cpu} fmt={formatCpu}
            sloValue={showSlo ? SLO_DEFAULTS.cpu_rate : null} sloLabel="SLO 80%" {...sharedProps} />
        </ChartCard>

        <ChartCard title="Memory" subtitle="resident MB" loading={cardLoading} error={cardError}>
          <MetricLineChart points={chartData.memory} fmt={fmtMem}
            sloValue={showSlo ? SLO_DEFAULTS.memory_mb : null} sloLabel="SLO 512 MB" {...sharedProps} />
        </ChartCard>

        <ChartCard title={`${quantileLabel} Latency`} subtitle={isLive ? 'P99 · live' : `${quantileLabel} · seconds`} loading={cardLoading} error={cardError}>
          <MetricLineChart points={chartData.latency} fmt={formatLatency}
            sloValue={showSlo ? SLO_DEFAULTS.latency_s : null} sloLabel="SLO 500 ms" {...sharedProps} />
        </ChartCard>

        <ChartCard title="Error Rate (5xx)" subtitle="fraction of requests" loading={cardLoading} error={cardError}>
          <MetricLineChart points={chartData.errorRate} fmt={fmtErr}
            sloValue={showSlo ? SLO_DEFAULTS.error_rate : null} sloLabel="SLO 1%" {...sharedProps} />
        </ChartCard>
      </div>

      {!isLive && (
        <ChartCard title="Throughput" subtitle="requests per second · sum(rate(http_requests_total[5m]))" loading={cardLoading} error={cardError}>
          <MetricLineChart points={chartData.rps} fmt={fmtRps} {...sharedProps} />
        </ChartCard>
      )}
    </div>
  )
}
MetricCharts.propTypes = {
  chartData:    PropTypes.object.isRequired,
  chartSvcs:    PropTypes.array.isRequired,
  isLive:       PropTypes.bool.isRequired,
  loading:      PropTypes.bool,
  error:        PropTypes.any,
  hasData:      PropTypes.bool.isRequired,
  quantileLabel: PropTypes.string.isRequired,
  showSlo:      PropTypes.bool.isRequired,
  aggregate:    PropTypes.bool.isRequired,
  showBrush:    PropTypes.bool.isRequired,
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Metrics() {
  const { range } = useTimeRange()
  const [isLive,    setIsLive]    = useState(false)
  const [quantile,  setQuantile]  = useState(0.99)
  const [aggregate, setAggregate] = useState(false)
  const [showSlo,   setShowSlo]   = useState(false)
  const [showBrush, setShowBrush] = useState(false)

  const hours = isLive ? 1 : range.hours
  const step  = isLive ? 60 : range.step

  const {
    liveData, services, lastUpdated, liveError, wsConnected,
    histData, histLoading, histError, forecastData, fcLoading,
  } = useMetricsData(isLive, hours, step, quantile)

  const loading = isLive ? false : histLoading
  const error   = isLive ? liveError : histError

  const histChartData = {
    cpu:       buildHistoryPoints(histData?.series, 'cpu_rate'),
    memory:    buildHistoryPoints(histData?.series, 'memory_mb'),
    latency:   buildHistoryPoints(histData?.series, 'latency_s'),
    errorRate: buildHistoryPoints(histData?.series, 'error_rate'),
    rps:       buildHistoryPoints(histData?.series, 'rps'),
  }
  const chartData     = isLive ? liveData : histChartData
  const chartSvcs     = isLive ? services : (histData?.series?.map((s) => s.service) ?? [])
  const hasData       = chartData.cpu.length > 0
  const quantileLabel = QUANTILE_OPTIONS.find((o) => o.value === quantile)?.label ?? 'P99'

  const exportRef = useRef(chartData)
  exportRef.current = chartData
  function handleExport() {
    exportCsv(exportRef.current, chartSvcs, `metrics-${new Date().toISOString().slice(0, 16)}.csv`)
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Metrics"
        subtitle={isLive ? 'Live stream — refreshes every 10 s' : `Historical · last ${range.label}`}
        action={
          <div className="flex items-center gap-1.5 text-xs">
            {error
              ? <span className="flex items-center gap-1.5 text-red-400"><WifiOff className="h-3.5 w-3.5" /> Disconnected</span>
              : isLive
                ? <span className="flex items-center gap-1.5 text-emerald-400">
                    {wsConnected
                      ? <><Wifi className="h-3.5 w-3.5" />{lastUpdated ? `WS · ${lastUpdated.toLocaleTimeString()}` : 'WS connecting…'}</>
                      : <><WifiOff className="h-3.5 w-3.5 text-amber-400" /><span className="text-amber-400">Reconnecting…</span></>
                    }
                  </span>
                : <span className="flex items-center gap-1.5 text-zinc-400">
                    <Wifi className="h-3.5 w-3.5" />
                    {lastUpdated ? `Polled ${lastUpdated.toLocaleTimeString()}` : 'Loading…'}
                  </span>
            }
          </div>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsLive(true)}
            className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${
              isLive
                ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-800/50'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            ● Live
          </button>
          <button
            onClick={() => setIsLive(false)}
            className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${
              isLive
                ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                : 'bg-blue-600/15 text-blue-400 border border-blue-800/50'
            }`}
          >
            Historical
          </button>
        </div>

        {!isLive && (
          <>
            <span className="h-4 w-px bg-zinc-700" />
            <PillGroup options={QUANTILE_OPTIONS} value={quantile} onChange={setQuantile} keyProp="value" labelProp="label" />
          </>
        )}

        <span className="h-4 w-px bg-zinc-700" />
        <TogglePill active={aggregate} onClick={() => setAggregate((v) => !v)} icon={Layers}     label="Aggregate" />
        <TogglePill active={showSlo}   onClick={() => setShowSlo((v) => !v)}   icon={Target}     label="SLO lines" />
        <TogglePill active={showBrush} onClick={() => setShowBrush((v) => !v)} icon={TrendingUp} label="Zoom" />
        <span className="flex-1" />
        {hasData && (
          <button
            onClick={handleExport}
            className="h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        )}
      </div>

      {/* DEBUG */}
      <div className="mb-3 p-2 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-zinc-300">
        <span className="text-blue-400">{isLive ? 'LIVE' : 'HIST'}</span>
        {' | svcs: '}<span className="text-green-400">[{chartSvcs.join(',')}]</span>
        {' | cpu_pts: '}<span className="text-yellow-400">{chartData.cpu.length}</span>
        {' | err: '}<span className="text-red-400">{error ? error.message : 'null'}</span>
        {chartData.cpu[0] && <span className="text-cyan-400">{' | v0: ' + JSON.stringify(chartData.cpu[0]).slice(0,100)}</span>}
      </div>

      {/* Charts */}
      <MetricCharts
        chartData={chartData}
        chartSvcs={chartSvcs}
        isLive={isLive}
        loading={loading}
        error={error}
        hasData={hasData}
        quantileLabel={quantileLabel}
        showSlo={showSlo}
        aggregate={aggregate}
        showBrush={showBrush}
      />

      {/* CPU Forecast */}
      <div className={isLive ? 'mt-0' : 'mt-4'}>
        <ChartCard
          title="CPU Forecast"
          subtitle="Polynomial regression · next 30 min · generated every 60 s by AI engine"
          loading={fcLoading && !forecastData}
        >
          <ForecastChart forecasts={forecastData?.forecasts ?? []} />
        </ChartCard>
      </div>

      {/* Snapshot table */}
      {hasData && chartSvcs.length > 0 && (
        <div className="mt-4 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-medium text-zinc-200">Current Snapshot</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Service', 'CPU', 'Memory', `${quantileLabel} Latency`, 'Error Rate', 'RPS'].map((h) => (
                  <th
                    key={h}
                    className={`px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wider ${
                      h === 'Service' ? 'text-left' : 'text-right'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chartSvcs.map((svc, i) => (
                <SnapshotRow key={svc} svc={svc} index={i} chartData={chartData} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  )
}
