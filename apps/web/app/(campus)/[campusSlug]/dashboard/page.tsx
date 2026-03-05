import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@campusnest/supabase/server';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const cards = [
    {
      title: 'Upcoming Appointments',
      emptyText: 'No appointments yet',
    },
    {
      title: 'Recently Viewed',
      emptyText: 'No recently viewed listings',
    },
    {
      title: 'Saved Items',
      emptyText: 'No saved items yet',
    },
  ] as const;

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--surface-900)] mb-6">
        Dashboard
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-xl border border-[var(--surface-200)] bg-[var(--surface-50)] p-6 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-[var(--surface-800)] mb-4">
              {card.title}
            </h2>
            <p className="text-sm text-[var(--surface-400)]">
              {card.emptyText}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
