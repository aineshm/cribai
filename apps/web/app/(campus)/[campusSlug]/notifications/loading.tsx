export default function NotificationsLoading() {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-40 rounded-lg bg-[var(--surface-200)]" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-start gap-4 rounded-xl border border-[var(--surface-200)] bg-white p-4"
          >
            <div className="h-10 w-10 shrink-0 rounded-full bg-[var(--surface-100)]" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-[var(--surface-200)]" />
              <div className="h-3 w-1/2 rounded bg-[var(--surface-100)]" />
              <div className="h-3 w-1/4 rounded bg-[var(--surface-100)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
