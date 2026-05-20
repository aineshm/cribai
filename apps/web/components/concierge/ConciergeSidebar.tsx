'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MissionCard } from '@/components/concierge/MissionCard';
import { MissionDetail } from '@/components/concierge/MissionDetail';
import { MissionSuggestions } from '@/components/concierge/MissionSuggestions';
import { useConcierge } from '@/components/concierge/ConciergeProvider';
import { staggerContainer } from '@/lib/animations';

const ACTIVE_STATUSES = new Set(['queued', 'pending', 'running', 'retrying', 'waiting_approval']);

export function ConciergeSidebar() {
  const {
    missions,
    selectedMission,
    isOpen,
    closeSidebar,
    selectMission,
  } = useConcierge();

  const activeMissions = useMemo(
    () => missions.filter((m) => ACTIVE_STATUSES.has(m.status)),
    [missions]
  );

  const pastMissions = useMemo(
    () => missions.filter((m) => !ACTIVE_STATUSES.has(m.status)),
    [missions]
  );

  const hasAnyMissions = missions.length > 0;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeSidebar()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col p-0 sm:max-w-[400px]"
        showCloseButton={!selectedMission}
      >
        <AnimatePresence mode="wait">
          {selectedMission ? (
            <MissionDetail
              key="detail"
              mission={selectedMission}
              onBack={() => selectMission(null)}
            />
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex h-full flex-col"
            >
              {/* Header */}
              <SheetHeader className="border-b border-border px-4 py-3">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="size-5 text-[var(--primary-600)]" />
                  AI Concierge
                </SheetTitle>
                <SheetDescription className="text-xs">
                  Your missions and agent activity
                </SheetDescription>
              </SheetHeader>

              {hasAnyMissions ? (
                <Tabs defaultValue="active" className="flex flex-1 flex-col">
                  <div className="px-4 pt-3">
                    <TabsList className="w-full">
                      <TabsTrigger value="active" className="flex-1">
                        Active ({activeMissions.length})
                      </TabsTrigger>
                      <TabsTrigger value="past" className="flex-1">
                        Past ({pastMissions.length})
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="active" className="flex-1 overflow-y-auto px-4 py-3">
                    {activeMissions.length > 0 ? (
                      <motion.div
                        variants={staggerContainer}
                        initial="initial"
                        animate="animate"
                        className="space-y-2"
                      >
                        {activeMissions.map((mission) => (
                          <MissionCard
                            key={mission.id}
                            mission={mission}
                            onClick={() => selectMission(mission)}
                          />
                        ))}
                      </motion.div>
                    ) : (
                      <div className="flex flex-1 items-center justify-center py-12">
                        <p className="text-sm text-muted-foreground">
                          No active missions
                        </p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="past" className="flex-1 overflow-y-auto px-4 py-3">
                    {pastMissions.length > 0 ? (
                      <motion.div
                        variants={staggerContainer}
                        initial="initial"
                        animate="animate"
                        className="space-y-2"
                      >
                        {pastMissions.map((mission) => (
                          <MissionCard
                            key={mission.id}
                            mission={mission}
                            onClick={() => selectMission(mission)}
                          />
                        ))}
                      </motion.div>
                    ) : (
                      <div className="flex flex-1 items-center justify-center py-12">
                        <p className="text-sm text-muted-foreground">
                          No past missions
                        </p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              ) : (
                <MissionSuggestions />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </SheetContent>
    </Sheet>
  );
}
