import { CribAIChat } from '../../../../components/cribai-chat';

export default async function CribAIPage({
  params,
}: {
  params: Promise<{ campusSlug: string }>;
}) {
  const { campusSlug } = await params;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">CribAI</h1>
      <p className="mt-1 text-sm text-gray-600">
        Your AI housing advisor. Ask about prices, neighborhoods, fairness scores, and more.
      </p>
      <div className="mt-4">
        <CribAIChat campusSlug={campusSlug} />
      </div>
    </div>
  );
}
