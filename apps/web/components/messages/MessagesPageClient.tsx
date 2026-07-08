'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  FileText,
  Sparkles,
  X,
} from 'lucide-react';
import { useConcierge } from '@/components/concierge/ConciergeProvider';
import type { LegacyMission } from '@/lib/concierge-types';
import { MissionLauncher } from './MissionLauncher';

type TabValue = 'queue' | 'past';

const ARCHIVED_MISSIONS_KEY = 'missions-past-archive';
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'expired']);
const WORKING_STATUSES = new Set(['pending', 'running', 'retrying', 'waiting_approval']);

function loadArchivedMissionIds(): readonly string[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = window.localStorage.getItem(ARCHIVED_MISSIONS_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="size-4 text-green-600" />;
    case 'queued':
      return <Clock className="size-4 text-red-600" />;
    case 'waiting_approval':
      return <FileText className="size-4 text-amber-600" />;
    case 'pending':
    case 'running':
    case 'retrying':
      return (
        <span className="relative flex size-4 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-50" />
          <span className="relative inline-flex size-2 rounded-full bg-amber-500" />
        </span>
      );
    case 'failed':
      return <AlertCircle className="size-4 text-red-500" />;
    default:
      return <Clock className="size-4 text-gray-400" />;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'completed':
      return 'Done';
    case 'waiting_approval':
      return 'Needs review';
    case 'queued':
      return 'Queued';
    case 'retrying':
      return 'Retrying';
    case 'running':
    case 'pending':
      return 'In progress';
    case 'failed':
      return 'Failed';
    default:
      return status.replace(/_/g, ' ');
  }
}

function statusLabelColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'text-green-700';
    case 'queued':
      return 'text-red-700';
    case 'waiting_approval':
    case 'pending':
    case 'running':
    case 'retrying':
      return 'text-amber-700';
    case 'failed':
      return 'text-red-600';
    default:
      return 'text-gray-500';
  }
}

export function MessagesPageClient({
  searchParams,
}: {
  readonly searchParams: Record<string, string | string[] | undefined>;
}) {
  const { missions, selectedMission, selectMission } = useConcierge();
  const [tab, setTab] = useState<TabValue>('queue');
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [archivedMissionIds, setArchivedMissionIds] = useState<readonly string[]>([]);
  const detailTitleId = useId();

  useEffect(() => {
    setArchivedMissionIds(loadArchivedMissionIds());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ARCHIVED_MISSIONS_KEY, JSON.stringify(archivedMissionIds));
  }, [archivedMissionIds]);

  const queueMissions = missions.filter((mission) => !archivedMissionIds.includes(mission.id));
  const pastMissions = missions.filter((mission) => archivedMissionIds.includes(mission.id));
  const pendingApproval = queueMissions.filter((mission) => mission.status === 'waiting_approval');
  const isWorking = queueMissions.some(
    (mission) => mission.status === 'queued' || WORKING_STATUSES.has(mission.status),
  );
  const displayedMissions = tab === 'queue' ? queueMissions : pastMissions;

  useEffect(() => {
    if (!mobileDetailOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileDetailOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileDetailOpen]);

  useEffect(() => {
    if (!selectedMission) {
      setMobileDetailOpen(false);
      return;
    }

    const nextTab: TabValue = archivedMissionIds.includes(selectedMission.id) ? 'past' : 'queue';
    setTab((currentTab) => (currentTab === nextTab ? currentTab : nextTab));
  }, [archivedMissionIds, selectedMission]);

  function handleSelectMission(mission: LegacyMission) {
    selectMission(mission);
    setMobileDetailOpen(true);
  }

  function handleTabChange(nextTab: TabValue) {
    setTab(nextTab);

    if (!selectedMission) {
      return;
    }

    const selectedMissionTab: TabValue = archivedMissionIds.includes(selectedMission.id)
      ? 'past'
      : 'queue';

    if (selectedMissionTab !== nextTab) {
      selectMission(null);
      setMobileDetailOpen(false);
    }
  }

  function handleReviewFirst() {
    const first = pendingApproval[0];
    if (!first) return;
    handleSelectMission(first);
  }

  function moveMissionToPast(missionId: string) {
    const index = queueMissions.findIndex((mission) => mission.id === missionId);
    const next = index === -1 ? null : (queueMissions[index + 1] ?? queueMissions[index - 1] ?? null);

    setArchivedMissionIds((prev) => (prev.includes(missionId) ? prev : [...prev, missionId]));
    selectMission(next);
  }

  function restoreMissionToQueue(missionId: string) {
    // Unlike moveMissionToPast, restoring doesn't remove the mission from
    // the visible set — it just reclassifies which tab it belongs to. The
    // current selection (this same mission, if selected) stays valid and
    // simply follows it back to the queue tab, so there's no orphaned
    // selection to resolve here.
    setArchivedMissionIds((prev) => prev.filter((id) => id !== missionId));
    setTab('queue');
  }

  return (
    <div className="app-mobile-pane flex overflow-hidden bg-white">
      {mobileDetailOpen && selectedMission && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setMobileDetailOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={detailTitleId}
            className="absolute inset-x-0 bottom-0 top-16 flex flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 p-4">
              <h2
                id={detailTitleId}
                className="truncate font-[family-name:var(--font-display)] font-bold text-gray-900"
              >
                {selectedMission.title}
              </h2>
              <button
                type="button"
                aria-label="Close mission detail"
                onClick={() => setMobileDetailOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-gray-100"
              >
                <X className="size-4 text-gray-500" />
              </button>
            </div>
            <div className="safe-area-pb flex-1 overflow-y-auto">
              <MissionDetailPanel
                mission={selectedMission}
                isArchived={archivedMissionIds.includes(selectedMission.id)}
                onMoveToPast={moveMissionToPast}
                onRestoreToQueue={restoreMissionToQueue}
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex w-full flex-col border-r border-gray-100 bg-gray-50/50 md:w-[400px]">
        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/80 p-4 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-800 text-white">
              <Bot className="size-5" />
            </div>
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-lg font-bold text-gray-900">
                Your Agent
              </h1>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${isWorking ? 'bg-amber-400 animate-pulse' : 'bg-gray-300'}`}
                />
                <span className="text-xs text-gray-500">
                  {isWorking ? 'In progress' : 'Idle'}
                </span>
              </div>
            </div>
          </div>

          {pendingApproval.length > 0 && (
            <div className="mt-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0 text-amber-600" />
                <span className="text-sm font-medium text-amber-900">
                  Review required ({pendingApproval.length})
                </span>
              </div>
              <button
                type="button"
                onClick={handleReviewFirst}
                className="flex items-center gap-1 text-xs font-semibold text-amber-800 transition-colors hover:text-amber-950"
              >
                Review <ArrowRight className="size-3" />
              </button>
            </div>
          )}

          <div className="mt-4 flex gap-1 rounded-xl bg-gray-100 p-1">
            {(['queue', 'past'] as const).map((currentTab) => (
              <button
                key={currentTab}
                type="button"
                aria-pressed={tab === currentTab}
                onClick={() => handleTabChange(currentTab)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  tab === currentTab
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {currentTab === 'queue'
                  ? `Queue${queueMissions.length > 0 ? ` (${queueMissions.length})` : ''}`
                  : `Past${pastMissions.length > 0 ? ` (${pastMissions.length})` : ''}`}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pt-3">
          <MissionLauncher searchParams={searchParams} />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 p-3">
          {displayedMissions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
                <Sparkles className="size-7 text-red-600" />
              </div>
              <p className="font-[family-name:var(--font-display)] text-lg font-bold text-gray-900">
                {tab === 'queue' ? 'Queue is empty' : 'No past missions'}
              </p>
              <p className="mt-2 max-w-xs text-sm text-gray-500">
                {tab === 'queue'
                  ? 'Launch a mission and it will stay here until you move it to Past.'
                  : 'Archived missions will appear here.'}
              </p>
              {tab === 'queue' && (
                <Link
                  href="/explore"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-900"
                >
                  Open Discover <ArrowRight className="size-4" />
                </Link>
              )}
            </div>
          )}

          {displayedMissions.map((mission) => (
            <MissionTaskCard
              key={mission.id}
              mission={mission}
              isSelected={selectedMission?.id === mission.id}
              onSelect={() => handleSelectMission(mission)}
            />
          ))}
        </div>
      </div>

      <div className="hidden flex-1 flex-col md:flex">
        {selectedMission ? (
          <MissionDetailPanel
            mission={selectedMission}
            isArchived={archivedMissionIds.includes(selectedMission.id)}
            onMoveToPast={moveMissionToPast}
            onRestoreToQueue={restoreMissionToQueue}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-center">
            <div>
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-red-50">
                <Bot className="size-10 text-red-600" />
              </div>
              <p className="font-[family-name:var(--font-display)] text-xl font-bold text-gray-900">
                Select a mission
              </p>
              <p className="mt-2 text-sm text-gray-500">
                Choose a mission from the queue to view details
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MissionTaskCard({
  mission,
  isSelected,
  onSelect,
}: {
  readonly mission: LegacyMission;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`w-full rounded-2xl border p-4 text-left transition-all ${
        isSelected
          ? 'border-red-200 bg-white shadow-sm ring-1 ring-red-800/10'
          : 'border-transparent bg-white/60 hover:border-gray-200 hover:bg-white'
      }`}
    >
      <div className="flex items-start gap-3">
        {statusIcon(mission.status)}
        <div className="min-w-0 flex-1">
          <span className={`text-xs font-medium ${statusLabelColor(mission.status)}`}>
            {statusLabel(mission.status)}
          </span>
          <p className="mt-1 truncate text-sm font-bold text-gray-900">{mission.title}</p>
          {mission.summary && (
            <p className="mt-1 line-clamp-2 text-sm text-gray-500">{mission.summary}</p>
          )}
          <p className="mt-2 text-xs text-gray-400">
            {new Date(mission.updatedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </p>
        </div>
      </div>
    </button>
  );
}

function MissionDetailPanel({
  mission,
  isArchived,
  onMoveToPast,
  onRestoreToQueue,
}: {
  readonly mission: LegacyMission;
  readonly isArchived: boolean;
  readonly onMoveToPast: (missionId: string) => void;
  readonly onRestoreToQueue: (missionId: string) => void;
}) {
  const [showLogs, setShowLogs] = useState(false);
  const canArchive = TERMINAL_STATUSES.has(mission.status);

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <div className="mb-2 flex items-center gap-2">
            {statusIcon(mission.status)}
            <span className={`text-xs font-medium ${statusLabelColor(mission.status)}`}>
              {statusLabel(mission.status)}
            </span>
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-gray-900">
            {mission.title}
          </h2>
          {mission.summary && (
            <p className="mt-3 leading-relaxed text-gray-600">{mission.summary}</p>
          )}
          {canArchive && (
            <div className="mt-4">
              {isArchived ? (
                <button
                  type="button"
                  onClick={() => onRestoreToQueue(mission.id)}
                  className="inline-flex items-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Move Back To Queue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onMoveToPast(mission.id)}
                  className="inline-flex items-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Move To Past
                </button>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="size-4 text-red-700" />
            <h3 className="font-[family-name:var(--font-display)] font-bold text-gray-900">
              Agent Summary
            </h3>
          </div>
          <p className="text-sm leading-relaxed text-gray-600">
            {mission.summary || 'The agent is working on this mission. Details will appear here as progress is made.'}
          </p>
        </div>

        {mission.logs && mission.logs.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowLogs((value) => !value)}
              className="text-xs text-gray-400 underline underline-offset-2 transition-colors hover:text-gray-600"
            >
              {showLogs ? 'Hide execution logs' : 'View execution logs'}
            </button>
            {showLogs && (
              <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200">
                <div className="bg-gray-900 p-4">
                  <div className="space-y-1.5 font-mono text-xs">
                    {mission.logs.map((log, index) => {
                      const tagColor = log.status === 'success'
                        ? 'text-green-400'
                        : log.status === 'error'
                          ? 'text-red-400'
                          : 'text-slate-400';

                      return (
                        <p key={index} className="text-gray-300">
                          <span className={tagColor}>[{log.status.toUpperCase()}]</span>{' '}
                          <span className="text-gray-500">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>{' '}
                          {log.action}: {log.detail}
                        </p>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-1 text-xs text-gray-400">
          <p>Created: {new Date(mission.createdAt).toLocaleString()}</p>
          <p>Last updated: {new Date(mission.updatedAt).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}
