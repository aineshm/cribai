export function ListingSkeleton() {
  return (
    <div className="rounded-2xl bg-white overflow-hidden shadow-[var(--shadow-card)]">
      <div className="aspect-video skeleton" />
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-2">
            <div className="h-5 w-3/4 skeleton" />
            <div className="h-7 w-1/3 skeleton" />
          </div>
          <div className="h-7 w-12 rounded-full skeleton" />
        </div>
        <div className="flex gap-3">
          <div className="h-4 w-12 skeleton" />
          <div className="h-4 w-14 skeleton" />
          <div className="h-4 w-16 skeleton" />
        </div>
        <div className="h-4 w-2/3 skeleton" />
      </div>
    </div>
  );
}

export function ListingGridSkeleton({ count = 6 }: { readonly count?: number }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <ListingSkeleton key={i} />
      ))}
    </div>
  );
}
