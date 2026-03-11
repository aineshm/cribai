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
    <div className="relative flex items-center bg-[var(--surface-100)] rounded-lg p-1 border border-[var(--surface-200)]">
      {views.map((view) => {
        const isActive = activeView === view.id;
        const Icon = view.icon;

        return (
          <button
            key={view.id}
            className="relative z-10 flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors"
            style={{
              color: isActive
                ? 'var(--primary-700)'
                : 'var(--surface-500)',
            }}
            onClick={() => onViewChange(view.id)}
            aria-pressed={activeView === view.id}
          >
            <Icon className="size-4" />
            {view.label}
            {isActive && (
              <motion.div
                layoutId="viewToggleIndicator"
                className="absolute inset-0 bg-white rounded-md shadow-sm -z-10"
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
