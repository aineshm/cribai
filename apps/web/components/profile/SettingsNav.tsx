'use client';

import { User, Bell, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

type SettingsSection = 'personal' | 'notifications' | 'logout';

interface SettingsNavProps {
  readonly activeSection: SettingsSection;
  readonly onSectionChange: (section: SettingsSection) => void;
}

const NAV_ITEMS: ReadonlyArray<{
  readonly id: SettingsSection;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly destructive?: boolean;
}> = [
  { id: 'personal', label: 'Personal Info', icon: User },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'logout', label: 'Log Out', icon: LogOut, destructive: true },
] as const;

export type { SettingsSection };

export function SettingsNav({
  activeSection,
  onSectionChange,
}: SettingsNavProps) {
  return (
    <nav className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeSection === item.id;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSectionChange(item.id)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              item.destructive
                ? 'text-destructive hover:bg-destructive/10'
                : isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
