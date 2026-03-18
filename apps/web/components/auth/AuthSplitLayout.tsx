'use client';

import type { ReactNode } from 'react';
import { Home, CheckCircle2 } from 'lucide-react';

interface AuthSplitLayoutProps {
  readonly children: ReactNode;
}

const FEATURES = [
  'Verified .edu student network',
  'AI-matched listings & fair pricing',
  'Direct tour booking & lease analysis',
] as const;

export function AuthSplitLayout({ children }: AuthSplitLayoutProps) {
  return (
    <div className="flex min-h-screen">
      {/* Left panel — branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12 text-white bg-teal-900">
        {/* Radial gradient overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(20,184,166,0.15),transparent_60%)]" />
        {/* Amber blur glow */}
        <div className="absolute -left-20 -bottom-20 h-[600px] w-[600px] rounded-full bg-amber-400/10 blur-[120px]" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
            <Home className="size-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight">
            CribAI
          </span>
        </div>

        {/* Headline + features */}
        <div className="relative z-10 max-w-lg">
          <h1 className="font-[family-name:var(--font-display)] text-5xl font-extrabold leading-[1.1] tracking-tight">
            Find your perfect college apartment
          </h1>
          <div className="mt-8 space-y-4">
            {FEATURES.map((feature) => (
              <div key={feature} className="flex items-center gap-3">
                <CheckCircle2 className="size-5 shrink-0 text-amber-400" />
                <span className="text-lg text-white/80">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom spacer */}
        <div className="relative z-10" />
      </div>

      {/* Right panel — form */}
      <div className="flex w-full lg:w-1/2 items-start pt-24 sm:items-center sm:pt-0 justify-center p-8 lg:px-20 lg:py-24">
        <div className="w-full max-w-md">
          {/* Mobile logo (hidden on desktop) */}
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-800 text-white">
              <Home className="size-5" strokeWidth={2.5} />
            </div>
            <span className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-teal-800">
              CribAI
            </span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
