'use client';

import { useState, useCallback, useEffect } from 'react';
import { DEV_USERS, DEV_USER_COOKIE, type DevUser } from '../lib/dev-auth';

/**
 * Floating pill component that lets developers switch between mock users.
 *
 * Only rendered when BYPASS_AUTH=true. Shows a small badge in the bottom-right
 * corner that expands into a user picker on click.
 *
 * On user switch, sets the dev_user_id cookie and hard-reloads the page
 * so server components pick up the new identity.
 */
export function DevUserSwitcher({
  currentUserId,
}: {
  readonly currentUserId: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [current, setCurrent] = useState<DevUser | undefined>(() =>
    DEV_USERS.find((u) => u.id === currentUserId),
  );

  useEffect(() => {
    setCurrent(DEV_USERS.find((u) => u.id === currentUserId));
  }, [currentUserId]);

  const handleSwitch = useCallback((user: DevUser) => {
    // Set cookie directly (no httpOnly — client-accessible for dev)
    document.cookie = `${DEV_USER_COOKIE}=${user.id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    // Hard reload to propagate to server components / middleware
    window.location.reload();
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[9999]">
      {isOpen && (
        <div className="mb-2 w-72 rounded-xl border border-orange-200 bg-white shadow-2xl animate-fade-in overflow-hidden">
          <div className="border-b border-orange-100 bg-orange-50 px-4 py-2">
            <p className="text-xs font-semibold text-orange-800 uppercase tracking-wide">
              Dev User Switcher
            </p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {DEV_USERS.map((user) => {
              const isActive = user.id === current?.id;
              return (
                <button
                  key={user.id}
                  onClick={() => handleSwitch(user)}
                  className={`w-full text-left px-4 py-3 border-b border-orange-50 last:border-b-0 transition-colors ${
                    isActive
                      ? 'bg-orange-50'
                      : 'hover:bg-orange-25 hover:bg-opacity-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {user.displayName}
                      </p>
                      <p className="text-xs text-gray-500">{user.label}</p>
                      <p className="text-xs text-gray-400 font-mono">
                        {user.email}
                      </p>
                    </div>
                    {isActive && (
                      <span className="flex-shrink-0 h-2 w-2 rounded-full bg-orange-500" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full bg-orange-500 px-4 py-2 text-white shadow-lg hover:bg-orange-600 transition-colors"
        title="Switch dev user"
      >
        <span className="text-sm font-medium">
          {isOpen ? 'Close' : `Dev: ${current?.displayName ?? 'Unknown'}`}
        </span>
        <span className="text-xs opacity-75">
          {current?.subscriptionTier ?? ''}
        </span>
      </button>
    </div>
  );
}
