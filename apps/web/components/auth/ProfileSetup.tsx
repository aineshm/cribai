'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { slideInFromRight } from '@/lib/animations';

interface ProfileSetupProps {
  email: string;
  onComplete: (profile: { firstName: string; university: string; graduationYear: string }) => void;
  loading: boolean;
}

function detectUniversity(email: string): string {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  const uniMap: Record<string, string> = {
    'wisc.edu': 'University of Wisconsin-Madison',
    'utexas.edu': 'University of Texas at Austin',
    'umich.edu': 'University of Michigan',
    'ucla.edu': 'University of California, Los Angeles',
    'osu.edu': 'Ohio State University',
    'asu.edu': 'Arizona State University',
    'ufl.edu': 'University of Florida',
    'psu.edu': 'Penn State University',
  };

  for (const [key, value] of Object.entries(uniMap)) {
    if (domain.endsWith(key)) return value;
  }
  return '';
}

function getGraduationYears(): string[] {
  const currentYear = new Date().getFullYear();
  const years: string[] = [];
  for (let y = currentYear; y <= currentYear + 6; y++) {
    years.push(String(y));
  }
  return years;
}

export function ProfileSetup({ email, onComplete, loading }: ProfileSetupProps) {
  const detectedUni = useMemo(() => detectUniversity(email), [email]);
  const [firstName, setFirstName] = useState('');
  const [university, setUniversity] = useState(detectedUni);
  const [graduationYear, setGraduationYear] = useState('');
  const years = useMemo(() => getGraduationYears(), []);

  // Sync university state if email prop changes
  useEffect(() => {
    setUniversity(detectedUni);
  }, [detectedUni]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onComplete({ firstName, university, graduationYear });
  }

  return (
    <motion.div
      variants={slideInFromRight}
      initial="initial"
      animate="animate"
      exit="exit"
      className="w-full max-w-sm"
    >
      <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--surface-900)]">
        Complete Your Profile
      </h2>
      <p className="mt-2 text-sm text-[var(--surface-500)]">
        Just a few more details so we can personalize your experience.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-[var(--surface-700)] mb-1">
            First Name
          </label>
          <Input
            id="firstName"
            type="text"
            placeholder="Your first name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            className="h-10"
          />
        </div>

        <div>
          <label htmlFor="university" className="block text-sm font-medium text-[var(--surface-700)] mb-1">
            University
          </label>
          <Input
            id="university"
            type="text"
            placeholder="Your university"
            value={university}
            onChange={(e) => setUniversity(e.target.value)}
            required
            className="h-10"
          />
          {detectedUni && (
            <p className="mt-1 text-xs text-[var(--primary-600)]">
              Auto-detected from your email
            </p>
          )}
        </div>

        <div>
          <label htmlFor="graduationYear" className="block text-sm font-medium text-[var(--surface-700)] mb-1">
            Expected Graduation Year
          </label>
          <select
            id="graduationYear"
            value={graduationYear}
            onChange={(e) => setGraduationYear(e.target.value)}
            required
            className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-[var(--surface-900)] focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/50 transition-colors"
          >
            <option value="">Select year</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <Button
          type="submit"
          disabled={loading || !firstName || !university || !graduationYear}
          className="w-full h-10 rounded-lg bg-[var(--primary-600)] text-white hover:bg-[var(--primary-700)]"
        >
          {loading ? 'Setting up...' : 'Complete Setup'}
        </Button>
      </form>
    </motion.div>
  );
}
