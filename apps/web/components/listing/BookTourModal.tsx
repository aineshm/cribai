'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Clock, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { scaleIn, fadeIn } from '@/lib/animations';
import { toast } from 'sonner';

interface BookTourModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly listingTitle: string;
}

const AVAILABLE_DATES = [
  { label: 'Mon, Mar 16', value: '2026-03-16' },
  { label: 'Tue, Mar 17', value: '2026-03-17' },
  { label: 'Wed, Mar 18', value: '2026-03-18' },
  { label: 'Thu, Mar 19', value: '2026-03-19' },
  { label: 'Fri, Mar 20', value: '2026-03-20' },
] as const;

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
  listingTitle,
}: BookTourModalProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const handleConfirm = useCallback(() => {
    if (!selectedDate || !selectedTime) return;
    setConfirmed(true);
    toast.success('Tour request submitted!', {
      description: `${selectedDate} at ${selectedTime}`,
    });
  }, [selectedDate, selectedTime]);

  const handleClose = useCallback(() => {
    setConfirmed(false);
    setSelectedDate(null);
    setSelectedTime(null);
    setMessage('');
    onClose();
  }, [onClose]);

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
            className="relative z-10 w-full max-w-md bg-background rounded-xl shadow-xl ring-1 ring-foreground/10 overflow-hidden"
            variants={scaleIn}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--surface-200)]">
              <h2 className="text-base font-semibold text-foreground">
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
                    Your tour request for &quot;{listingTitle}&quot; has been
                    submitted. The landlord will confirm shortly.
                  </p>
                  <Button onClick={handleClose} className="mt-4">
                    Done
                  </Button>
                </div>
              ) : (
                /* Booking Form */
                <div className="space-y-5">
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
                    onClick={handleConfirm}
                    disabled={!selectedDate || !selectedTime}
                  >
                    Confirm Tour Request
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
