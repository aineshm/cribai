'use client';

import { motion } from 'framer-motion';
import { Calendar, FileText, GitCompare, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { staggerContainer, staggerItem, scaleOnHover } from '@/lib/animations';
import { useConcierge } from '@/components/concierge/ConciergeProvider';
import type { LegacyMission } from '@/lib/concierge-types';

const SUGGESTIONS = [
  {
    icon: Calendar,
    title: 'Book tours for saved listings',
    description: 'Schedule visits to your top-rated saved listings',
    missionTemplate: {
      type: 'tour_booking' as const,
      title: 'Book tours for saved listings',
      listingTitle: 'Saved Listings',
    },
  },
  {
    icon: FileText,
    title: 'Review lease terms',
    description: 'Get AI analysis of lease agreements and flag concerns',
    missionTemplate: {
      type: 'lease_review' as const,
      title: 'Review lease terms',
      listingTitle: 'Pending Leases',
    },
  },
  {
    icon: GitCompare,
    title: 'Compare top listings',
    description: 'Side-by-side analysis of your shortlisted apartments',
    missionTemplate: {
      type: 'listing_comparison' as const,
      title: 'Compare top listings',
      listingTitle: 'Multiple Listings',
    },
  },
] as const;

export function MissionSuggestions() {
  const { addMission } = useConcierge();

  function handleSuggestionClick(template: (typeof SUGGESTIONS)[number]['missionTemplate']) {
    const newMission: LegacyMission = {
      id: `mission-${Date.now()}`,
      type: template.type,
      title: template.title,
      status: 'active',
      listingTitle: template.listingTitle,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      summary: 'Mission started. The AI agent is working on your request...',
      logs: [
        {
          timestamp: new Date().toISOString(),
          action: 'Mission started',
          detail: `User initiated: ${template.title}`,
          status: 'pending',
        },
      ],
    };

    addMission(newMission);
    toast.success('Mission started — your AI agent is on it');
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
      <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-[var(--primary-50)]">
        <Sparkles className="size-8 text-[var(--primary-600)]" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">
        Your AI Concierge is ready to help
      </h3>
      <p className="mt-1 text-center text-sm text-muted-foreground">
        Choose a task to get started, or let the agent handle it for you.
      </p>

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="mt-6 w-full space-y-3"
      >
        {SUGGESTIONS.map((suggestion) => {
          const Icon = suggestion.icon;
          return (
            <motion.div
              key={suggestion.title}
              variants={staggerItem}
              {...scaleOnHover}
            >
              <Card
                size="sm"
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => handleSuggestionClick(suggestion.missionTemplate)}
              >
                <CardContent className="flex items-center gap-3">
                  <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--primary-50)]">
                    <Icon className="size-5 text-[var(--primary-600)]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {suggestion.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {suggestion.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
