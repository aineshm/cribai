import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerComponentClient } from '@campusnest/supabase/server';
import { SubmitListingForm } from '../../../../components/submit-listing-form';

export default async function SubmitListingPage({
  params,
}: {
  params: Promise<{ campusSlug: string }>;
}) {
  const { campusSlug } = await params;
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnTo=/${campusSlug}/submit-listing`);
  }

  return (
    <div className="mx-auto max-w-2xl py-4">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--surface-900)]">
        Submit a Listing
      </h1>
      <p className="mt-2 mb-6 text-sm text-[var(--surface-500)]">
        Know about a rental? Help fellow students by adding it to CampusNest.
      </p>
      <SubmitListingForm campusSlug={campusSlug} />
    </div>
  );
}
