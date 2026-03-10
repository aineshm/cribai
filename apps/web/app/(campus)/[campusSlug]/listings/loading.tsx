export default function ListingsLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-9 w-56 rounded-lg bg-[var(--surface-200)]" />
      <div className="mt-2 h-5 w-96 rounded-lg bg-[var(--surface-100)]" />

      {/* Filter bar skeleton */}
      <div className="mt-6 rounded-xl bg-white p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap gap-3">
          <div className="h-10 w-32 rounded-xl bg-[var(--surface-100)]" />
          <div className="h-10 w-28 rounded-xl bg-[var(--surface-100)]" />
          <div className="h-10 w-28 rounded-xl bg-[var(--surface-100)]" />
          <div className="h-10 w-36 rounded-xl bg-[var(--surface-100)]" />
        </div>
      </div>

      {/* Listing grid skeleton */}
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl bg-white shadow-[var(--shadow-card)] overflow-hidden"
          >
            <div className="aspect-video bg-[var(--surface-100)]" />
            <div className="p-5 space-y-3">
              <div className="h-5 w-3/4 rounded bg-[var(--surface-200)]" />
              <div className="h-7 w-1/3 rounded bg-[var(--surface-200)]" />
              <div className="flex gap-3">
                <div className="h-4 w-12 rounded bg-[var(--surface-100)]" />
                <div className="h-4 w-12 rounded bg-[var(--surface-100)]" />
                <div className="h-4 w-16 rounded bg-[var(--surface-100)]" />
              </div>
              <div className="h-4 w-40 rounded bg-[var(--surface-100)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
