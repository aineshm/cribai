import { redirect } from 'next/navigation';

export default async function CampusListingPage({ params }: { params: Promise<{ campusSlug: string; id: string }> }) {
  const { campusSlug, id } = await params;
  redirect(`/listing/${id}?campus=${campusSlug}`);
}
