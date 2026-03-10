export default function ListingDetailLoading() {
  return (
    <div className="animate-pulse">
      {/* Photo gallery skeleton */}
      <div className="flex gap-2 overflow-hidden rounded-xl">
        <div className="aspect-video w-full rounded-xl bg-[var(--surface-100)]" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <div className="h-8 w-3/4 rounded-lg bg-[var(--surface-200)]" />
            <div className="mt-3 flex gap-4">
              <div className="h-5 w-16 rounded bg-[var(--surface-100)]" />
              <div className="h-5 w-16 rounded bg-[var(--surface-100)]" />
              <div className="h-5 w-20 rounded bg-[var(--surface-100)]" />
            </div>
          </div>
          <div className="h-10 w-40 rounded-lg bg-[var(--surface-200)]" />
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-[var(--surface-100)]" />
            <div className="h-4 w-5/6 rounded bg-[var(--surface-100)]" />
            <div className="h-4 w-2/3 rounded bg-[var(--surface-100)]" />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-xl bg-white p-6 shadow-[var(--shadow-card)]">
            <div className="h-6 w-24 rounded bg-[var(--surface-200)]" />
            <div className="mt-4 space-y-3">
              <div className="h-5 w-full rounded bg-[var(--surface-100)]" />
              <div className="h-5 w-full rounded bg-[var(--surface-100)]" />
              <div className="h-5 w-3/4 rounded bg-[var(--surface-100)]" />
            </div>
          </div>
          <div className="h-64 rounded-xl bg-[var(--surface-100)]" />
        </div>
      </div>
    </div>
  );
}
