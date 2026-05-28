/**
 * useAlertNotifications — PagerDuty-style critical alert notifications.
 *
 * Polls /alerts?status=firing every 10 s.
 * On new CRITICAL alert:
 *   1. Plays a repeating alarm synthesised via the Web Audio API (no file needed).
 *   2. Fires a browser Notification (requires permission — requested on first mount).
 *
 * Alarm stops when:
 *   - The alert disappears from the firing list (acknowledged / resolved).
 *   - stopAlarm() is called explicitly (e.g. from the Acknowledge modal).
 *
 * Returns:
 *   stopAlarm()      — silence the current alarm manually
 *   alarmActive      — boolean, true while the alarm is ringing
 *   criticalAlerts   — list of currently-firing critical alerts
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { alertsApi } from '@/api/alerts'

const POLL_MS    = 10_000
const BEEP_HZ    = [880, 660]   // two-tone alarm
const BEEP_GAP   = 0.12         // seconds between tones in one "bing-bong"
const CYCLE_S    = 1.2          // seconds per full bing-bong cycle
const ALARM_GAIN = 0.25

function buildBeep(ctx, startTime, freq) {
  const osc  = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'square'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(ALARM_GAIN, startTime + 0.01)
  gain.gain.setValueAtTime(ALARM_GAIN, startTime + BEEP_GAP - 0.01)
  gain.gain.linearRampToValueAtTime(0, startTime + BEEP_GAP)
  osc.start(startTime)
  osc.stop(startTime + BEEP_GAP)
}

function scheduleAlarmCycle(ctx, when) {
  BEEP_HZ.forEach((freq, i) => buildBeep(ctx, when + i * BEEP_GAP, freq))
}

export function useAlertNotifications() {
  const [alarmActive,    setAlarmActive]    = useState(false)
  const [criticalAlerts, setCriticalAlerts] = useState([])

  const knownIds   = useRef(new Set())
  const alarmIds   = useRef(new Set())   // IDs currently ringing the alarm
  const ctxRef     = useRef(null)
  const timerRef   = useRef(null)
  const intervalRef = useRef(null)

  // ── Request browser notification permission on mount ───────────────────────
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // ── Alarm control ──────────────────────────────────────────────────────────
  const startAlarm = useCallback(() => {
    if (ctxRef.current) return                      // already running
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ctxRef.current = ctx

    let t = ctx.currentTime
    function schedule() {
      scheduleAlarmCycle(ctx, t)
      t += CYCLE_S
      // schedule next batch while we still have headroom
      timerRef.current = setTimeout(schedule, (CYCLE_S - 0.1) * 1000)
    }
    schedule()
    setAlarmActive(true)
  }, [])

  const stopAlarm = useCallback(() => {
    clearTimeout(timerRef.current)
    try { ctxRef.current?.close() } catch { /* ignore */ }
    ctxRef.current = null
    alarmIds.current.clear()
    setAlarmActive(false)
  }, [])

  // ── Polling ────────────────────────────────────────────────────────────────
  const checkAlerts = useCallback(async () => {
    let alerts
    try {
      const data = await alertsApi.list({ status: 'firing', limit: 50 })
      alerts = data?.items ?? []
    } catch {
      return
    }

    const firingCritical = alerts.filter((a) => a.severity === 'critical')
    setCriticalAlerts(firingCritical)

    // IDs no longer firing → stop alarm if it was for them
    const firingIds = new Set(firingCritical.map((a) => a.id))
    alarmIds.current.forEach((id) => {
      if (!firingIds.has(id)) alarmIds.current.delete(id)
    })
    if (alarmIds.current.size === 0 && ctxRef.current) {
      stopAlarm()
    }

    // New critical alerts we haven't seen before
    const newCritical = firingCritical.filter((a) => !knownIds.current.has(a.id))
    if (newCritical.length > 0) {
      newCritical.forEach((a) => {
        knownIds.current.add(a.id)
        alarmIds.current.add(a.id)

        // Browser push notification
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`🚨 CRITICAL: ${a.name}`, {
            body:             `${a.service_name ?? 'unknown'} — ${a.message ?? ''}`.trim(),
            icon:             '/favicon.ico',
            tag:              a.id,
            requireInteraction: true,
          })
        }
      })
      startAlarm()
    }

    // Seed known IDs on first successful fetch so we don't alarm on page load
    if (knownIds.current.size === 0 && alerts.length > 0) {
      alerts.forEach((a) => knownIds.current.add(a.id))
    }
  }, [startAlarm, stopAlarm])

  useEffect(() => {
    checkAlerts()
    intervalRef.current = setInterval(checkAlerts, POLL_MS)
    return () => {
      clearInterval(intervalRef.current)
      stopAlarm()
    }
  }, [checkAlerts, stopAlarm])

  return { stopAlarm, alarmActive, criticalAlerts }
}
