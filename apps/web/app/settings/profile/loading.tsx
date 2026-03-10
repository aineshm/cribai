export default function ProfileSettingsLoading() {
  return (
    <div className="animate-pulse max-w-2xl">
      <div className="h-8 w-32 rounded-lg bg-[var(--surface-200)]" />
      <div className="mt-6 space-y-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-24 rounded bg-[var(--surface-200)]" />
            <div className="h-10 w-full rounded-xl bg-[var(--surface-100)]" />
          </div>
        ))}
        <div className="h-10 w-32 rounded-xl bg-[var(--surface-200)]" />
      </div>
    </div>
  );
}
