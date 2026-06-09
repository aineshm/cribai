'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CrmCanvas } from './CrmCanvas';

/**
 * Full-screen bottom-sheet wrapper for the CRM canvas (ported from
 * mobile-workspace.html — the `.sheet` + `.scrim` + `.sheet-grab` treatment).
 *
 * On phones the ~60% desktop canvas degrades to this sheet: a dimmed scrim, a
 * grab handle, and the SAME `CrmCanvas` content underneath. When `open` is
 * false the sheet is fully unmounted — its content (list name, units) is absent
 * from the DOM and the a11y tree, mirroring the conditionally-mounted desktop
 * pane.
 *
 * `onClose` fires from the scrim, the grab handle, or the Escape key.
 */
export function CanvasSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[70]" role="presentation">
          {/* Scrim */}
          <motion.button
            type="button"
            aria-label="Close My Apartments"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            className="absolute inset-0 cursor-default border-0"
            style={{ background: 'rgba(28, 25, 23, 0.34)', backdropFilter: 'blur(2px)' }}
          />

          {/* Sheet */}
          <motion.aside
            aria-label="My Apartments"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', ease: [0.22, 1, 0.36, 1], duration: 0.38 }}
            className="absolute inset-x-0 bottom-0 flex h-[92%] flex-col overflow-hidden rounded-t-[26px] bg-white"
            style={{ boxShadow: '0 -24px 60px rgba(28, 25, 23, 0.22)' }}
          >
            {/* Grab handle — dismisses the sheet */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Dismiss My Apartments"
              className="flex flex-shrink-0 cursor-grab items-center justify-center border-0 bg-transparent py-2"
            >
              <span
                aria-hidden="true"
                className="block h-[5px] w-[42px] rounded-full"
                style={{ background: 'var(--surface-300)' }}
              />
            </button>

            {/* The same canvas content; its own header carries the close control */}
            <div className="flex min-h-0 flex-1 flex-col">
              <CrmCanvas onClose={onClose} />
            </div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
