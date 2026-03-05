import { CribAIChat } from '../../../../components/cribai-chat';

export default async function CribAIPage({
  params,
}: {
  params: Promise<{ campusSlug: string }>;
}) {
  const { campusSlug } = await params;

  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--surface-900)]">CribAI</h1>
      <p className="mt-1 text-sm text-[var(--surface-500)]">
        Your AI housing advisor. Ask about prices, neighborhoods, fairness scores, and more.
      </p>
      <div className="mt-4">
        <CribAIChat campusSlug={campusSlug} />
      </div>
    </div>
  );
}
