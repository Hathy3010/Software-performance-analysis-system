import PropTypes from 'prop-types'
import { useState, useEffect, useCallback } from 'react'
import {
  Bell, BellOff, Mail, Clock, Shield, CheckCircle,
  AlertTriangle, Settings2, Database, Volume2,
  Users, Sliders,
} from 'lucide-react'
import { DashboardLayout, PageHeader } from '@/components/layout/DashboardLayout'
import { usePolling } from '@/hooks/usePolling'
import { useToast } from '@/contexts/ToastContext'
import { useAuth, useRole } from '@/contexts/AuthContext'
import { notificationsApi } from '@/api/notifications'
import { globalSettingsApi } from '@/api/global_settings'

// ── Shared UI primitives ──────────────────────────────────────────────────────

function Section({ title, subtitle, icon: Icon, children }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-5">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800">
        <Icon className="h-4 w-4 text-blue-400" />
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}
Section.propTypes = {
  title:    PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  icon:     PropTypes.elementType.isRequired,
  children: PropTypes.node.isRequired,
}

function ToggleRow({ label, description, checked, onChange, disabled }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-zinc-800/50 last:border-0">
      <div className="min-w-0 pr-4">
        <p className="text-sm font-medium text-white">{label}</p>
        {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 transition-colors disabled:opacity-40 ${
          checked ? 'bg-blue-600 border-blue-600' : 'bg-zinc-700 border-zinc-600'
        }`}
      >
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform mt-px ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`} />
      </button>
    </div>
  )
}
ToggleRow.propTypes = {
  label:       PropTypes.string.isRequired,
  description: PropTypes.string,
  checked:     PropTypes.bool.isRequired,
  onChange:    PropTypes.func.isRequired,
  disabled:    PropTypes.bool,
}

function Field({ label, htmlFor, children }) {
  return (
    <div className="py-3 border-b border-zinc-800/50 last:border-0">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-zinc-400 mb-1.5">{label}</label>
      {children}
    </div>
  )
}
Field.propTypes = {
  label:    PropTypes.string.isRequired,
  htmlFor:  PropTypes.string,
  children: PropTypes.node.isRequired,
}

function TextInput({ id, value, onChange, placeholder, type, mono }) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full h-9 px-3 bg-zinc-950 border border-zinc-700 rounded-lg text-sm
                  text-white focus:outline-none focus:ring-1 focus:ring-blue-500 ${mono ? 'font-mono' : ''}`}
    />
  )
}
TextInput.defaultProps = { type: 'text', mono: false }
TextInput.propTypes = {
  id:          PropTypes.string,
  value:       PropTypes.string.isRequired,
  onChange:    PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  type:        PropTypes.string,
  mono:        PropTypes.bool,
}

function SaveBtn({ saving, onClick, label }) {
  return (
    <div className="flex justify-end mt-4 pt-2">
      <button
        type="button"
        disabled={saving}
        onClick={onClick}
        className="h-9 px-5 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white
                   rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        <CheckCircle className="h-3.5 w-3.5" />
        {saving ? 'Saving…' : label}
      </button>
    </div>
  )
}
SaveBtn.defaultProps = { label: 'Save' }
SaveBtn.propTypes = {
  saving:  PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
  label:   PropTypes.string,
}

// ── Spinner ────────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="h-20 flex items-center justify-center">
      <div className="h-5 w-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
    </div>
  )
}

// ── Tab: User notification preferences ────────────────────────────────────────
function UserPrefsTab() {
  const toast     = useToast()
  const fetchSettings = useCallback(() => notificationsApi.getSettings(), [])
  const fetchLogs     = useCallback(() => notificationsApi.getLogs({ limit: 20 }), [])
  const { data: settingsData, refetch } = usePolling(fetchSettings, 0)
  const { data: logsData }              = usePolling(fetchLogs, 30000)

  const [prefs,      setPrefs]      = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [scoreInput, setScoreInput] = useState('')

  useEffect(() => {
    if (settingsData && prefs === null) {
      setPrefs(settingsData)
      setScoreInput(String(settingsData.min_score))
    }
  }, [settingsData, prefs])

  function updatePref(key, val) { setPrefs((p) => ({ ...p, [key]: val })) }

  async function save() {
    setSaving(true)
    try {
      const score = Number.parseFloat(scoreInput)
      if (Number.isNaN(score) || score < 0 || score > 1) {
        toast('Score must be between 0.0 and 1.0', 'error')
        return
      }
      await notificationsApi.updateSettings({ ...prefs, min_score: score })
      toast('Notification preferences saved', 'success')
      refetch()
    } catch {
      toast('Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  const logs = logsData?.items ?? []

  return (
    <>
      <Section title="Email Notifications" subtitle="Personal alert email preferences" icon={Mail}>
        {prefs === null ? <Spinner /> : (
          <>
            <ToggleRow label="Enable email alerts"    description="Receive emails when anomalies exceed your threshold" checked={prefs.email_enabled}    onChange={(v) => updatePref('email_enabled', v)} />
            <ToggleRow label="Critical anomalies"     description="Score ≥ 0.90 — service severely impacted"           checked={prefs.notify_critical}   onChange={(v) => updatePref('notify_critical', v)} />
            <ToggleRow label="Error anomalies"        description="Score ≥ 0.70 — service degraded"                    checked={prefs.notify_error}      onChange={(v) => updatePref('notify_error', v)} />
            <ToggleRow label="Warning anomalies"      description="Score ≥ 0.50 — minor deviation"                     checked={prefs.notify_warn}       onChange={(v) => updatePref('notify_warn', v)} />

            <div className="mt-4 pt-4 border-t border-zinc-800">
              <label htmlFor="score-input" className="block text-xs font-medium text-zinc-400 mb-2">
                Minimum score threshold <span className="ml-1 text-zinc-600">(0.00 – 1.00)</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="score-input"
                  type="number" min="0" max="1" step="0.05"
                  value={scoreInput}
                  onChange={(e) => setScoreInput(e.target.value)}
                  className="w-24 h-9 px-3 bg-zinc-950 border border-zinc-700 rounded-lg text-sm
                             text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                />
                <div className="flex-1">
                  <input
                    id="score-range"
                    aria-label="Score threshold slider"
                    type="range" min="0" max="1" step="0.05"
                    value={Number.parseFloat(scoreInput) || 0.7}
                    onChange={(e) => setScoreInput(e.target.value)}
                    className="w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-xs text-zinc-600 mt-0.5">
                    <span>0.00</span><span>0.50</span><span>1.00</span>
                  </div>
                </div>
              </div>
            </div>
            <SaveBtn saving={saving} onClick={save} label="Save Preferences" />
          </>
        )}
      </Section>

      <Section title="Email History" subtitle={`${logs.length} recent notifications`} icon={Clock}>
        {logs.length === 0 ? (
          <div className="flex flex-col items-center py-8 gap-2">
            <BellOff className="h-7 w-7 text-zinc-700" />
            <p className="text-sm text-zinc-500">No emails sent yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Subject', 'Service', 'Score', 'Sent', 'Status'].map((h) => (
                  <th key={h} className="text-left py-2 px-2 first:px-0 text-xs font-medium text-zinc-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                  <td className="py-2.5 text-xs text-zinc-300 truncate max-w-xs">{log.subject}</td>
                  <td className="py-2.5 px-2 text-xs text-blue-400">{log.service_name}</td>
                  <td className="py-2.5 px-2 text-xs font-mono text-amber-400">{log.anomaly_score.toFixed(3)}</td>
                  <td className="py-2.5 px-2 text-xs text-zinc-400">
                    {new Date(log.sent_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-2.5 px-2">
                    <span className="inline-flex items-center gap-1 text-xs text-green-400">
                      <CheckCircle className="h-3 w-3" />sent
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  )
}

// ── Tab: Global system configuration (admin only) ─────────────────────────────
function GlobalConfigTab() {
  const toast = useToast()
  const { data: raw, refetch } = usePolling(useCallback(() => globalSettingsApi.get(), []), 0)

  const [cfg,    setCfg]    = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (raw && cfg === null) setCfg(raw)
  }, [raw, cfg])

  function set(key, val) { setCfg((c) => ({ ...c, [key]: val })) }

  async function save() {
    setSaving(true)
    try {
      await globalSettingsApi.update(cfg)
      toast('Global settings saved', 'success')
      refetch()
    } catch {
      toast('Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (cfg === null) return <Spinner />

  return (
    <>
      {/* Anomaly Detection */}
      <Section title="Anomaly Detection" subtitle="AI engine thresholds applied to all services" icon={Sliders}>
        <Field label="Anomaly score threshold (0.00 – 1.00)" htmlFor="gs-threshold">
          <div className="flex items-center gap-3">
            <input
              id="gs-threshold"
              type="number" min="0" max="1" step="0.05"
              value={cfg.anomaly_score_threshold}
              onChange={(e) => set('anomaly_score_threshold', Number.parseFloat(e.target.value))}
              className="w-24 h-9 px-3 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-white font-mono
                         focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              aria-label="Anomaly score threshold slider"
              type="range" min="0" max="1" step="0.05"
              value={cfg.anomaly_score_threshold}
              onChange={(e) => set('anomaly_score_threshold', Number.parseFloat(e.target.value))}
              className="flex-1 accent-blue-500"
            />
          </div>
        </Field>
        <Field label="Detection interval (seconds)" htmlFor="gs-interval">
          <input
            id="gs-interval"
            type="number" min="10" max="600"
            value={cfg.detection_interval_seconds}
            onChange={(e) => set('detection_interval_seconds', Number.parseInt(e.target.value, 10))}
            className="w-32 h-9 px-3 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-white font-mono
                       focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </Field>
      </Section>

      {/* Browser notifications */}
      <Section title="Browser Notifications" subtitle="Controls alarm sound and push for all users" icon={Volume2}>
        <ToggleRow
          label="Alert sound (critical)"
          description="Plays a repeating alarm until the alert is acknowledged"
          checked={cfg.alert_sound_enabled}
          onChange={(v) => set('alert_sound_enabled', v)}
        />
        <ToggleRow
          label="Browser push notifications"
          description="Shows OS notification for new critical alerts"
          checked={cfg.browser_push_enabled}
          onChange={(v) => set('browser_push_enabled', v)}
        />
      </Section>

      {/* Escalation */}
      <Section title="Escalation Policy" subtitle="Auto-notify escalation chain when alert is not acknowledged" icon={Bell}>
        <ToggleRow
          label="Enable escalation"
          description="Notify next tier if a critical alert is not acknowledged within the timeout"
          checked={cfg.escalation_enabled}
          onChange={(v) => set('escalation_enabled', v)}
        />
        <Field label={`Escalation timeout — ${cfg.escalation_timeout_minutes} min`} htmlFor="gs-esc-timeout">
          <input
            id="gs-esc-timeout"
            type="number" min="1" max="1440"
            disabled={!cfg.escalation_enabled}
            value={cfg.escalation_timeout_minutes}
            onChange={(e) => set('escalation_timeout_minutes', Number.parseInt(e.target.value, 10))}
            className="w-32 h-9 px-3 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-white font-mono
                       focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-40"
          />
        </Field>
      </Section>

      {/* SMTP */}
      <Section title="SMTP Configuration" subtitle="Email delivery settings — password via .env only" icon={Mail}>
        <Field label="SMTP Host" htmlFor="gs-smtp-host">
          <TextInput id="gs-smtp-host" value={cfg.smtp_host} onChange={(v) => set('smtp_host', v)} placeholder="smtp.gmail.com" mono />
        </Field>
        <Field label="SMTP Port" htmlFor="gs-smtp-port">
          <input
            id="gs-smtp-port"
            type="number"
            value={cfg.smtp_port}
            onChange={(e) => set('smtp_port', Number.parseInt(e.target.value, 10))}
            className="w-32 h-9 px-3 bg-zinc-950 border border-zinc-700 rounded-lg text-sm text-white font-mono
                       focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </Field>
        <Field label="SMTP User / From address" htmlFor="gs-smtp-user">
          <TextInput id="gs-smtp-user" value={cfg.smtp_user} onChange={(v) => set('smtp_user', v)} placeholder="alerts@example.com" mono />
        </Field>
        <div className="flex items-start gap-3 px-4 py-3 mt-3 bg-amber-900/20 border border-amber-700/40 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-400/80">
            SMTP password is not editable here for security — set <code className="font-mono">SMTP_PASSWORD</code> in{' '}
            <code className="font-mono">.env</code> and restart the backend.
          </p>
        </div>
      </Section>

      <Field label="Change summary (optional)" htmlFor="gs-changelog">
        <TextInput
          id="gs-changelog"
          value={cfg.changelog ?? ''}
          onChange={(v) => set('changelog', v)}
          placeholder="e.g. Raised threshold from 0.70 to 0.80 to reduce noise"
        />
      </Field>
      <SaveBtn saving={saving} onClick={save} label="Save Global Settings" />
    </>
  )
}

// ── Tab: System-wide notification log (admin only) ────────────────────────────
function SystemLogTab() {
  const { data, loading } = usePolling(
    useCallback(() => globalSettingsApi.getSystemLogs(100), []),
    30000,
  )
  const items = data?.items ?? []

  if (loading && data === undefined) return <Spinner />

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 gap-2">
        <BellOff className="h-8 w-8 text-zinc-700" />
        <p className="text-sm text-zinc-500">No notifications sent yet</p>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800">
        <Users className="h-4 w-4 text-blue-400" />
        <div>
          <p className="text-sm font-semibold text-white">System-wide Notification Log</p>
          <p className="text-xs text-zinc-500 mt-0.5">{items.length} recent emails across all users · auto-refreshes every 30 s</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              {['Subject', 'Service', 'Score', 'Recipient', 'Sent', 'Status'].map((h) => (
                <th key={h} className="text-left py-2.5 px-4 text-xs font-medium text-zinc-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                <td className="py-2.5 px-4 text-xs text-zinc-300 max-w-xs truncate">{row.subject}</td>
                <td className="py-2.5 px-4 text-xs text-blue-400">{row.service_name}</td>
                <td className="py-2.5 px-4 text-xs font-mono text-amber-400">{Number(row.anomaly_score).toFixed(3)}</td>
                <td className="py-2.5 px-4">
                  <div className="text-xs text-zinc-300">{row.username}</div>
                  <div className="text-xs text-zinc-600">{row.email}</div>
                </td>
                <td className="py-2.5 px-4 text-xs text-zinc-400">
                  {new Date(row.sent_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="py-2.5 px-4">
                  <span className={`inline-flex items-center gap-1 text-xs ${row.status === 'sent' ? 'text-green-400' : 'text-red-400'}`}>
                    <CheckCircle className="h-3 w-3" />{row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'prefs',  label: 'My Preferences', Icon: Bell,      roles: ['admin', 'analyst', 'viewer'] },
  { id: 'global', label: 'Global Config',  Icon: Settings2, roles: ['admin'] },
  { id: 'syslog', label: 'System Log',     Icon: Database,  roles: ['admin'] },
]

export default function Settings() {
  const { user }          = useAuth()
  const { isAdmin, role } = useRole()
  const [tab, setTab]     = useState('prefs')

  const visibleTabs = TABS.filter((t) => t.roles.includes(role))

  return (
    <DashboardLayout>
      <PageHeader
        title="Settings"
        subtitle="Notification preferences and platform configuration"
      />

      {/* Profile card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-6 py-4 mb-5 flex items-center gap-4">
        <div className="h-9 w-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
          <Shield className={`h-4 w-4 ${isAdmin ? 'text-red-400' : 'text-blue-400'}`} />
        </div>
        <div>
          <p className="text-sm font-medium text-white">{user?.id ?? '—'}</p>
          <p className={`text-xs font-semibold uppercase tracking-wider ${isAdmin ? 'text-red-400' : 'text-blue-400'}`}>
            {user?.role ?? '—'}
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-5 border-b border-zinc-800">
        {visibleTabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 h-9 px-4 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === id
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {tab === 'prefs'  && <UserPrefsTab />}
      {tab === 'global' && isAdmin && <GlobalConfigTab />}
      {tab === 'syslog' && isAdmin && <SystemLogTab />}

      {/* Deployment reminder for global config tab */}
      {tab === 'global' && isAdmin && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-900/20 border border-amber-700/40 rounded-xl mt-4">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-300">Deployment note</p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              Changes to <code className="font-mono">anomaly_score_threshold</code> and{' '}
              <code className="font-mono">detection_interval_seconds</code> update the DB record only.
              The AI engine reads from <code className="font-mono">.env</code> at startup — also update{' '}
              <code className="font-mono">ANOMALY_SCORE_THRESHOLD</code> and restart to apply live.
            </p>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
