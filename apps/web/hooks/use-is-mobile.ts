'use client';

import { useEffect, useState } from 'react';

/**
 * SSR-safe "is this a mobile viewport?" hook.
 *
 * Initializes to `false` (desktop) so the server render and the client's first
 * render agree — no hydration mismatch. After mount it subscribes to a
 * `matchMedia` query and updates. The default breakpoint (980px) matches the
 * point at which `CrmWorkspace` collapses its 40/60 split.
 */
export function useIsMobile(maxWidthPx = 980): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const query = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [maxWidthPx]);

  return isMobile;
}
