import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createSecretClient } from '@campusnest/supabase/server';
import { TrueCostCalculator } from '../../../../../components/true-cost-calculator';
import { FairnessBadge } from '../../../../../components/fairness-badge';

interface ListingDetailPageProps {
  params: Promise<{ campusSlug: string; id: string }>;
}

export default async function ListingDetailPage({
  params,
}: ListingDetailPageProps) {
  const { campusSlug, id } = await params;
  const supabase = createSecretClient();

  const { data: listing } = await supabase
    .from('listings')
    .select('*')
    .eq('id', id)
    .single();

  if (!listing) {
    notFound();
  }

  const amenities: string[] = listing.amenities ?? [];

  return (
    <div className="animate-fade-in">
      <Link
        href={`/${campusSlug}/listings`}
        className="text-sm text-[var(--surface-400)] hover:text-[var(--surface-600)] transition-colors"
      >
        &larr; Back to listings
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--surface-900)]">{listing.address}</h1>
          <p className="mt-1 text-3xl font-bold text-[var(--surface-900)]">
            ${listing.rent_monthly.toLocaleString()}
            <span className="text-base font-normal text-[var(--surface-400)]">/mo</span>
          </p>
        </div>

        {listing.fairness_score != null && (
          <FairnessBadge
            score={listing.fairness_score}
            data={listing.fairness_data}
          />
        )}
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        {/* Details */}
        <div className="space-y-6">
          <section className="rounded-xl bg-white p-5 shadow-[var(--shadow-card)]">
            <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]">Details</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              {listing.bedrooms != null && (
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--surface-400)]">Bedrooms</dt>
                  <dd className="mt-1 font-medium text-[var(--surface-700)]">
                    {listing.bedrooms === 0 ? 'Studio' : listing.bedrooms}
                  </dd>
                </div>
              )}
              {listing.bathrooms != null && (
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--surface-400)]">Bathrooms</dt>
                  <dd className="mt-1 font-medium text-[var(--surface-700)]">{listing.bathrooms}</dd>
                </div>
              )}
              {listing.sqft != null && (
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--surface-400)]">Square Feet</dt>
                  <dd className="mt-1 font-medium text-[var(--surface-700)]">
                    {listing.sqft.toLocaleString()}
                  </dd>
                </div>
              )}
              {listing.available_date && (
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--surface-400)]">Available</dt>
                  <dd className="mt-1 font-medium text-[var(--surface-700)]">{listing.available_date}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs uppercase tracking-wider text-[var(--surface-400)]">Source</dt>
                <dd className="mt-1 font-medium text-[var(--surface-700)]">{listing.source}</dd>
              </div>
            </dl>
          </section>

          {amenities.length > 0 && (
            <section className="rounded-xl bg-white p-5 shadow-[var(--shadow-card)]">
              <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]">Amenities</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {amenities.map((a) => (
                  <span
                    key={a}
                    className="rounded-full bg-[var(--primary-50)] px-3 py-1 text-sm text-[var(--primary-700)]"
                  >
                    {a.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* True Cost Calculator */}
        <div>
          <TrueCostCalculator
            rentMonthly={listing.rent_monthly}
            amenities={amenities}
          />
        </div>
      </div>
    </div>
  );
}
