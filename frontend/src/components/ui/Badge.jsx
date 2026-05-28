import { cn } from '@/utils/cn'

const variants = {
  // alert severity
  critical:      'bg-red-950 text-red-400 border-red-900',
  high:          'bg-orange-950 text-orange-400 border-orange-900',
  medium:        'bg-amber-950 text-amber-400 border-amber-900',
  low:           'bg-zinc-800 text-zinc-400 border-zinc-700',
  // alert / incident status
  firing:        'bg-red-950 text-red-400 border-red-900',
  pending:       'bg-amber-950 text-amber-400 border-amber-900',
  acknowledged:  'bg-blue-950 text-blue-400 border-blue-900',
  resolved:      'bg-emerald-950 text-emerald-400 border-emerald-900',
  closed:        'bg-zinc-800 text-zinc-500 border-zinc-700',
  open:          'bg-red-950 text-red-400 border-red-900',
  investigating: 'bg-amber-950 text-amber-400 border-amber-900',
  // service status
  healthy:       'bg-emerald-950 text-emerald-400 border-emerald-900',
  degraded:      'bg-amber-950 text-amber-400 border-amber-900',
  down:          'bg-red-950 text-red-400 border-red-900',
  unknown:       'bg-zinc-800 text-zinc-400 border-zinc-700',
  // generic
  default:       'bg-zinc-800 text-zinc-300 border-zinc-700',
}

export function Badge({ label, variant, className }) {
  const style = variants[variant] ?? variants.default
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border',
        style, className
      )}
    >
      {label ?? variant}
    </span>
  )
}
