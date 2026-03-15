import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Dynamic import for the heavy tracker page component
export const TrackerPageLazy = dynamic(
  () => import('../../app/(app)/tracker/page').then(mod => ({ default: mod.default })),
  {
    loading: () => (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </div>
    ),
    ssr: false, // Disable SSR for this heavy component to improve initial page load
  }
)

export default TrackerPageLazy