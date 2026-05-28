import PropTypes from 'prop-types'
import { useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search, AlertTriangle, CheckCircle, ChevronRight,
  Bell, BellOff, Clock, MessageSquare, X,
} from 'lucide-react'
import { DashboardLayout, PageHeader } from '@/components/layout/DashboardLayout'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { SkeletonRow } from '@/components/ui/Skeleton'
import { usePolling } from '@/hooks/usePolling'
import { useToast } from '@/contexts/ToastContext'
import { useRole } from '@/contexts/AuthContext'
import { incidentsApi } from '@/api/incidents'
import { alertsApi } from '@/api/alerts'
import { servicesApi } from '@/api/services'
import { formatDate, formatDuration } from '@/utils/format'

// ── Constants ──────────────────────────────────────────────────────────────────
const REASON_LABELS = {
  highest_child_latency:    { label: 'Latency Bottleneck', color: 'text-amber-400',  dot: 'bg-amber-400'  },
  server_error_propagation: { label: 'Server Error (5xx)', color: 'text-red-400',    dot: 'bg-red-400'    },
  client_error_4xx:         { label: 'Client Error (4xx)', color: 'text-orange-400', dot: 'bg-orange-400' },
  db_slow_query:            { label: 'Slow DB Query',      color: 'text-purple-400', dot: 'bg-purple-400' },
  exception_detected:       { label: 'Exception',          color: 'text-pink-400',   dot: 'bg-pink-400'   },
  self_anomaly:             { label: 'Self Anomaly',       color: 'text-zinc-400',   dot: 'bg-zinc-500'   },
}
const STATUS_FILTERS = ['all', 'open', 'investigating', 'resolved', 'closed']
const SKELETON_KEYS  = Array.from({ length: 5 }, (_, i) => `skeleton-${i}`)

// ── Timeline ───────────────────────────────────────────────────────────────────
function buildTimelineEvents(incident, alerts) {
  const events = []
  if (incident.started_at) {
    events.push({ ts: incident.started_at, label: 'Incident opened', dot: 'bg-red-400', color: 'text-red-400' })
  }
  alerts.filter((a) => a.fired_at).forEach((a) => {
    events.push({ ts: a.fired_at, label: `Alert fired: ${a.name}`, dot: 'bg-orange-400', color: 'text-orange-400' })
  })
  alerts.filter((a) => a.status === 'acknowledged' && a.acknowledged_at).forEach((a) => {
    events.push({
      ts: a.acknowledged_at,
      label: `${a.name} acknowledged by ${a.acknowledged_by ?? 'unknown'}${a.acknowledge_comment ? ` — "${a.acknowledge_comment}"` : ''}`,
      dot: 'bg-blue-400',
      color: 'text-blue-400',
    })
  })
  if (incident.status === 'investigating') {
    events.push({ ts: incident.updated_at, label: 'Status → investigating', dot: 'bg-amber-400', color: 'text-amber-400' })
  }
  if (incident.resolved_at) {
    events.push({ ts: incident.resolved_at, label: 'Incident resolved', dot: 'bg-emerald-400', color: 'text-emerald-400' })
  }
  return events.filter((e) => e.ts).sort((a, b) => new Date(a.ts) - new Date(b.ts))
}

function IncidentTimeline({ events }) {
  if (events.length === 0) return null
  return (
    <div>
      <p className="text-xs font-medium text-zinc-400 mb-3 flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5" />Timeline
      </p>
      <div className="space-y-0">
        {events.map((e, i) => (
          <div key={`${e.ts}-${i}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${e.dot}`} />
              {i < events.length - 1 && <div className="w-px flex-1 bg-zinc-800 my-1" />}
            </div>
            <div className="pb-3">
              <p className={`text-xs font-medium ${e.color}`}>{e.label}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{formatDate(e.ts)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
IncidentTimeline.propTypes = { events: PropTypes.array.isRequired }

// ── Acknowledge Modal ──────────────────────────────────────────────────────────
function AcknowledgeModal({ alert, onClose, onConfirm }) {
  const [comment, setComment] = useState('')
  const [saving,  setSaving]  = useState(false)

  async function handleConfirm() {
    if (!comment.trim()) return
    setSaving(true)
    try {
      await onConfirm(alert.id, comment.trim())
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!alert) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <p className="text-sm font-semibold text-white">Acknowledge Alert</p>
            <p className="text-xs text-zinc-500 mt-0.5">{alert.name}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2.5">
            <p className="text-xs text-zinc-500 mb-0.5">Alert</p>
            <p className="text-sm text-zinc-200">{alert.name}</p>
            <p className="text-xs text-zinc-500 mt-1">{alert.message}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Comment <span className="text-red-400">*</span>
              <span className="ml-1 text-zinc-600 font-normal">(required — describe what you are investigating)</span>
            </label>
            <textarea
              autoFocus
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="e.g. Investigating DB latency spike on order-service…"
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-zinc-200
                         placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <MessageSquare className="h-3.5 w-3.5" />
              Comment will appear in the incident timeline
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="h-8 px-4 text-xs text-zinc-400 hover:text-zinc-200 rounded-md hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!comment.trim() || saving}
                onClick={handleConfirm}
                className="h-8 px-4 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-md
                           transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <BellOff className="h-3 w-3" />
                {saving ? 'Acknowledging…' : 'Acknowledge'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
AcknowledgeModal.propTypes = {
  alert:     PropTypes.object,
  onClose:   PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
}

// ── Alerts section (inside incident modal) ─────────────────────────────────────
function AlertsSection({ incidentId }) {
  const toast          = useToast()
  const { can }        = useRole()
  const [ackTarget, setAckTarget] = useState(null)
  const canAck         = can('acknowledge_alert')

  const { data, loading, refetch } = usePolling(
    useCallback(() => alertsApi.list({ incident_id: incidentId, limit: 20 }), [incidentId]),
    15000,
  )

  async function handleAcknowledge(alertId, comment) {
    try {
      await alertsApi.acknowledge(alertId, comment)
      toast('Alert acknowledged', 'success')
      refetch()
    } catch {
      toast('Failed to acknowledge alert', 'error')
      throw new Error('ack failed')
    }
  }

  if (loading && !data) {
    return <div className="h-8 animate-pulse bg-zinc-800 rounded" />
  }

  const firing = (data?.items ?? []).filter((a) => a.status === 'firing')
  if (firing.length === 0) {
    return <p className="text-xs text-zinc-600 py-1">No active alerts — all clear or acknowledged</p>
  }

  return (
    <>
      <div className="space-y-2">
        {firing.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <Bell className="h-3.5 w-3.5 text-orange-400 shrink-0" />
              <span className="text-sm text-zinc-200 truncate">{a.name}</span>
              <Badge variant={a.severity} />
            </div>
            {canAck && (
              <button
                type="button"
                onClick={() => setAckTarget(a)}
                className="ml-3 shrink-0 flex items-center gap-1.5 h-7 px-2.5 text-xs font-medium
                           bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
              >
                <BellOff className="h-3 w-3" />Acknowledge
              </button>
            )}
          </div>
        ))}
      </div>
      <AcknowledgeModal
        alert={ackTarget}
        onClose={() => setAckTarget(null)}
        onConfirm={handleAcknowledge}
      />
    </>
  )
}
AlertsSection.propTypes = { incidentId: PropTypes.string.isRequired }

// ── RCA section ────────────────────────────────────────────────────────────────
function RcaSection({ incidentId }) {
  const { data, loading, error } = usePolling(() => incidentsApi.getRca(incidentId), 60000)

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-3 bg-zinc-800 rounded w-3/4" />
        <div className="h-3 bg-zinc-800 rounded w-1/2" />
      </div>
    )
  }

  if (error || !data?.results?.length) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500 py-2">
        <AlertTriangle className="h-4 w-4 text-zinc-600" />
        No RCA data yet — AI Engine will populate this after analysis
      </div>
    )
  }

  const top        = data.results[0]
  const evidence   = typeof top.evidence === 'string' ? JSON.parse(top.evidence) : (top.evidence ?? {})
  const candidates = evidence.candidates ?? []
  const chain      = evidence.dependency_chain ?? []

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        <p className="text-sm text-zinc-200 leading-relaxed">{top.root_cause_description}</p>
      </div>
      {chain.length > 1 && (
        <div>
          <p className="text-xs font-medium text-zinc-400 mb-2">Dependency Chain</p>
          <div className="flex items-center gap-1 flex-wrap">
            {chain.map((svc, i) => (
              <span key={`${svc}-${i}`} className="flex items-center gap-1">
                <span className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 px-2 py-0.5 rounded">{svc}</span>
                {i < chain.length - 1 && <span className="text-zinc-600 text-xs">→</span>}
              </span>
            ))}
          </div>
        </div>
      )}
      {candidates.length > 0 && (
        <div>
          <p className="text-xs font-medium text-zinc-400 mb-2">Root Cause Candidates ({candidates.length})</p>
          <div className="space-y-2">
            {candidates.map((c, i) => {
              const meta = REASON_LABELS[c.reason] ?? { label: c.reason, color: 'text-zinc-400', dot: 'bg-zinc-500' }
              return (
                <div key={`${c.service}-${c.reason}-${i}`} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      <span className="text-sm font-medium text-zinc-200">{c.service}</span>
                      <span className={`text-xs ${meta.color}`}>{meta.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(c.confidence ?? 0) * 100}%` }} />
                      </div>
                      <span className="text-xs font-medium text-blue-400 w-8 text-right">
                        {((c.confidence ?? 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  {c.evidence && Object.keys(c.evidence).length > 0 && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                      {Object.entries(c.evidence)
                        .filter(([, v]) => v != null && v !== '' && v !== false)
                        .slice(0, 4)
                        .map(([k, v]) => (
                          <div key={k} className="flex gap-1.5 text-xs">
                            <span className="text-zinc-500 shrink-0">{k.replaceAll('_', ' ')}</span>
                            <span className="text-zinc-300 truncate">{String(v)}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      <p className="text-xs text-zinc-600">{`Analyzed ${formatDate(top.created_at)}`}</p>
    </div>
  )
}
RcaSection.propTypes = { incidentId: PropTypes.string.isRequired }

// ── Incident detail modal ──────────────────────────────────────────────────────
function IncidentModal({ incident, onClose, onResolve }) {
  const toast       = useToast()
  const [resolving, setResolving] = useState(false)

  const { data: alertData } = usePolling(
    useCallback(
      () => (incident ? alertsApi.list({ incident_id: incident.id, limit: 20 }) : Promise.resolve(null)),
      [incident],
    ),
    30000,
  )
  const allAlerts    = alertData?.items ?? []
  const timelineEvts = incident ? buildTimelineEvents(incident, allAlerts) : []

  async function handleResolve() {
    setResolving(true)
    try {
      await onResolve(incident.id)
      toast('Incident resolved', 'success')
      onClose()
    } catch {
      toast('Failed to resolve incident', 'error')
    } finally {
      setResolving(false)
    }
  }

  return (
    <Modal
      open={!!incident}
      onClose={onClose}
      title={incident?.title}
      subtitle={`Incident #${incident?.id?.slice(0, 8)}`}
      size="lg"
    >
      {incident && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Status',   value: <Badge variant={incident.status} /> },
              { label: 'Severity', value: <Badge variant={incident.severity} /> },
              { label: 'Started',  value: formatDate(incident.started_at) },
              { label: 'Duration', value: formatDuration(incident.duration_seconds) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2.5">
                <p className="text-xs text-zinc-500 mb-1">{label}</p>
                <div className="text-sm text-zinc-200">{value}</div>
              </div>
            ))}
          </div>

          {incident.description && (
            <div>
              <p className="text-xs font-medium text-zinc-400 mb-1.5">Description</p>
              <p className="text-sm text-zinc-300 leading-relaxed">{incident.description}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-zinc-400 mb-2 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-400" /> Active Alerts
            </p>
            <AlertsSection incidentId={incident.id} />
          </div>

          <IncidentTimeline events={timelineEvts} />

          <div>
            <p className="text-xs font-medium text-zinc-400 mb-2 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" /> Root Cause Analysis
            </p>
            <RcaSection incidentId={incident.id} />
          </div>

          {incident.status !== 'resolved' && incident.status !== 'closed' && (
            <div className="flex justify-end pt-2 border-t border-zinc-800">
              <Button variant="outline" size="sm" onClick={handleResolve} loading={resolving} className="gap-2">
                <CheckCircle className="h-3.5 w-3.5" />Mark as Resolved
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
IncidentModal.propTypes = {
  incident:  PropTypes.object,
  onClose:   PropTypes.func.isRequired,
  onResolve: PropTypes.func.isRequired,
}

// ── Table body ─────────────────────────────────────────────────────────────────
function IncidentTableBody({ loading, data, error, filtered, onSelect }) {
  if (loading && !data) {
    return SKELETON_KEYS.map((k) => (
      <tr key={k}><td colSpan={6}><SkeletonRow /></td></tr>
    ))
  }
  if (error) {
    return (
      <tr>
        <td colSpan={6} className="px-4 py-8 text-center text-sm text-red-400">Failed to load incidents</td>
      </tr>
    )
  }
  if (filtered.length === 0) {
    return (
      <tr>
        <td colSpan={6} className="px-4 py-12 text-center">
          <AlertTriangle className="h-7 w-7 text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">No incidents found</p>
        </td>
      </tr>
    )
  }
  return filtered.map((inc) => (
    <tr
      key={inc.id}
      onClick={() => onSelect(inc)}
      className="border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors cursor-pointer group"
    >
      <td className="px-4 py-3 text-zinc-200 font-medium max-w-xs truncate">{inc.title}</td>
      <td className="px-4 py-3"><Badge variant={inc.severity} /></td>
      <td className="px-4 py-3"><Badge variant={inc.status} /></td>
      <td className="px-4 py-3 text-zinc-400 text-xs">{formatDate(inc.started_at)}</td>
      <td className="px-4 py-3 text-zinc-400 text-xs">{formatDuration(inc.duration_seconds)}</td>
      <td className="px-4 py-3">
        <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
      </td>
    </tr>
  ))
}
IncidentTableBody.propTypes = {
  loading:  PropTypes.bool,
  data:     PropTypes.object,
  error:    PropTypes.any,
  filtered: PropTypes.array.isRequired,
  onSelect: PropTypes.func.isRequired,
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Incidents() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [serviceFilter, setServiceFilter] = useState(searchParams.get('service') ?? '')
  const [selected,     setSelected]     = useState(null)

  // Keep URL in sync with the service filter
  useEffect(() => {
    const current = searchParams.get('service') ?? ''
    if (current !== serviceFilter) {
      setSearchParams(serviceFilter ? { service: serviceFilter } : {}, { replace: true })
    }
  }, [serviceFilter, searchParams, setSearchParams])

  // When URL changes externally (e.g. from Logs page link), sync local state
  useEffect(() => {
    const fromUrl = searchParams.get('service') ?? ''
    setServiceFilter(fromUrl)
  }, [searchParams])

  // Fetch services for the filter pill list
  const { data: servicesData } = usePolling(
    useCallback(() => servicesApi.list({ limit: 100 }), []),
    null,
  )
  const serviceNames = (servicesData?.items ?? []).map((s) => s.name)

  const { data, loading, error, refetch } = usePolling(
    () => incidentsApi.list({ limit: 100, status: statusFilter === 'all' ? undefined : statusFilter }),
    15000,
  )

  const handleResolve = useCallback(async (id) => {
    await incidentsApi.resolve(id)
    refetch()
  }, [refetch])

  const filtered = (data?.items ?? []).filter((inc) => {
    const matchText    = inc.title.toLowerCase().includes(search.toLowerCase())
    const matchService = !serviceFilter || (inc.service_name ?? '').toLowerCase().includes(serviceFilter.toLowerCase())
    return matchText && matchService
  })

  return (
    <DashboardLayout>
      <PageHeader
        title="Incidents"
        subtitle={data ? `${data.total} total` : 'Loading…'}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Text search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search incidents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-9 pr-4 bg-zinc-900 border border-zinc-800 rounded-md text-sm text-zinc-300
                       placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 w-56"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`h-8 px-3 rounded-md text-xs font-medium transition-colors capitalize ${
                statusFilter === s
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-800/50'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Service filter — populated from URL or pill click */}
        {serviceFilter && (
          <div className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-purple-900/30 border border-purple-800/50 text-xs text-purple-300">
            <span>service: <strong>{serviceFilter}</strong></span>
            <button onClick={() => setServiceFilter('')} className="text-purple-400 hover:text-purple-200">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Service quick-filter pills */}
      {serviceNames.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-4">
          {serviceNames.map((name) => (
            <button
              key={name}
              onClick={() => setServiceFilter(serviceFilter === name ? '' : name)}
              className={`h-6 px-2.5 rounded text-xs transition-colors ${
                serviceFilter === name
                  ? 'bg-purple-600/20 text-purple-300 border border-purple-700/50'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50">
              {['Title', 'Severity', 'Status', 'Started', 'Duration', ''].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <IncidentTableBody
              loading={loading}
              data={data}
              error={error}
              filtered={filtered}
              onSelect={setSelected}
            />
          </tbody>
        </table>
      </div>

      <IncidentModal
        incident={selected}
        onClose={() => setSelected(null)}
        onResolve={handleResolve}
      />
    </DashboardLayout>
  )
}
