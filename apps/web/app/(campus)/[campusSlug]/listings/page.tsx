export default async function ListingsPage({
  params,
}: {
  params: Promise<{ campusSlug: string }>;
}) {
  const { campusSlug } = await params;

  return (
    <div>
      <h1 className="text-2xl font-bold">
        Listings — {campusSlug}
      </h1>
      <p className="mt-2 text-gray-600">
        Search and compare student housing with True Cost and Fairness Scores.
      </p>
      {/* Phase 4: ListingSearch + ListingGrid components */}
      <div className="mt-8 rounded-lg border border-dashed border-gray-300 p-12 text-center text-gray-400">
        Listing search and grid coming soon
      </div>
    </div>
  );
}
