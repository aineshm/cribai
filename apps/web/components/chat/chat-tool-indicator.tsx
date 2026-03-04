'use client';

const TOOL_LABELS: Record<string, string> = {
  search_listings: 'Searching listings',
  get_listing_detail: 'Loading listing details',
  compare_listings: 'Comparing listings',
  schedule_tour: 'Scheduling tour',
  explain_lease_term: 'Looking up lease term',
  get_landlord_info: 'Fetching landlord info',
};

interface ChatToolIndicatorProps {
  readonly toolName: string;
}

export function ChatToolIndicator({ toolName }: ChatToolIndicatorProps) {
  const label = TOOL_LABELS[toolName] ?? 'Processing';

  return (
    <div className="flex items-center gap-2 py-1" role="status" aria-label={label}>
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      <span className="text-xs text-gray-500">{label}...</span>
    </div>
  );
}
