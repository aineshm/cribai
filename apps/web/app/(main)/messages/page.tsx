import type { Metadata } from 'next';
import { MessagesPageClient } from '@/components/messages/MessagesPageClient';

export const metadata: Metadata = {
  title: 'Agent Missions — CampusNest',
  description: 'View and manage your AI agent missions, tour bookings, and housing search tasks.',
};

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return <MessagesPageClient searchParams={params} />;
}
