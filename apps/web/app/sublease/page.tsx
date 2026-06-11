import type { Metadata } from 'next';
import { createSecretClient } from '@campusnest/supabase/server';
import { SubleaseClient } from './SubleaseClient';

export const metadata: Metadata = {
  title: 'Summer Subleases — CribAI',
  description:
    'Find or post summer subleases at UW-Madison. AI-powered search, verified .edu students only. Free to use.',
  openGraph: {
    title: 'Summer Subleases — CribAI',
    description:
      'Find or post summer subleases at UW-Madison. AI-powered search, verified students only.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Summer Subleases — CribAI',
    description:
      'Find or post summer subleases at UW-Madison. AI-powered search, verified students only.',
  },
};

export const dynamic = 'force-dynamic';

export default async function SubleasePage() {
  const supabase = createSecretClient();

  // AIN-63: discovery is sublease-only; the full-corpus "Total Listings" stat
  // (scraped Zillow/CL comp corpus) is no longer surfaced anywhere.
  const { count: subleaseCount } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'sublease')
    .eq('is_active', true);

  return <SubleaseClient subleaseCount={subleaseCount ?? 0} />;
}
