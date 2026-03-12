'use client';

import type { ReactNode } from 'react';

interface AuthSplitLayoutProps {
  children: ReactNode;
}

export function AuthSplitLayout({ children }: AuthSplitLayoutProps) {
  return (
    <div className="flex min-h-screen">
      {/* Left panel — branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col items-center justify-center p-12 text-white auth-gradient-bg">
        {/* Animated gradient background */}
        <div className="absolute inset-0 auth-gradient-animate" />

        <div className="relative z-10 max-w-md text-center">
          <h1 className="font-[family-name:var(--font-display)] text-4xl xl:text-5xl tracking-tight">
            CampusNest
          </h1>
          <p className="mt-4 text-lg text-white/80 leading-relaxed">
            Student housing, finally transparent. Powered by AI that understands
            what students actually need.
          </p>
          <div className="mt-8 flex items-center justify-center gap-6 text-sm text-white/60">
            <span>AI-Powered</span>
            <span className="h-1 w-1 rounded-full bg-white/40" />
            <span>Verified .edu</span>
            <span className="h-1 w-1 rounded-full bg-white/40" />
            <span>Fair Pricing</span>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-6 sm:p-8">
        {children}
      </div>
    </div>
  );
}
