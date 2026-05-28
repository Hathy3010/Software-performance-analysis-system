import { createContext, useCallback, useContext, useState } from 'react'
import { cn } from '@/utils/cn'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const styles = {
  success: 'border-emerald-800 bg-emerald-950/80 text-emerald-300',
  error:   'border-red-800 bg-red-950/80 text-red-300',
  warning: 'border-amber-800 bg-amber-950/80 text-amber-300',
  info:    'border-zinc-700 bg-zinc-900/90 text-zinc-300',
}

function ToastItem({ toast, onRemove }) {
  const Icon = icons[toast.type] ?? Info
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border px-4 py-3 shadow-2xl backdrop-blur-sm',
        'text-sm w-80 animate-in slide-in-from-right-4 duration-300',
        styles[toast.type]
      )}
    >
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <p className="flex-1 leading-snug">{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((message, type = 'info', duration = 4000) => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration)
  }, [])

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onRemove={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx.toast
}
