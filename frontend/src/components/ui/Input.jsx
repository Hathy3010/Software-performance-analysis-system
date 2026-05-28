import { cn } from '@/utils/cn'

export function Input({ label, error, className, ...props }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-zinc-300">{label}</label>
      )}
      <input
        className={cn(
          'w-full h-9 rounded-md border bg-zinc-950 px-3 text-sm text-zinc-50',
          'border-zinc-700 placeholder:text-zinc-500',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-zinc-950',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error && 'border-red-700 focus:ring-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

export function Select({ label, error, className, children, ...props }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-zinc-300">{label}</label>
      )}
      <select
        className={cn(
          'w-full h-9 rounded-md border bg-zinc-950 px-3 text-sm text-zinc-50',
          'border-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500',
          'focus:ring-offset-2 focus:ring-offset-zinc-950',
          error && 'border-red-700',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
