'use client';

import { Suspense } from 'react';
import { AuthSplitLayout } from '@/components/auth/AuthSplitLayout';
import { AuthForm } from '@/components/auth/AuthForm';

function AuthFormFallback() {
  return (
    <div className="w-full max-w-sm">
      <div className="h-12 w-12 rounded-xl bg-[var(--surface-100)] animate-pulse" />
      <div className="mt-4 h-8 w-48 bg-[var(--surface-100)] rounded animate-pulse" />
      <div className="mt-2 h-4 w-64 bg-[var(--surface-100)] rounded animate-pulse" />
      <div className="mt-6 h-10 w-full bg-[var(--surface-100)] rounded-lg animate-pulse" />
      <div className="mt-4 h-10 w-full bg-[var(--surface-100)] rounded-lg animate-pulse" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthSplitLayout>
      <Suspense fallback={<AuthFormFallback />}>
        <AuthForm />
      </Suspense>
    </AuthSplitLayout>
  );
}
