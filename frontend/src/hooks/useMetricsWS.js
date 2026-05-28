/**
 * useMetricsWS — live metric stream over WebSocket.
 *
 * Connects to /api/v1/ws/metrics with the JWT in the query string
 * (browsers cannot send custom headers on WebSocket upgrade).
 * Maintains a rolling 60-point buffer per metric and reconnects
 * automatically on disconnect (3 s back-off).
 *
 * Returns:
 *   connected  boolean  — true while the socket is open
 *   data       object   — { cpu[], memory[], latency[], errorRate[], services[] }
 *                         each array entry: { time: string, [service]: number }
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

const MAX_POINTS   = 60
const RECONNECT_MS = 3000
const WS_BASE      = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000')
  .replace(/^http/, 'ws')

function timeLbl() {
  return new Date().toLocaleTimeString('en-US', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function appendPoint(prev, services, keyFn) {
  const pt = { time: timeLbl() }
  services.forEach((s) => { pt[s.service] = keyFn(s) ?? 0 })
  return [...prev.slice(-(MAX_POINTS - 1)), pt]
}

const EMPTY = { cpu: [], memory: [], latency: [], errorRate: [], services: [] }

export function useMetricsWS({ enabled = true } = {}) {
  const { token } = useAuth()
  const [connected, setConnected] = useState(false)
  const [data,      setData]      = useState(EMPTY)

  const bufRef       = useRef({ cpu: [], memory: [], latency: [], errorRate: [] })
  const wsRef        = useRef(null)
  const reconnectRef = useRef(null)
  const tokenRef     = useRef(token)
  tokenRef.current   = token

  const connect = useCallback(() => {
    if (!tokenRef.current) return

    const url = `${WS_BASE}/api/v1/ws/metrics?token=${tokenRef.current}`
    const ws  = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      clearTimeout(reconnectRef.current)
    }

    ws.onclose = () => {
      setConnected(false)
      reconnectRef.current = setTimeout(connect, RECONNECT_MS)
    }

    ws.onerror = () => ws.close()

    ws.onmessage = (evt) => {
      let msg
      try { msg = JSON.parse(evt.data) } catch { return }
      if (msg.type !== 'metrics' || !Array.isArray(msg.data)) return

      const svcs = msg.data
      const buf  = bufRef.current

      buf.cpu       = appendPoint(buf.cpu,       svcs, (s) => s.cpu_rate)
      buf.memory    = appendPoint(buf.memory,    svcs, (s) => s.memory_mb)
      buf.latency   = appendPoint(buf.latency,   svcs, (s) => s.latency_p99_s)
      buf.errorRate = appendPoint(buf.errorRate, svcs, (s) => s.error_rate)

      setData({
        cpu:       [...buf.cpu],
        memory:    [...buf.memory],
        latency:   [...buf.latency],
        errorRate: [...buf.errorRate],
        services:  svcs.map((s) => s.service),
      })
    }
  }, [])

  const disconnect = useCallback(() => {
    clearTimeout(reconnectRef.current)
    wsRef.current?.close()
    wsRef.current = null
    setConnected(false)
    setData(EMPTY)
    bufRef.current = { cpu: [], memory: [], latency: [], errorRate: [] }
  }, [])

  useEffect(() => {
    if (!enabled) { disconnect(); return }
    connect()
    return disconnect
  }, [enabled, connect, disconnect])

  return { connected, data }
}
