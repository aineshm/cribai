export default async function CribAIPage({
  params,
}: {
  params: Promise<{ campusSlug: string }>;
}) {
  const { campusSlug } = await params;

  return (
    <div>
      <h1 className="text-2xl font-bold">CribAI — {campusSlug}</h1>
      <p className="mt-2 text-gray-600">
        Ask anything about student housing in your area.
      </p>
      {/* Phase 5: Chat UI with streaming */}
      <div className="mt-8 rounded-lg border border-dashed border-gray-300 p-12 text-center text-gray-400">
        CribAI chat coming soon
      </div>
    </div>
  );
}
