import { Skeleton } from '@/components/ui/skeleton';

export default function ServicesLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-72 mb-2 bg-white/5" />
          <Skeleton className="h-4 w-48 bg-white/5" />
        </div>
      </div>

      {/* Stats banner */}
      <div className="flex items-center gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-32 bg-white/5" />
        ))}
      </div>

      {/* Filter bar skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-64 bg-white/5" />
        <div className="flex gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-20 rounded-full bg-white/5" />
          ))}
        </div>
        <Skeleton className="h-9 w-40 ml-auto bg-white/5" />
      </div>

      {/* Card grid skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-white/5 p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-20 rounded-full bg-white/5" />
              <Skeleton className="h-5 w-14 bg-white/5" />
            </div>
            <Skeleton className="h-5 w-40 bg-white/5" />
            <Skeleton className="h-3 w-24 bg-white/5" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-full bg-white/5" />
              <Skeleton className="h-3 w-28 bg-white/5" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-3 w-12 bg-white/5" />
              <Skeleton className="h-3 w-16 bg-white/5" />
              <Skeleton className="h-3 w-14 bg-white/5" />
            </div>
            <Skeleton className="h-8 w-full bg-white/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
