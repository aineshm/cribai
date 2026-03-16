'use client';

/**
 * MissionProposalCard — displayed in the chat thread when CribAI detects
 * intent for a background mission. Lets the user confirm or dismiss.
 */

import { useState } from 'react';
import { Sparkles, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatContext } from './ChatProvider';

/** Human-readable labels for known mission intent slugs. */
const INTENT_LABELS: Record<string, string> = {
  housing_search: 'Housing Search',
  tour_outreach: 'Tour Outreach',
  lease_analysis: 'Lease Analysis',
};

export function MissionProposalCard() {
  const { pendingProposal, missionError, confirmMission, dismissProposal } = useChatContext();
  const [isLoading, setIsLoading] = useState(false);

  if (!pendingProposal) return null;

  const label = INTENT_LABELS[pendingProposal.intent] ?? pendingProposal.intent;

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await confirmMission();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-teal-700" />
        <span className="text-sm font-semibold text-gray-900">Start {label} Mission?</span>
      </div>
      <p className="text-xs text-gray-500">
        Your agent will work on this in the background and notify you when results are ready.
      </p>
      {missionError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-xs font-medium text-red-700">{missionError}</p>
        </div>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => void handleConfirm()}
          disabled={isLoading}
          className="bg-teal-800 hover:bg-teal-900"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Starting...
            </>
          ) : (
            'Start Mission'
          )}
        </Button>
        <Button size="sm" variant="ghost" onClick={dismissProposal} disabled={isLoading}>
          <X className="h-3 w-3 mr-1" />
          Dismiss
        </Button>
      </div>
    </div>
  );
}
