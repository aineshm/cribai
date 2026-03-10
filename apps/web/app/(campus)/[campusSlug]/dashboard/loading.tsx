export default function DashboardLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-36 rounded-lg bg-[var(--surface-200)]" />
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-[var(--surface-200)] bg-[var(--surface-50)] p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="h-6 w-32 rounded bg-[var(--surface-200)]" />
              <div className="h-5 w-8 rounded-full bg-[var(--surface-100)]" />
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="h-4 w-full rounded bg-[var(--surface-100)]" />
                <div className="h-3 w-2/3 rounded bg-[var(--surface-100)]" />
              </div>
              <div className="space-y-1.5">
                <div className="h-4 w-5/6 rounded bg-[var(--surface-100)]" />
                <div className="h-3 w-1/2 rounded bg-[var(--surface-100)]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
