import { cn } from '@/utils/cn'

export function Skeleton({ className }) {
  return (
    <div className={cn('animate-pulse rounded-md bg-zinc-800', className)} />
  )
}

export function SkeletonCard() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-2.5 w-20" />
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-zinc-800">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-5 w-16 rounded-md" />
      <Skeleton className="h-4 w-24 ml-auto" />
    </div>
  )
}
