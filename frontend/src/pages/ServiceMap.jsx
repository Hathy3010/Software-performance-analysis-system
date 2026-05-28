import { useState, useRef, useEffect, useCallback } from 'react'
import { RefreshCw, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { DashboardLayout, PageHeader } from '@/components/layout/DashboardLayout'
import { usePolling } from '@/hooks/usePolling'
import { tracesApi } from '@/api/traces'
import { servicesApi } from '@/api/services'

// ── Layout: simple force-directed positions via a few iterations ──────────────

function computeLayout(nodes, edges) {
  const W = 720, H = 420
  const pos = {}

  // Seed positions in a circle
  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1)
    pos[n.id] = {
      x: W / 2 + (Math.cos(angle) * W * 0.38),
      y: H / 2 + (Math.sin(angle) * H * 0.35),
    }
  })

  // Light spring iterations
  for (let iter = 0; iter < 80; iter++) {
    const force = {}
    nodes.forEach((n) => { force[n.id] = { x: 0, y: 0 } })

    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i].id, b = nodes[j].id
        const dx = pos[a].x - pos[b].x
        const dy = pos[a].y - pos[b].y
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
        const f = 4000 / (dist * dist)
        force[a].x += (dx / dist) * f
        force[a].y += (dy / dist) * f
        force[b].x -= (dx / dist) * f
        force[b].y -= (dy / dist) * f
      }
    }

    // Attraction along edges
    edges.forEach(({ source, target }) => {
      if (!pos[source] || !pos[target]) return
      const dx = pos[target].x - pos[source].x
      const dy = pos[target].y - pos[source].y
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
      const f = dist / 80
      force[source].x += (dx / dist) * f
      force[source].y += (dy / dist) * f
      force[target].x -= (dx / dist) * f
      force[target].y -= (dy / dist) * f
    })

    const damp = 0.15
    nodes.forEach((n) => {
      pos[n.id].x = Math.max(60, Math.min(W - 60, pos[n.id].x + force[n.id].x * damp))
      pos[n.id].y = Math.max(40, Math.min(H - 40, pos[n.id].y + force[n.id].y * damp))
    })
  }

  return pos
}

// ── Canvas renderer ────────────────────────────────────────────────────────────

function MapCanvas({ nodes, edges, serviceHealth, selected, onSelect }) {
  const canvasRef = useRef(null)
  const [pos, setPos] = useState({})

  useEffect(() => {
    if (nodes.length) setPos(computeLayout(nodes, edges))
  }, [nodes.length, edges.length]) // eslint-disable-line

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !Object.keys(pos).length) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const W = canvas.clientWidth
    const H = canvas.clientHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, W, H)

    // Scale positions to canvas
    const allX = Object.values(pos).map((p) => p.x)
    const allY = Object.values(pos).map((p) => p.y)
    const minX = Math.min(...allX), maxX = Math.max(...allX)
    const minY = Math.min(...allY), maxY = Math.max(...allY)
    const scaleX = (W - 120) / Math.max(maxX - minX, 1)
    const scaleY = (H - 80) / Math.max(maxY - minY, 1)
    const scale = Math.min(scaleX, scaleY, 1)
    const ox = (W - (maxX - minX) * scale) / 2 - minX * scale
    const oy = (H - (maxY - minY) * scale) / 2 - minY * scale

    const px = (id) => (pos[id]?.x || 0) * scale + ox
    const py = (id) => (pos[id]?.y || 0) * scale + oy

    // Draw edges
    edges.forEach(({ source, target, call_count }) => {
      if (!pos[source] || !pos[target]) return
      const thickness = Math.min(1 + Math.log10(Math.max(call_count || 1, 1)), 4)
      ctx.beginPath()
      ctx.moveTo(px(source), py(source))
      ctx.lineTo(px(target), py(target))
      ctx.strokeStyle = 'rgba(99,102,241,0.35)'
      ctx.lineWidth = thickness
      ctx.stroke()

      // Arrowhead
      const angle = Math.atan2(py(target) - py(source), px(target) - px(source))
      const aN = 28
      const ax = px(target) - aN * Math.cos(angle)
      const ay = py(target) - aN * Math.sin(angle)
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(ax - 8 * Math.cos(angle - 0.4), ay - 8 * Math.sin(angle - 0.4))
      ctx.lineTo(ax - 8 * Math.cos(angle + 0.4), ay - 8 * Math.sin(angle + 0.4))
      ctx.closePath()
      ctx.fillStyle = 'rgba(99,102,241,0.5)'
      ctx.fill()
    })

    // Node colour by health
    const healthColor = {
      healthy: '#22c55e',
      degraded: '#f59e0b',
      down: '#ef4444',
      unknown: '#71717a',
    }

    // Draw nodes
    nodes.forEach((n) => {
      const x = px(n.id), y = py(n.id)
      const health = serviceHealth[n.id] || 'unknown'
      const isSelected = selected === n.id
      const r = 24

      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = isSelected ? 'rgba(59,130,246,0.25)' : 'rgba(24,24,27,0.9)'
      ctx.fill()
      ctx.strokeStyle = isSelected ? '#3b82f6' : (healthColor[health] + '99')
      ctx.lineWidth = isSelected ? 2.5 : 1.5
      ctx.stroke()

      // Health dot
      ctx.beginPath()
      ctx.arc(x + r * 0.65, y - r * 0.65, 5, 0, Math.PI * 2)
      ctx.fillStyle = healthColor[health]
      ctx.fill()

      // Label
      ctx.fillStyle = isSelected ? '#e4e4e7' : '#a1a1aa'
      ctx.font = `${isSelected ? 600 : 400} 11px ui-sans-serif, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(n.id.length > 14 ? n.id.slice(0, 13) + '…' : n.id, x, y + r + 14)
    })
  }, [pos, nodes, edges, serviceHealth, selected])

  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas || !Object.keys(pos).length) return
    const rect = canvas.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top

    const allX = Object.values(pos).map((p) => p.x)
    const allY = Object.values(pos).map((p) => p.y)
    const minX = Math.min(...allX), maxX = Math.max(...allX)
    const minY = Math.min(...allY), maxY = Math.max(...allY)
    const W = canvas.clientWidth, H = canvas.clientHeight
    const scaleX = (W - 120) / Math.max(maxX - minX, 1)
    const scaleY = (H - 80) / Math.max(maxY - minY, 1)
    const scale = Math.min(scaleX, scaleY, 1)
    const ox = (W - (maxX - minX) * scale) / 2 - minX * scale
    const oy = (H - (maxY - minY) * scale) / 2 - minY * scale

    for (const n of nodes) {
      const nx = (pos[n.id]?.x || 0) * scale + ox
      const ny = (pos[n.id]?.y || 0) * scale + oy
      if (Math.hypot(cx - nx, cy - ny) < 28) {
        onSelect(selected === n.id ? null : n.id)
        return
      }
    }
    onSelect(null)
  }, [pos, nodes, selected, onSelect])

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-pointer"
      onClick={handleClick}
    />
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const LOOKBACK_OPTIONS = [{ label: '15 min', value: 0.25 }, { label: '1 h', value: 1 }, { label: '6 h', value: 6 }, { label: '24 h', value: 24 }]

export default function ServiceMap() {
  const [lookback, setLookback] = useState(1)
  const [selected, setSelected] = useState(null)

  const fetchMap = useCallback(() => tracesApi.dependencyMap(lookback), [lookback])
  const { data: mapData, loading: mapLoading, refetch } = usePolling(fetchMap, 30000)

  const { data: svcData } = usePolling(() => servicesApi.list({ limit: 100 }), 60000)

  const serviceHealth = {}
  ;(svcData?.items ?? []).forEach((s) => { serviceHealth[s.name] = s.status })

  const nodes = mapData?.nodes ?? []
  const edges = mapData?.edges ?? []

  // Detail panel for selected node
  const selectedEdges = edges.filter((e) => e.source === selected || e.target === selected)
  const svcDetail = (svcData?.items ?? []).find((s) => s.name === selected)

  return (
    <DashboardLayout>
      <PageHeader title="Service Map" subtitle="Live call graph from distributed traces" />

      <div className="flex items-center gap-3 mb-4">
        {LOOKBACK_OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => setLookback(o.value)}
            className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${
              lookback === o.value
                ? 'bg-blue-600/15 text-blue-400 border border-blue-800/50'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            {o.label}
          </button>
        ))}
        <button onClick={refetch} className="ml-auto h-8 px-3 flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors">
          <RefreshCw className={`h-3.5 w-3.5 ${mapLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-[1fr_280px] gap-4 h-[520px]">
        {/* Canvas */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden">
          {mapLoading && !mapData ? (
            <div className="h-full flex items-center justify-center text-sm text-zinc-500 animate-pulse">
              Building service graph…
            </div>
          ) : nodes.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2">
              <Maximize2 className="h-8 w-8 text-zinc-700" />
              <p className="text-sm text-zinc-500">No trace data in this window</p>
              <p className="text-xs text-zinc-600">Services emit traces via OpenTelemetry</p>
            </div>
          ) : (
            <MapCanvas
              nodes={nodes}
              edges={edges}
              serviceHealth={serviceHealth}
              selected={selected}
              onSelect={setSelected}
            />
          )}
        </div>

        {/* Detail panel */}
        <div className="space-y-3">
          {/* Legend */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Health</p>
            {[
              { color: 'bg-emerald-500', label: 'Healthy' },
              { color: 'bg-amber-500', label: 'Degraded' },
              { color: 'bg-red-500', label: 'Down' },
              { color: 'bg-zinc-500', label: 'Unknown' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2 text-xs text-zinc-400 mb-1.5">
                <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
                {label}
              </div>
            ))}
          </div>

          {/* Selected node detail */}
          {selected ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-zinc-200">{selected}</p>
                <button onClick={() => setSelected(null)} className="text-zinc-600 hover:text-zinc-400">✕</button>
              </div>
              {svcDetail && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded bg-zinc-900 border border-zinc-800 px-2 py-1.5">
                    <p className="text-xs text-zinc-500">Status</p>
                    <p className="text-xs text-zinc-200 mt-0.5 capitalize">{svcDetail.status}</p>
                  </div>
                  <div className="rounded bg-zinc-900 border border-zinc-800 px-2 py-1.5">
                    <p className="text-xs text-zinc-500">Type</p>
                    <p className="text-xs text-zinc-200 mt-0.5">{svcDetail.service_type || '—'}</p>
                  </div>
                </div>
              )}
              {selectedEdges.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-zinc-400 mb-2">Connections</p>
                  <div className="space-y-1">
                    {selectedEdges.map((e, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400">
                          {e.source === selected
                            ? <span>→ <span className="text-zinc-200">{e.target}</span></span>
                            : <span>← <span className="text-zinc-200">{e.source}</span></span>}
                        </span>
                        <span className="text-zinc-500">{e.call_count?.toLocaleString()} calls</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-center">
              <p className="text-xs text-zinc-500">Click a node to inspect</p>
            </div>
          )}

          {/* Stats */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Graph</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Services', value: nodes.length },
                { label: 'Connections', value: edges.length },
              ].map(({ label, value }) => (
                <div key={label} className="rounded bg-zinc-900 border border-zinc-800 px-2 py-2">
                  <p className="text-xs text-zinc-500">{label}</p>
                  <p className="text-lg font-semibold text-zinc-100">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
