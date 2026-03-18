'use client';

/**
 * MissionProposalCard — slim navigation banner displayed above chat input
 * when CribAI detects intent for a background mission. Links to the
 * /messages page for full HITL review before launching.
 */

import { useRouter } from 'next/navigation';
import { Sparkles, X } from 'lucide-react';
import { useChatContext } from './ChatProvider';

/** Human-readable labels for known mission intent slugs. */
const INTENT_LABELS: Record<string, string> = {
  housing_search: 'Housing Search',
  tour_outreach: 'Tour Outreach',
  lease_analysis: 'Lease Analysis',
};

export function MissionProposalCard() {
  const { pendingProposal, dismissProposal } = useChatContext();
  const router = useRouter();

  if (!pendingProposal) return null;

  const label = INTENT_LABELS[pendingProposal.intent] ?? pendingProposal.intent;
  const fields = pendingProposal.extractedFields;

  const handleReview = () => {
    const params = new URLSearchParams({ launch: 'true', intent: pendingProposal.intent });

    const optional: ReadonlyArray<[string, string]> = [
      ['budget', String(fields.max_rent ?? '')],
      ['bedrooms', String(fields.bedrooms ?? '')],
      ['location', String(fields.location ?? '')],
      ['move_in_date', String(fields.move_in_date ?? '')],
    ];

    for (const [key, value] of optional) {
      if (value) params.set(key, value);
    }

    router.push(`/messages?${params.toString()}`);
    dismissProposal();
  };

  return (
    <div className="flex w-full items-center justify-between bg-teal-50/80 border border-teal-200 rounded-lg px-4 py-2.5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-teal-700" />
        <span className="text-sm font-medium text-gray-900">{label} mission ready</span>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={handleReview} className="text-sm font-semibold text-teal-800 hover:text-teal-900">
          Review &amp; Start &rarr;
        </button>
        <button type="button" onClick={dismissProposal} className="text-gray-400 hover:text-gray-600" aria-label="Dismiss">
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
