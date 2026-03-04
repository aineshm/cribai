export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ campusSlug: string; id: string }>;
}) {
  const { campusSlug, id } = await params;

  return (
    <div>
      <h1 className="text-2xl font-bold">Listing Detail</h1>
      <p className="mt-2 text-gray-600">
        Campus: {campusSlug} | ID: {id}
      </p>
      {/* Phase 4: ListingDetail + TrueCostCalculator + FairnessBadge */}
      <div className="mt-8 rounded-lg border border-dashed border-gray-300 p-12 text-center text-gray-400">
        Listing detail with True Cost Calculator coming soon
      </div>
    </div>
  );
}
