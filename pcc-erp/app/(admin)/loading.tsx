export default function Loading() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-erp-bg animate-pulse">
      {/* Skeleton Header */}
      <header className="h-20 flex items-center justify-between px-8 bg-erp-surface border-b border-erp-border shrink-0">
        <div className="flex flex-col gap-2">
          {/* Title skeleton */}
          <div className="h-5 w-48 bg-erp-border rounded-md"></div>
          {/* Subtitle skeleton */}
          <div className="h-3.5 w-72 bg-erp-border rounded-md opacity-60"></div>
        </div>
        <div className="flex items-center gap-6">
          {/* Date skeleton */}
          <div className="h-7 w-36 bg-erp-border rounded-full hidden md:block"></div>
          {/* User profile skeleton */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-erp-border"></div>
            <div className="flex flex-col gap-1.5">
              <div className="h-3.5 w-24 bg-erp-border rounded-md"></div>
              <div className="h-3 w-16 bg-erp-border rounded-md opacity-60"></div>
            </div>
          </div>
        </div>
      </header>

      {/* Page Body Skeleton */}
      <div className="flex-1 p-8 overflow-y-auto space-y-8">
        {/* Top Stats Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-6 bg-erp-surface border border-erp-border rounded-xl flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <div className="h-4 w-28 bg-erp-border rounded-md"></div>
                <div className="h-5 w-5 bg-erp-border rounded-full"></div>
              </div>
              <div className="h-8 w-20 bg-erp-border rounded-md"></div>
              <div className="h-1.5 w-full bg-erp-border rounded-full opacity-40"></div>
              <div className="flex justify-between items-center">
                <div className="h-3 w-12 bg-erp-border rounded-md"></div>
                <div className="h-3 w-24 bg-erp-border rounded-md"></div>
              </div>
            </div>
          ))}
        </div>

        {/* Large Table/Chart Content Card Skeleton */}
        <div className="p-6 bg-erp-surface border border-erp-border rounded-xl flex flex-col gap-6">
          <div className="flex justify-between items-center">
            <div className="flex flex-col gap-2">
              <div className="h-5 w-40 bg-erp-border rounded-md"></div>
              <div className="h-3.5 w-56 bg-erp-border rounded-md opacity-60"></div>
            </div>
            <div className="h-9 w-24 bg-erp-border rounded-lg"></div>
          </div>
          
          {/* Skeleton lines representing content/table rows */}
          <div className="space-y-4">
            <div className="h-12 w-full bg-erp-border rounded-lg opacity-80"></div>
            <div className="h-12 w-full bg-erp-border rounded-lg opacity-60"></div>
            <div className="h-12 w-full bg-erp-border rounded-lg opacity-40"></div>
            <div className="h-12 w-full bg-erp-border rounded-lg opacity-20"></div>
          </div>
        </div>
      </div>
    </div>
  )
}
