'use client';

import { UserCheck } from 'lucide-react';

interface PostedByBadgeProps {
  readonly source: string;
  readonly creatorName: string | null;
}

export function PostedByBadge({ source, creatorName }: PostedByBadgeProps) {
  if (source !== 'sublease') return null;

  const displayName = creatorName || 'a verified student';

  return (
    <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full w-fit">
      <UserCheck className="size-3.5" />
      <span className="font-medium">Posted by {displayName}</span>
    </div>
  );
}
