import { cn } from '@/utils/cn'

const base = 'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:pointer-events-none disabled:opacity-50'

const variants = {
  primary:     'bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700',
  secondary:   'bg-zinc-800 text-zinc-100 border border-zinc-700 hover:bg-zinc-700',
  ghost:       'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
  destructive: 'bg-red-950 text-red-400 border border-red-900 hover:bg-red-900 hover:text-red-300',
  outline:     'border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100',
}

const sizes = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4',
  lg: 'h-10 px-6',
  icon: 'h-8 w-8',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  loading,
  ...props
}) {
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : null}
      {children}
    </button>
  )
}
