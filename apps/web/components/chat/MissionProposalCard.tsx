'use client';

/**
 * MissionProposalCard — displayed in the chat thread when CribAI detects
 * intent for a background mission. Lets the user confirm or dismiss.
 */

import { Sparkles, X } from 'lucide-react';
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

  if (!pendingProposal) return null;

  const label = INTENT_LABELS[pendingProposal.intent] ?? pendingProposal.intent;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Start {label} Mission?</span>
      </div>
      <p className="text-xs text-muted-foreground">
        CribAI can run this as a background mission and surface results in the
        Concierge panel.
      </p>
      {missionError && (
        <p className="text-xs text-destructive">{missionError}</p>
      )}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void confirmMission()}>
          Start Mission
        </Button>
        <Button size="sm" variant="ghost" onClick={dismissProposal}>
          <X className="h-3 w-3 mr-1" />
          Dismiss
        </Button>
      </div>
    </div>
  );
}
