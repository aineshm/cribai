'use client';

import { useRef, useCallback, type KeyboardEvent, type ClipboardEvent } from 'react';
import { motion } from 'framer-motion';

interface OTPInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
}

export function OTPInput({ value, onChange, length = 6, disabled = false }: OTPInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const digits = value.padEnd(length, ' ').split('').slice(0, length);
  const isComplete = value.replace(/\s/g, '').length === length;

  const focusInput = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, length - 1));
    inputRefs.current[clamped]?.focus();
  }, [length]);

  const handleChange = useCallback(
    (index: number, char: string) => {
      if (!/^\d$/.test(char)) return;
      const arr = digits.slice();
      arr[index] = char;
      const next = arr.join('').trimEnd();
      onChange(next);
      if (index < length - 1) {
        focusInput(index + 1);
      }
    },
    [digits, length, onChange, focusInput]
  );

  const handleKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace') {
        e.preventDefault();
        const arr = digits.slice();
        if (arr[index] && arr[index] !== ' ') {
          arr[index] = ' ';
          onChange(arr.join('').trimEnd());
        } else if (index > 0) {
          arr[index - 1] = ' ';
          onChange(arr.join('').trimEnd());
          focusInput(index - 1);
        }
      } else if (e.key === 'ArrowLeft') {
        focusInput(index - 1);
      } else if (e.key === 'ArrowRight') {
        focusInput(index + 1);
      }
    },
    [digits, onChange, focusInput]
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
      if (pasted.length > 0) {
        onChange(pasted);
        focusInput(Math.min(pasted.length, length - 1));
      }
    },
    [length, onChange, focusInput]
  );

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3">
      {digits.map((digit, i) => {
        const isFilled = digit !== ' ';
        return (
          <motion.input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit === ' ' ? '' : digit}
            disabled={disabled}
            aria-label={`Digit ${i + 1}`}
            className={`h-12 w-10 sm:h-14 sm:w-12 rounded-lg border bg-white text-center text-xl font-mono text-[var(--surface-900)] focus:outline-none focus:ring-2 disabled:opacity-50 transition-colors ${
              isComplete
                ? 'border-[var(--primary-500)] ring-2 ring-[var(--primary-500)]/20'
                : isFilled
                  ? 'border-[var(--primary-400)]'
                  : 'border-[var(--surface-200)]'
            } focus:border-[var(--primary-500)] focus:ring-[var(--primary-500)]/30`}
            animate={
              isComplete
                ? { scale: [1, 1.08, 1], transition: { delay: i * 0.04, duration: 0.3 } }
                : isFilled
                  ? { scale: [0.95, 1.05, 1], transition: { duration: 0.15 } }
                  : { scale: 1 }
            }
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
          />
        );
      })}
    </div>
  );
}
