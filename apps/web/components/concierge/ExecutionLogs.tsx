'use client';

/**
 * ExecutionLogs — collapsible list of mission step logs.
 *
 * Renders a timeline of execution log entries with colour-coded status dots.
 * Collapsed by default; expands with an animated accordion on click.
 * Used inside MissionDetail to show per-step progress to the user.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { slideInFromBottom } from '@/lib/animations';
import type { ExecutionLog, ExecutionLogStatus } from '@/lib/concierge-types';

/** Maps each log status to a Tailwind background colour for the timeline dot. */
const LOG_STATUS_COLORS: Record<ExecutionLogStatus, string> = {
  success: 'bg-green-500',
  pending: 'bg-amber-500',
  error: 'bg-red-500',
  running: 'bg-blue-500',
};

/** Formats an ISO timestamp to HH:MM:SS local time for display in the log list. */
function formatLogTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

interface ExecutionLogsProps {
  readonly logs: readonly ExecutionLog[];
}

/** Collapsible accordion that renders the full mission execution log timeline. */
export function ExecutionLogs({ logs }: ExecutionLogsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors rounded-lg"
      >
        <span>Execution Logs ({logs.length})</span>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="size-4 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-4 py-3 space-y-3">
              {logs.map((log, index) => (
                <motion.div
                  key={`${log.timestamp}-${log.action}`}
                  variants={slideInFromBottom}
                  initial="initial"
                  animate="animate"
                  transition={{ delay: index * 0.03 }}
                  className="flex gap-3"
                >
                  <div className="flex flex-col items-center pt-1.5">
                    {/* Coloured dot indicating step status */}
                    <span
                      className={`size-2 rounded-full flex-shrink-0 ${LOG_STATUS_COLORS[log.status]}`}
                    />
                    {/* Vertical connector line between entries — omitted for last item */}
                    {index < logs.length - 1 && (
                      <div className="mt-1 w-px flex-1 bg-border" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 pb-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs font-medium text-foreground">
                        {log.action}
                      </p>
                      <span className="flex-shrink-0 font-mono text-[10px] text-muted-foreground">
                        {formatLogTime(log.timestamp)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground font-mono leading-relaxed">
                      {log.detail}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
