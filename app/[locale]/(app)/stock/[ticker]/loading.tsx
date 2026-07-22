import { Loader2 } from "lucide-react"

export default function Loading() {
  return (
    <div className="container max-w-7xl mx-auto py-8 px-4 space-y-8 animate-pulse">
      {/* 1. Header Skeleton */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-muted"></div>
          <div className="space-y-2">
            <div className="h-8 w-48 bg-muted rounded"></div>
            <div className="h-4 w-32 bg-muted rounded"></div>
          </div>
        </div>
        <div className="space-y-2 text-right">
          <div className="h-10 w-32 bg-muted rounded ml-auto"></div>
          <div className="h-4 w-24 bg-muted rounded ml-auto"></div>
        </div>
      </div>

      {/* 2. Fundamentals Snapshot Skeleton */}
      <div>
        <div className="h-6 w-32 bg-muted rounded mb-4"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-card border border-border/60 rounded-2xl p-5 h-48">
              <div className="h-4 w-24 bg-muted rounded mb-6"></div>
              <div className="space-y-4">
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="flex justify-between">
                    <div className="h-3 w-16 bg-muted rounded"></div>
                    <div className="h-3 w-12 bg-muted rounded"></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Price History Chart Skeleton */}
      <div className="bg-card border border-border/60 rounded-2xl p-6 h-[400px] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground/30" />
      </div>

      {/* 4. Financials Engine Skeleton */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-64 bg-muted rounded"></div>
          <div className="h-10 w-48 bg-muted rounded-full"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card border border-border/60 rounded-2xl p-5 h-[300px]">
              <div className="h-5 w-32 bg-muted rounded mb-6"></div>
              <div className="w-full h-48 bg-muted/50 rounded flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
