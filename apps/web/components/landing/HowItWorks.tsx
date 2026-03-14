'use client';

import { motion } from 'framer-motion';
import { UserPlus, MessageSquare, Home } from 'lucide-react';
import { staggerContainer, staggerItem } from '@/lib/animations';

const steps = [
  {
    number: '01',
    icon: UserPlus,
    title: 'Sign Up with Your .edu Email',
    description:
      'Verify your student status in seconds. No passwords to remember — just a quick email code.',
  },
  {
    number: '02',
    icon: MessageSquare,
    title: 'Tell AI What You Need',
    description:
      'Chat naturally about your budget, preferred neighborhoods, move-in date, and must-haves.',
  },
  {
    number: '03',
    icon: Home,
    title: 'Get Matched & Move In',
    description:
      'Browse AI-curated listings with fairness scores, schedule tours, and understand every lease term.',
  },
] as const;

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="border-t border-[var(--surface-200)] bg-[var(--surface-50)] py-20"
    >
      <div className="mx-auto max-w-4xl px-6">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: '-80px' }}
        >
          <motion.h2
            variants={staggerItem}
            className="text-center font-[family-name:var(--font-display)] text-3xl sm:text-4xl text-[var(--surface-900)] tracking-tight"
          >
            How It Works
          </motion.h2>
          <motion.p
            variants={staggerItem}
            className="mt-3 text-center text-[var(--surface-500)]"
          >
            Three simple steps to your next apartment.
          </motion.p>

          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            {steps.map((step, i) => (
              <motion.div
                key={step.number}
                variants={staggerItem}
                data-testid="how-it-works-step"
                className="relative text-center"
              >
                {/* Connecting line (hidden on mobile, shown between items on desktop) */}
                {i < steps.length - 1 && (
                  <div className="absolute top-8 left-[calc(50%+2rem)] right-[calc(-50%+2rem)] hidden sm:block">
                    <div className="h-px w-full bg-[var(--surface-300)]" />
                  </div>
                )}

                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--primary-600)] text-white shadow-lg shadow-[var(--primary-600)]/20">
                  <step.icon className="h-7 w-7" />
                </div>
                <span className="mt-4 block text-xs font-bold uppercase tracking-widest text-[var(--primary-600)]">
                  Step {step.number}
                </span>
                <h3 className="mt-2 font-[family-name:var(--font-display)] text-lg text-[var(--surface-800)]">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-[var(--surface-500)] leading-relaxed">
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
