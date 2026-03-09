export default function SavedLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-44 rounded-lg bg-[var(--surface-200)]" />
      <div className="mt-2 h-5 w-64 rounded-lg bg-[var(--surface-100)]" />
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
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
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
