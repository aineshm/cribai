'use client';

/**
 * MissionDetail — full detail view for a selected mission.
 *
 * Displays the mission header (title + status badge), agent summary,
 * optional action card (for HITL drafts), execution logs, and a steering
 * input bar for active/waiting missions. Animates in from the right.
 */

import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AgentSummary } from '@/components/concierge/AgentSummary';
import { MissionResults } from '@/components/concierge/MissionResults';
import { MissionActionCard } from '@/components/concierge/MissionActionCard';
import { ExecutionLogs } from '@/components/concierge/ExecutionLogs';
import { SteeringBar } from '@/components/concierge/SteeringBar';
import { slideInFromRight } from '@/lib/animations';
import type { LegacyMission, MissionStatus } from '@/lib/concierge-types';

/** Human-readable label for each mission status, shown in the header badge. */
const STATUS_LABELS: Record<MissionStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  active: 'Active',
  paused: 'Paused',
  waiting_approval: 'Waiting Approval',
  scheduled: 'Scheduled',
  completed: 'Completed',
  failed: 'Failed',
  expired: 'Expired',
};

/** Badge variant per status — maps to shadcn/ui Badge colour styles. */
const STATUS_BADGE_VARIANT: Record<MissionStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  running: 'default',
  active: 'default',
  paused: 'secondary',
  waiting_approval: 'secondary',
  scheduled: 'default',
  completed: 'outline',
  failed: 'destructive',
  expired: 'outline',
};

interface MissionDetailProps {
  readonly mission: LegacyMission;
  readonly onBack: () => void;
}

/** Full mission detail panel with header, summary, logs, and steering bar. */
export function MissionDetail({ mission, onBack }: MissionDetailProps) {
  // Only show the steering input bar when the user can still influence execution
  const isActiveOrWaiting =
    mission.status === 'active' || mission.status === 'waiting_approval';

  return (
    <motion.div
      variants={slideInFromRight}
      initial="initial"
      animate="animate"
      exit="exit"
      className="flex h-full flex-col"
    >
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          className="mt-0.5 flex-shrink-0"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground leading-tight">
            {mission.title}
          </h3>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant={STATUS_BADGE_VARIANT[mission.status]}>
              {STATUS_LABELS[mission.status]}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {mission.listingTitle}
            </span>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <AgentSummary summary={mission.summary} />

        {/* Mission results — shortlist, sublease link, etc. */}
        {mission.result && (
          <MissionResults result={mission.result} />
        )}

        {mission.actionCard && (
          <MissionActionCard actionCard={mission.actionCard} />
        )}

        <ExecutionLogs logs={mission.logs} />
      </div>

      {/* Steering bar for active missions */}
      {isActiveOrWaiting && <SteeringBar missionId={mission.id} />}
    </motion.div>
  );
}
