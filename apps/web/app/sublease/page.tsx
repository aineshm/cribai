import type { Metadata } from 'next';
import { createSecretClient } from '@campusnest/supabase/server';
import { SubleaseClient } from './SubleaseClient';

export const metadata: Metadata = {
  title: 'Summer Subleases — CampusNest',
  description:
    'Find or post summer subleases at UW-Madison. AI-powered search, verified .edu students only. Free to use.',
  openGraph: {
    title: 'Summer Subleases — CampusNest',
    description:
      'Find or post summer subleases at UW-Madison. AI-powered search, verified students only.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Summer Subleases — CampusNest',
    description:
      'Find or post summer subleases at UW-Madison. AI-powered search, verified students only.',
  },
};

export default async function SubleasePage() {
  const supabase = createSecretClient();

  const { count: subleaseCount } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'sublease')
    .eq('is_active', true);

  const { count: totalCount } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  return (
    <SubleaseClient
      subleaseCount={subleaseCount ?? 0}
      totalCount={totalCount ?? 0}
    />
  );
}
