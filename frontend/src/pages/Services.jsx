import PropTypes from 'prop-types'
import { useState, useCallback, useEffect } from 'react'
import {
  Search, Plus, Pencil, Trash2, Server,
  X, Cpu, HardDrive, Clock, AlertTriangle, Activity, GitBranch,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { DashboardLayout, PageHeader } from '@/components/layout/DashboardLayout'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input, Select } from '@/components/ui/Input'
import { SkeletonRow, Skeleton } from '@/components/ui/Skeleton'
import { usePolling } from '@/hooks/usePolling'
import { useToast } from '@/contexts/ToastContext'
import { servicesApi } from '@/api/services'
import { metricsApi } from '@/api/metrics'
import { incidentsApi } from '@/api/incidents'
import { tracesApi } from '@/api/traces'
import { analyticsApi } from '@/api/analytics'
import { formatDate } from '@/utils/format'

const BLANK = {
  name: '', type: 'api', environment: 'production',
  description: '', base_url: '', status: 'unknown',
}

const SERVICE_TYPES = ['web', 'api', 'database', 'cache', 'queue', 'worker', 'other']
const ENVIRONMENTS = ['production', 'staging', 'development']
const STATUSES = ['healthy', 'degraded', 'down', 'unknown']

// ── ServiceForm ────────────────────────────────────────────────────────────────
function ServiceForm({ initial = BLANK, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})

  const set = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }))

  function validate() {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Name is required'
    return errs
  }

  function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    onSubmit(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Input label="Service Name" value={form.name} onChange={set('name')} error={errors.name} placeholder="payment-service" />
        </div>
        <Select label="Type" value={form.type} onChange={set('type')}>
          {SERVICE_TYPES.map((t) => <option key={t}>{t}</option>)}
        </Select>
        <Select label="Environment" value={form.environment} onChange={set('environment')}>
          {ENVIRONMENTS.map((e) => <option key={e}>{e}</option>)}
        </Select>
        <Input label="Base URL" value={form.base_url} onChange={set('base_url')} placeholder="https://api.example.com" />
        <Select label="Status" value={form.status} onChange={set('status')}>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </Select>
        <div className="sm:col-span-2">
          <Input label="Description" value={form.description} onChange={set('description')} placeholder="Brief description (optional)" />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" loading={loading}>
          {initial.name ? 'Save changes' : 'Create service'}
        </Button>
      </div>
    </form>
  )
}
ServiceForm.propTypes = {
  initial:  PropTypes.object,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  loading:  PropTypes.bool,
}

// ── DeleteConfirm ──────────────────────────────────────────────────────────────
function DeleteConfirm({ service, onConfirm, onCancel, loading }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-300">
        Are you sure you want to delete{' '}
        <span className="font-semibold text-zinc-50">{service.name}</span>?
        This action cannot be undone.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button variant="destructive" size="sm" onClick={onConfirm} loading={loading}>
          Delete
        </Button>
      </div>
    </div>
  )
}
DeleteConfirm.propTypes = {
  service:   PropTypes.object.isRequired,
  onConfirm: PropTypes.func.isRequired,
  onCancel:  PropTypes.func.isRequired,
  loading:   PropTypes.bool,
}

// ── Detail panel helpers ───────────────────────────────────────────────────────
function MetricStat({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`h-3.5 w-3.5 ${color ?? 'text-zinc-500'}`} />
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <p className="text-lg font-semibold text-zinc-100 leading-none">{value}</p>
    </div>
  )
}
MetricStat.propTypes = {
  icon:  PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  color: PropTypes.string,
}

function AnomalyTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300">
      score: {payload[0].value?.toFixed(3)}
    </div>
  )
}
AnomalyTooltip.propTypes = { active: PropTypes.bool, payload: PropTypes.array }

function AnomalyMiniChart({ points }) {
  if (points.length) {
    return (
      <ResponsiveContainer width="100%" height={80}>
        <LineChart data={points} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis dataKey="time" tick={{ fill: '#52525b', fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis domain={[0, 1]} tick={{ fill: '#52525b', fontSize: 9 }} tickLine={false} axisLine={false} />
          <Tooltip content={<AnomalyTooltip />} />
          <Line type="monotone" dataKey="score" stroke="#3b82f6" dot={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
    )
  }
  return <p className="text-xs text-zinc-600 py-4 text-center">No anomaly data in last hour</p>
}
AnomalyMiniChart.propTypes = { points: PropTypes.array.isRequired }

function incidentDotColor(status) {
  if (status === 'open')          return 'bg-red-400'
  if (status === 'investigating') return 'bg-amber-400'
  return 'bg-emerald-400'
}

function incidentBadgeClass(severity) {
  if (severity === 'critical') return 'bg-red-950 text-red-400'
  if (severity === 'high')     return 'bg-orange-950 text-orange-400'
  return 'bg-zinc-800 text-zinc-400'
}

function IncidentItem({ inc }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2">
      <div className={`mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 ${incidentDotColor(inc.status)}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-zinc-200 truncate">{inc.title}</p>
        <p className="text-xs text-zinc-600 mt-0.5">{formatDate(inc.created_at)}</p>
      </div>
      <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${incidentBadgeClass(inc.severity)}`}>
        {inc.severity}
      </span>
    </div>
  )
}
IncidentItem.propTypes = { inc: PropTypes.object.isRequired }

function TraceItem({ tr }) {
  const durationText = tr.duration_ms == null ? '—' : `${tr.duration_ms} ms`
  const durationClass = tr.hasError ? 'text-red-400' : 'text-zinc-500'
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2">
      <Activity className="h-3 w-3 text-zinc-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-mono text-zinc-300 truncate">{tr.rootOperation ?? tr.traceID?.slice(0, 16)}</p>
        <p className="text-xs text-zinc-600 mt-0.5">{tr.spans} spans</p>
      </div>
      <span className={`text-xs font-mono shrink-0 ${durationClass}`}>{durationText}</span>
    </div>
  )
}
TraceItem.propTypes = { tr: PropTypes.object.isRequired }

// ── ServiceTableBody ───────────────────────────────────────────────────────────
function ServiceTableBody({ loading, data, error, filtered, onRowClick, onEdit, onDelete, onAddFirst }) {
  if (loading && !data) {
    return Array.from({ length: 5 }, (_, i) => `sk-${i}`).map((k) => (
      <tr key={k}><td colSpan={6}><SkeletonRow /></td></tr>
    ))
  }
  if (error) {
    return (
      <tr>
        <td colSpan={6} className="px-4 py-8 text-center text-sm text-red-400">
          Failed to load services
        </td>
      </tr>
    )
  }
  if (filtered.length === 0) {
    return (
      <tr>
        <td colSpan={6} className="px-4 py-12 text-center">
          <Server className="h-7 w-7 text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">No services yet</p>
          <Button size="sm" className="mt-3" onClick={onAddFirst}>
            Add first service
          </Button>
        </td>
      </tr>
    )
  }
  return filtered.map((svc) => (
    <tr
      key={svc.id}
      onClick={() => onRowClick(svc)}
      onKeyDown={(e) => { if (e.key === 'Enter') onRowClick(svc) }}
      tabIndex={0}
      role="button"
      className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-zinc-800 flex items-center justify-center shrink-0">
            <Server className="h-3.5 w-3.5 text-zinc-400" />
          </div>
          <div>
            <p className="font-medium text-zinc-200">{svc.name}</p>
            {svc.base_url && (
              <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-[160px]">{svc.base_url}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded border border-zinc-700">{svc.type}</span>
      </td>
      <td className="px-4 py-3 text-zinc-400 text-xs">{svc.environment}</td>
      <td className="px-4 py-3"><Badge variant={svc.status} /></td>
      <td className="px-4 py-3 text-zinc-500 text-xs">{formatDate(svc.created_at)}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(svc) }}
            className="h-7 w-7 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(svc) }}
            className="h-7 w-7 flex items-center justify-center rounded text-zinc-500 hover:text-red-400 hover:bg-red-950/30 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  ))
}
ServiceTableBody.propTypes = {
  loading:    PropTypes.bool,
  data:       PropTypes.object,
  error:      PropTypes.any,
  filtered:   PropTypes.array.isRequired,
  onRowClick: PropTypes.func.isRequired,
  onEdit:     PropTypes.func.isRequired,
  onDelete:   PropTypes.func.isRequired,
  onAddFirst: PropTypes.func.isRequired,
}

// ── Service Detail Panel ───────────────────────────────────────────────────────
function ServiceDetailPanel({ service, onClose }) {
  const svcName = service.name

  const { data: currentData, loading: metricsLoading } = usePolling(
    useCallback(() => metricsApi.getCurrent(), []),
    10000,
  )

  const { data: anomalyData, loading: anomalyLoading } = usePolling(
    useCallback(() => analyticsApi.anomalyHistory({ hours: 1 }), []),
    60000,
  )

  const [incidents, setIncidents] = useState([])
  const [incLoading, setIncLoading] = useState(true)
  useEffect(() => {
    incidentsApi.list({ service_id: service.id, limit: 5 })
      .then((d) => setIncidents(d?.items ?? []))
      .catch(() => setIncidents([]))
      .finally(() => setIncLoading(false))
  }, [service.id])

  const [traces, setTraces] = useState([])
  const [traceLoading, setTraceLoading] = useState(true)
  useEffect(() => {
    tracesApi.list({ service: svcName, limit: 5, lookback_minutes: 60 })
      .then((d) => setTraces(d?.traces ?? []))
      .catch(() => setTraces([]))
      .finally(() => setTraceLoading(false))
  }, [svcName])

  const svcMetrics = (currentData?.services ?? []).find((s) => s.service === svcName)
  const cpu      = svcMetrics ? `${(svcMetrics.cpu_rate * 100).toFixed(2)}%` : '—'
  const mem      = svcMetrics ? `${svcMetrics.memory_mb.toFixed(0)} MB` : '—'
  const lat      = svcMetrics ? `${(svcMetrics.latency_p99_s * 1000).toFixed(0)} ms` : '—'
  const errPct   = svcMetrics ? `${(svcMetrics.error_rate * 100).toFixed(2)}%` : '—'
  const errColor = svcMetrics && svcMetrics.error_rate > 0.01 ? 'text-red-400' : 'text-emerald-400'

  const anomalySeries = (anomalyData?.series ?? []).find((s) => s.service === svcName)
  const anomalyPoints = (anomalySeries?.points ?? []).map((p) => ({
    time: new Date(p.ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
    score: Math.round(p.score * 1000) / 1000,
  }))

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        role="presentation"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      />

      <div className="relative w-full max-w-lg bg-zinc-900 border-l border-zinc-800 flex flex-col h-full shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-zinc-800 flex items-center justify-center shrink-0">
              <Server className="h-4 w-4 text-zinc-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">{service.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">{service.type}</span>
                <Badge variant={service.status} />
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 px-5 py-4 space-y-5">
          {/* Live Metrics */}
          <section>
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Live Metrics</h3>
            {metricsLoading && !currentData
              ? <div className="grid grid-cols-2 gap-2"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
              : (
                <div className="grid grid-cols-2 gap-2">
                  <MetricStat icon={Cpu}           label="CPU Rate"    value={cpu}    color="text-blue-400" />
                  <MetricStat icon={HardDrive}     label="Memory"      value={mem}    color="text-purple-400" />
                  <MetricStat icon={Clock}         label="P99 Latency" value={lat}    color="text-amber-400" />
                  <MetricStat icon={AlertTriangle} label="Error Rate"  value={errPct} color={errColor} />
                </div>
              )
            }
          </section>

          {/* Anomaly Score */}
          <section>
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
              Anomaly Score — Last Hour
            </h3>
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
              {anomalyLoading && !anomalyData
                ? <Skeleton className="h-20 w-full" />
                : <AnomalyMiniChart points={anomalyPoints} />
              }
            </div>
          </section>

          {/* Recent Incidents */}
          <section>
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" /> Recent Incidents
            </h3>
            {incLoading && <Skeleton className="h-24 w-full" />}
            {!incLoading && incidents.length === 0 && (
              <p className="text-xs text-zinc-600 py-3 text-center">No incidents for this service</p>
            )}
            {!incLoading && incidents.length > 0 && (
              <div className="space-y-1.5">
                {incidents.map((inc) => <IncidentItem key={inc.id} inc={inc} />)}
              </div>
            )}
          </section>

          {/* Recent Traces */}
          <section>
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <GitBranch className="h-3 w-3" /> Recent Traces
            </h3>
            {traceLoading && <Skeleton className="h-24 w-full" />}
            {!traceLoading && traces.length === 0 && (
              <p className="text-xs text-zinc-600 py-3 text-center">No traces in last hour</p>
            )}
            {!traceLoading && traces.length > 0 && (
              <div className="space-y-1.5">
                {traces.map((tr) => <TraceItem key={tr.traceID} tr={tr} />)}
              </div>
            )}
          </section>
        </div>

        {service.description && (
          <div className="px-5 py-3 border-t border-zinc-800 shrink-0">
            <p className="text-xs text-zinc-600">{service.description}</p>
          </div>
        )}
      </div>
    </div>
  )
}
ServiceDetailPanel.propTypes = {
  service: PropTypes.object.isRequired,
  onClose: PropTypes.func.isRequired,
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Services() {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const { data, loading, error, refetch } = usePolling(
    () => servicesApi.list({ limit: 100 }),
    60000
  )

  const filtered = (data?.items ?? []).filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleCreate = useCallback(async (form) => {
    setSubmitting(true)
    try {
      await servicesApi.create(form)
      toast('Service created', 'success')
      setModal(null)
      refetch()
    } catch (err) {
      toast(err.response?.data?.detail ?? 'Failed to create service', 'error')
    } finally { setSubmitting(false) }
  }, [toast, refetch])

  const handleUpdate = useCallback(async (form) => {
    setSubmitting(true)
    try {
      await servicesApi.update(modal.data.id, form)
      toast('Service updated', 'success')
      setModal(null)
      refetch()
    } catch (err) {
      toast(err.response?.data?.detail ?? 'Failed to update service', 'error')
    } finally { setSubmitting(false) }
  }, [modal, toast, refetch])

  const handleDelete = useCallback(async () => {
    setSubmitting(true)
    try {
      await servicesApi.delete(modal.data.id)
      toast('Service deleted', 'success')
      setModal(null)
      refetch()
    } catch (err) {
      toast(err.response?.data?.detail ?? 'Failed to delete service', 'error')
    } finally { setSubmitting(false) }
  }, [modal, toast, refetch])

  return (
    <DashboardLayout>
      <PageHeader
        title="Services"
        subtitle={data ? `${data.total} monitored services` : 'Loading…'}
        action={
          <Button size="sm" onClick={() => setModal({ type: 'create' })}>
            <Plus className="h-3.5 w-3.5" />
            Add service
          </Button>
        }
      />

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search services…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-9 pr-4 w-full bg-zinc-900 border border-zinc-800 rounded-md text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50">
              {['Name', 'Type', 'Environment', 'Status', 'Created', 'Actions'].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-zinc-400 uppercase tracking-wider last:text-right">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <ServiceTableBody
              loading={loading}
              data={data}
              error={error}
              filtered={filtered}
              onRowClick={(svc) => setModal({ type: 'detail', data: svc })}
              onEdit={(svc) => setModal({ type: 'edit', data: svc })}
              onDelete={(svc) => setModal({ type: 'delete', data: svc })}
              onAddFirst={() => setModal({ type: 'create' })}
            />
          </tbody>
        </table>
      </div>

      <Modal
        open={modal?.type === 'create'}
        onClose={() => setModal(null)}
        title="Add Service"
        subtitle="Register a new monitored service"
      >
        <ServiceForm onSubmit={handleCreate} onCancel={() => setModal(null)} loading={submitting} />
      </Modal>

      <Modal
        open={modal?.type === 'edit'}
        onClose={() => setModal(null)}
        title="Edit Service"
        subtitle={modal?.data?.name}
      >
        {modal?.data && (
          <ServiceForm
            initial={modal.data}
            onSubmit={handleUpdate}
            onCancel={() => setModal(null)}
            loading={submitting}
          />
        )}
      </Modal>

      <Modal
        open={modal?.type === 'delete'}
        onClose={() => setModal(null)}
        title="Delete Service"
        size="sm"
      >
        {modal?.data && (
          <DeleteConfirm
            service={modal.data}
            onConfirm={handleDelete}
            onCancel={() => setModal(null)}
            loading={submitting}
          />
        )}
      </Modal>

      {modal?.type === 'detail' && modal.data && (
        <ServiceDetailPanel service={modal.data} onClose={() => setModal(null)} />
      )}
    </DashboardLayout>
  )
}
