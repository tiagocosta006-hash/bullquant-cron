import { Loader2 } from "lucide-react"

export default function CompareLoading() {
  return (
    <div className="container max-w-7xl mx-auto py-16 px-4 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <div className="h-10 w-1/3 bg-muted rounded-lg animate-pulse" />
        <div className="h-4 w-1/2 bg-muted/50 rounded-lg animate-pulse" />
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Skeleton for sidebar/list */}
        <div className="w-full lg:w-64 space-y-2">
          <div className="h-8 w-full bg-muted rounded-lg animate-pulse mb-4" />
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 w-full bg-muted/50 rounded-xl animate-pulse" />
          ))}
        </div>

        {/* Skeleton for main chart area */}
        <div className="flex-1 space-y-4">
          <div className="h-[400px] w-full bg-muted/50 rounded-2xl animate-pulse" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-32 bg-muted/50 rounded-2xl animate-pulse" />
            <div className="h-32 bg-muted/50 rounded-2xl animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}
