'use client';

import { useEffect, useId, useState } from 'react';
import { ArrowRight, Bot, CheckCircle2, Clock, AlertCircle, FileText, Sparkles, X } from 'lucide-react';
import { useConcierge } from '@/components/concierge/ConciergeProvider';
import type { LegacyMission } from '@/lib/concierge-types';

type TabValue = 'active' | 'past';

const ACTIVE_STATUSES = new Set(['pending', 'running', 'waiting_approval']);

function statusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="size-4 text-teal-600" />;
    case 'waiting_approval':
      return <FileText className="size-4 text-amber-500" />;
    case 'running':
      return (
        <span className="relative flex size-4 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-50" />
          <span className="relative inline-flex size-2 rounded-full bg-teal-600" />
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
    case 'completed': return 'Completed';
    case 'waiting_approval': return 'Action needed';
    case 'running': return 'In progress';
    case 'pending': return 'Pending';
    case 'failed': return 'Failed';
    default: return status;
  }
}

function statusLabelColor(status: string): string {
  switch (status) {
    case 'completed': return 'text-teal-700';
    case 'waiting_approval': return 'text-amber-600 font-semibold';
    case 'running': return 'text-teal-600';
    case 'failed': return 'text-red-600';
    default: return 'text-gray-500';
  }
}

export function MessagesPageClient() {
  const { missions, selectedMission, selectMission } = useConcierge();
  const [tab, setTab] = useState<TabValue>('active');
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const detailTitleId = useId();

  const activeMissions = missions.filter(m => ACTIVE_STATUSES.has(m.status));
  const pastMissions = missions.filter(m => !ACTIVE_STATUSES.has(m.status));
  const pendingApproval = missions.filter(m => m.status === 'waiting_approval');
  const isWorking = missions.some(m => m.status === 'running');
  const displayedMissions = tab === 'active' ? activeMissions : pastMissions;

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

    const nextTab: TabValue = ACTIVE_STATUSES.has(selectedMission.status) ? 'active' : 'past';
    setTab((currentTab) => (currentTab === nextTab ? currentTab : nextTab));
  }, [selectedMission]);

  function handleSelectMission(mission: LegacyMission) {
    selectMission(mission);
    setMobileDetailOpen(true);
  }

  function handleTabChange(nextTab: TabValue) {
    setTab(nextTab);

    if (!selectedMission) {
      return;
    }

    const selectedMissionTab: TabValue = ACTIVE_STATUSES.has(selectedMission.status) ? 'active' : 'past';
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

  return (
    <div className="app-mobile-pane flex overflow-hidden bg-white">
      {/* Mobile detail drawer */}
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
              <MissionDetailPanel mission={selectedMission} />
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div className="flex w-full flex-col border-r border-gray-100 bg-gray-50/50 md:w-[400px]">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-800 text-white">
              <Bot className="size-5" />
            </div>
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-lg font-bold text-gray-900">
                Your Agent
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`h-2 w-2 rounded-full ${isWorking ? 'bg-amber-400 animate-pulse' : 'bg-gray-300'}`}
                />
                <span className="text-xs text-gray-500">
                  {isWorking ? 'Working' : 'Idle'}
                </span>
              </div>
            </div>
          </div>

          {/* Pending Review Banner */}
          {pendingApproval.length > 0 && (
            <div className="mt-4 flex items-center justify-between rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 text-amber-500 shrink-0" />
                <span className="text-sm font-medium text-amber-800">
                  Review required ({pendingApproval.length})
                </span>
              </div>
              <button
                type="button"
                onClick={handleReviewFirst}
                className="flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900 transition-colors"
              >
                Review <ArrowRight className="size-3" />
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="mt-4 flex gap-1 rounded-xl bg-gray-100 p-1">
            {(['active', 'past'] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                onClick={() => handleTabChange(t)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  tab === t
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'active'
                  ? `Active${activeMissions.length > 0 ? ` (${activeMissions.length})` : ''}`
                  : 'Past'}
              </button>
            ))}
          </div>
        </div>

        {/* Mission List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {displayedMissions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 mb-4">
                <Sparkles className="size-7 text-teal-600" />
              </div>
              <p className="font-[family-name:var(--font-display)] text-lg font-bold text-gray-900">
                {tab === 'active' ? 'Agent is idle' : 'No past missions'}
              </p>
              <p className="mt-2 text-sm text-gray-500 max-w-xs">
                {tab === 'active'
                  ? 'Ask CribAI to search for housing or schedule tours to start a mission.'
                  : 'Completed missions will appear here.'}
              </p>
              {tab === 'active' && (
                <a
                  href="/explore"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-900 transition-colors"
                >
                  Open Discover <ArrowRight className="size-4" />
                </a>
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

      {/* Detail Panel */}
      <div className="hidden md:flex flex-1 flex-col">
        {selectedMission ? (
          <MissionDetailPanel mission={selectedMission} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-center">
            <div>
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-teal-50 mb-4">
                <Bot className="size-10 text-teal-600" />
              </div>
              <p className="font-[family-name:var(--font-display)] text-xl font-bold text-gray-900">
                Select a mission
              </p>
              <p className="mt-2 text-sm text-gray-500">
                Choose a mission from the sidebar to view details
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
      className={`w-full text-left p-4 rounded-2xl border transition-all ${
        isSelected
          ? 'bg-white border-teal-200 shadow-sm ring-1 ring-teal-800/10'
          : 'bg-white/60 border-transparent hover:bg-white hover:border-gray-200'
      }`}
    >
      <div className="flex items-start gap-3">
        {statusIcon(mission.status)}
        <div className="min-w-0 flex-1">
          <span className={`text-xs font-medium ${statusLabelColor(mission.status)}`}>
            {statusLabel(mission.status)}
          </span>
          <p className="mt-1 text-sm font-bold text-gray-900 truncate">{mission.title}</p>
          {mission.summary && (
            <p className="mt-1 text-sm text-gray-500 line-clamp-2">{mission.summary}</p>
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

function MissionDetailPanel({ mission }: { readonly mission: LegacyMission }) {
  const [showLogs, setShowLogs] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            {statusIcon(mission.status)}
            <span className={`text-xs font-medium ${statusLabelColor(mission.status)}`}>
              {statusLabel(mission.status)}
            </span>
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-gray-900">
            {mission.title}
          </h2>
          {mission.summary && (
            <p className="mt-3 text-gray-600 leading-relaxed">{mission.summary}</p>
          )}
        </div>

        {/* Agent Summary */}
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="size-4 text-teal-700" />
            <h3 className="font-[family-name:var(--font-display)] font-bold text-gray-900">
              Agent Summary
            </h3>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            {mission.summary || 'The agent is working on this mission. Details will appear here as progress is made.'}
          </p>
        </div>

        {/* Execution logs — collapsible */}
        {mission.logs && mission.logs.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowLogs(v => !v)}
              className="text-xs text-gray-400 underline underline-offset-2 hover:text-gray-600 transition-colors"
            >
              {showLogs ? 'Hide execution logs' : 'View execution logs'}
            </button>
            {showLogs && (
              <div className="mt-3 rounded-2xl border border-gray-200 overflow-hidden">
                <div className="bg-gray-900 p-4">
                  <div className="space-y-1.5 font-mono text-xs">
                    {mission.logs.map((log, i) => {
                      const tagColor = log.status === 'success' ? 'text-green-400'
                        : log.status === 'error' ? 'text-red-400'
                        : 'text-amber-400';
                      return (
                        <p key={i} className="text-gray-300">
                          <span className={tagColor}>[{log.status.toUpperCase()}]</span>{' '}
                          <span className="text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>{' '}
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

        {/* Timestamps */}
        <div className="text-xs text-gray-400 space-y-1">
          <p>Created: {new Date(mission.createdAt).toLocaleString()}</p>
          <p>Last updated: {new Date(mission.updatedAt).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}
