'use client';

interface ChatLegalDisclaimerProps {
  readonly term: string;
  readonly explanation: string;
  readonly disclaimer: string;
}

export function ChatLegalDisclaimer({
  term,
  explanation,
  disclaimer,
}: ChatLegalDisclaimerProps) {
  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase text-gray-400">{term}</p>
        <p className="mt-1 text-sm text-gray-800">{explanation}</p>
      </div>
      <div
        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
        role="alert"
        aria-label="Legal disclaimer"
      >
        <p className="text-xs font-medium text-amber-800">
          &#9888; {disclaimer}
        </p>
      </div>
    </div>
  );
}
