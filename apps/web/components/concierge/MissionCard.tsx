'use client';

import { motion } from 'framer-motion';
import {
  Calendar,
  FileText,
  MessageSquare,
  DollarSign,
  GitCompare,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { staggerItem, scaleOnHover } from '@/lib/animations';
import type { LegacyMission } from '@/lib/concierge-types';
import type { MissionStatus, MissionType } from '@/lib/concierge-types';

const STATUS_COLORS: Record<MissionStatus, string> = {
  active: 'bg-green-500',
  paused: 'bg-yellow-500',
  waiting_approval: 'bg-amber-500',
  scheduled: 'bg-blue-500',
  completed: 'bg-gray-400',
  failed: 'bg-red-500',
  expired: 'bg-gray-300',
};

const TYPE_ICONS: Record<MissionType, React.ComponentType<{ className?: string }>> = {
  tour_booking: Calendar,
  lease_review: FileText,
  landlord_outreach: MessageSquare,
  price_negotiation: DollarSign,
  listing_comparison: GitCompare,
};

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

interface MissionCardProps {
  readonly mission: LegacyMission;
  readonly onClick: () => void;
}

export function MissionCard({ mission, onClick }: MissionCardProps) {
  const Icon = TYPE_ICONS[mission.type];
  const statusColor = STATUS_COLORS[mission.status];

  return (
    <motion.div variants={staggerItem} {...scaleOnHover}>
      <Card
        size="sm"
        className="cursor-pointer transition-shadow hover:shadow-md"
        onClick={onClick}
      >
        <CardContent className="flex items-start gap-3">
          <div className="relative mt-0.5 flex-shrink-0">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted">
              <Icon className="size-4 text-muted-foreground" />
            </div>
            <span
              className={`absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-card ${statusColor}`}
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {mission.title}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {mission.listingTitle}
            </p>
          </div>

          <span className="flex-shrink-0 text-xs text-muted-foreground">
            {getRelativeTime(mission.updatedAt)}
          </span>
        </CardContent>
      </Card>
    </motion.div>
  );
}
