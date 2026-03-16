'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Clock, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { scaleIn, fadeIn } from '@/lib/animations';
import { toast } from 'sonner';
import { trackEvent } from '@/lib/track-event';

interface BookTourModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly listingId: string;
  readonly listingTitle: string;
  readonly listingAddress: string;
  readonly campusSlug?: string;
}

function getNextWeekdays(count: number): readonly { label: string; value: string }[] {
  const dates: { label: string; value: string }[] = [];
  const current = new Date();
  current.setDate(current.getDate() + 1); // start from tomorrow

  while (dates.length < count) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      const label = current.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      const value = current.toISOString().split('T')[0] ?? '';
      dates.push({ label, value });
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

const AVAILABLE_DATES = getNextWeekdays(5);

const TIME_SLOTS = [
  '9:00 AM',
  '10:00 AM',
  '11:00 AM',
  '1:00 PM',
  '2:00 PM',
  '3:00 PM',
  '4:00 PM',
] as const;

export function BookTourModal({
  isOpen,
  onClose,
  listingId,
  listingTitle,
  listingAddress,
  campusSlug,
}: BookTourModalProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const handleConfirm = useCallback(async () => {
    if (!selectedDate || !selectedTime) return;
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/tours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId,
          preferredDates: [selectedDate],
          selectedTime,
          notes: message || undefined,
        }),
      });

      if (response.status === 401) {
        const returnTo = campusSlug
          ? `/listing/${listingId}?campus=${encodeURIComponent(campusSlug)}`
          : `/listing/${listingId}`;
        router.push(`/login?returnTo=${encodeURIComponent(returnTo)}`);
        onClose();
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Failed to request tour' }));
        throw new Error(data.error ?? 'Failed to request tour');
      }

      setConfirmed(true);
      trackEvent('tour_requested', { listing_id: listingId });
      toast.success('Tour request submitted!', {
        description: `${selectedDate} around ${selectedTime}`,
      });
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : 'Failed to request tour. Please try again.';
      setErrorMessage(messageText);
      toast.error(messageText);
    } finally {
      setSubmitting(false);
    }
  }, [campusSlug, listingId, message, onClose, router, selectedDate, selectedTime]);

  const handleClose = useCallback(() => {
    setConfirmed(false);
    setSelectedDate(null);
    setSelectedTime(null);
    setMessage('');
    setErrorMessage(null);
    setSubmitting(false);
    onClose();
  }, [onClose]);

  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap and Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstEl = focusableElements[0];
        const lastEl = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl?.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // Focus the modal on open
    modalRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          variants={fadeIn}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-tour-title"
            tabIndex={-1}
            className="relative z-10 w-full max-w-md bg-background rounded-xl shadow-xl ring-1 ring-foreground/10 overflow-hidden focus:outline-none"
            variants={scaleIn}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--surface-200)]">
              <h2 id="book-tour-title" className="text-base font-semibold text-foreground">
                Book a Tour
              </h2>
              <button
                type="button"
                onClick={handleClose}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="p-4">
              {confirmed ? (
                /* Success State */
                <div className="text-center py-6 space-y-3">
                  <CheckCircle2 className="size-12 text-[var(--fair-good)] mx-auto" />
                  <h3 className="text-lg font-semibold text-foreground">
                    Tour Requested!
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                    Your tour request for &quot;{listingTitle}&quot; at{' '}
                    {listingAddress} has been submitted. We&apos;ll keep it in
                    your dashboard while you wait for a response.
                  </p>
                  <Button onClick={handleClose} className="mt-4">
                    Done
                  </Button>
                </div>
              ) : (
                /* Booking Form */
                <div className="space-y-5">
                  {errorMessage && (
                    <div className="rounded-lg bg-[var(--fair-bad-bg)] px-3 py-2 text-sm text-[var(--fair-bad)]">
                      {errorMessage}
                    </div>
                  )}

                  {/* Date Selection */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Calendar className="size-4" />
                      Select a Date
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {AVAILABLE_DATES.map((date) => (
                        <button
                          key={date.value}
                          type="button"
                          onClick={() => setSelectedDate(date.value)}
                          className={`px-3 py-2 text-xs rounded-lg border transition-all ${
                            selectedDate === date.value
                              ? 'border-[var(--primary-700)] bg-[var(--primary-50)] text-[var(--primary-700)] font-medium'
                              : 'border-[var(--surface-200)] text-foreground hover:border-[var(--surface-400)]'
                          }`}
                        >
                          {date.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time Selection */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Clock className="size-4" />
                      Select a Time
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {TIME_SLOTS.map((time) => (
                        <button
                          key={time}
                          type="button"
                          onClick={() => setSelectedTime(time)}
                          className={`px-2 py-2 text-xs rounded-lg border transition-all ${
                            selectedTime === time
                              ? 'border-[var(--primary-700)] bg-[var(--primary-50)] text-[var(--primary-700)] font-medium'
                              : 'border-[var(--surface-200)] text-foreground hover:border-[var(--surface-400)]'
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Message */}
                  <div className="space-y-2">
                    <label
                      htmlFor="tour-message"
                      className="text-sm font-medium text-foreground"
                    >
                      Message (optional)
                    </label>
                    <textarea
                      id="tour-message"
                      className="w-full h-20 px-3 py-2 text-sm rounded-lg border border-[var(--surface-200)] bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[var(--primary-700)]/20 focus:border-[var(--primary-700)] resize-none"
                      placeholder="Any questions or special requests..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                  </div>

                  {/* Confirm */}
                  <Button
                    className="w-full h-10"
                    onClick={() => void handleConfirm()}
                    disabled={!selectedDate || !selectedTime || submitting}
                  >
                    {submitting ? 'Submitting...' : 'Confirm Tour Request'}
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
