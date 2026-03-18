import { redirect } from 'next/navigation';
import { SubmitListingForm } from '../../../../components/submit-listing-form';
import { getCurrentUser } from '../../../../lib/get-current-user';

export default async function SubmitListingPage({
  params,
}: {
  params: Promise<{ campusSlug: string }>;
}) {
  const { campusSlug } = await params;
  const { user } = await getCurrentUser();

  if (!user) {
    redirect(`/login?returnTo=/${campusSlug}/submit-listing`);
  }

  return (
    <div className="mx-auto max-w-2xl py-4">
      <h1 className="font-[family-name:var(--font-display)] text-2xl text-[var(--surface-900)]">
        Submit a Listing
      </h1>
      <p className="mt-2 mb-6 text-sm text-[var(--surface-500)]">
        Know about a rental? Help fellow students by adding it to CribAI.
      </p>
      <SubmitListingForm campusSlug={campusSlug} />
    </div>
  );
}
