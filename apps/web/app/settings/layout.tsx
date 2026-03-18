import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@campusnest/supabase/server';

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-[100dvh]">
      <nav className="sticky top-0 z-50 border-b border-[var(--surface-200)] bg-white/80 backdrop-blur-sm px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <Link
            href="/"
            className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]"
          >
            CribAI
          </Link>
          <span className="text-[var(--surface-300)]">/</span>
          <h1 className="text-sm font-medium text-[var(--surface-700)]">Settings</h1>
        </div>
      </nav>
      <main className="mx-auto max-w-2xl px-6 py-8">{children}</main>
    </div>
  );
}
