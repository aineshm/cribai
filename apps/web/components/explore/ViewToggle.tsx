'use client';

import { motion } from 'framer-motion';
import { List, Map as MapIcon } from 'lucide-react';
import { springConfig } from '@/lib/animations';

type ViewMode = 'list' | 'map';

interface ViewToggleProps {
  readonly activeView: ViewMode;
  readonly onViewChange: (view: ViewMode) => void;
}

const views = [
  { id: 'list' as const, label: 'List', icon: List },
  { id: 'map' as const, label: 'Map', icon: MapIcon },
] as const;

export function ViewToggle({ activeView, onViewChange }: ViewToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="View mode"
      className="relative flex items-center rounded-full border border-[var(--surface-200)] bg-white p-1 shadow-sm"
    >
      {views.map((view) => {
        const isActive = activeView === view.id;
        const Icon = view.icon;

        return (
          <button
            key={view.id}
            role="radio"
            aria-checked={isActive}
            aria-label={`${view.label} view`}
            className="relative z-10 flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors"
            style={{
              color: isActive
                ? 'rgb(15 118 110)'
                : 'var(--surface-500)',
            }}
            onClick={() => onViewChange(view.id)}
          >
            <Icon className="size-4" />
            {view.label}
            {isActive && (
              <motion.div
                layoutId="viewToggleIndicator"
                className="absolute inset-0 -z-10 rounded-full bg-red-50 shadow-sm"
                transition={springConfig.snappy}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export type { ViewMode };
