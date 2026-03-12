'use client';

import { motion } from 'framer-motion';
import { fadeIn } from '@/lib/animations';

const universities = [
  'UW-Madison',
  'UT Austin',
  'UCLA',
  'UMich',
  'OSU',
  'ASU',
  'UF',
  'Penn State',
];

export function SocialProof() {
  return (
    <motion.section
      variants={fadeIn}
      initial="initial"
      whileInView="animate"
      viewport={{ once: true, margin: '-50px' }}
      className="border-y border-[var(--surface-200)] bg-white py-8"
    >
      <div className="mx-auto max-w-5xl px-6">
        <p className="text-center text-sm font-medium text-[var(--surface-400)] mb-6">
          Trusted by students at 50+ universities
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {universities.map((uni) => (
            <span
              key={uni}
              className="text-sm font-semibold text-[var(--surface-300)] tracking-wide uppercase select-none"
            >
              {uni}
            </span>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
