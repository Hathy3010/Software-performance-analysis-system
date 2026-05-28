export function formatDate(iso) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

export function formatDuration(seconds) {
  if (seconds == null) return '—'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

export function formatLatency(seconds) {
  if (seconds == null) return '—'
  const ms = seconds * 1000
  return ms < 1 ? `${(ms).toFixed(2)}ms` : `${ms.toFixed(1)}ms`
}

export function formatCpu(rate) {
  if (rate == null) return '—'
  return `${(rate * 100).toFixed(2)}%`
}

export function formatBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)}MB`
  return `${(bytes / 1024 ** 3).toFixed(2)}GB`
}

export function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''
}
