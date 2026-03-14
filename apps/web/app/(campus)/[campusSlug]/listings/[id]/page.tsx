import { redirect } from 'next/navigation';

export default async function CampusListingPage({ params }: { params: Promise<{ campusSlug: string; id: string }> }) {
  const { id } = await params;
  redirect(`/listing/${id}`);
}
