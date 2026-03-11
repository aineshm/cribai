import Link from 'next/link';
import { ConciergeShell } from '@/components/concierge/ConciergeShell';
import { ConciergeNavButton } from '@/components/concierge/ConciergeNavButton';

export default function MainLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <ConciergeShell>
      <div className="min-h-[100dvh]">
        <nav className="sticky top-0 z-50 border-b border-[var(--surface-200)] bg-white/80 backdrop-blur-sm px-6 py-4">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <Link
              href="/"
              className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]"
            >
              CampusNest
            </Link>
            <ConciergeNavButton />
          </div>
        </nav>
        {children}
      </div>
    </ConciergeShell>
  );
}
