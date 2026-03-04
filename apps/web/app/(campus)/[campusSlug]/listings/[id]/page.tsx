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
    <div>
      <Link
        href={`/${campusSlug}/listings`}
        className="text-sm text-gray-500 hover:text-gray-700"
      >
        &larr; Back to listings
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{listing.address}</h1>
          <p className="mt-1 text-3xl font-bold text-gray-900">
            ${listing.rent_monthly.toLocaleString()}
            <span className="text-base font-normal text-gray-500">/mo</span>
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
          <section>
            <h2 className="text-lg font-semibold">Details</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              {listing.bedrooms != null && (
                <div>
                  <dt className="text-gray-500">Bedrooms</dt>
                  <dd className="font-medium">
                    {listing.bedrooms === 0 ? 'Studio' : listing.bedrooms}
                  </dd>
                </div>
              )}
              {listing.bathrooms != null && (
                <div>
                  <dt className="text-gray-500">Bathrooms</dt>
                  <dd className="font-medium">{listing.bathrooms}</dd>
                </div>
              )}
              {listing.sqft != null && (
                <div>
                  <dt className="text-gray-500">Square Feet</dt>
                  <dd className="font-medium">
                    {listing.sqft.toLocaleString()}
                  </dd>
                </div>
              )}
              {listing.available_date && (
                <div>
                  <dt className="text-gray-500">Available</dt>
                  <dd className="font-medium">{listing.available_date}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500">Source</dt>
                <dd className="font-medium">{listing.source}</dd>
              </div>
            </dl>
          </section>

          {amenities.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold">Amenities</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {amenities.map((a) => (
                  <span
                    key={a}
                    className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
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
