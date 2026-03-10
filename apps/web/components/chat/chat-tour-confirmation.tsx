'use client';

interface ChatTourConfirmationProps {
  readonly tourRequestId: string;
  readonly listingAddress: string;
  readonly status: string;
}

export function ChatTourConfirmation({
  tourRequestId,
  listingAddress,
  status,
}: ChatTourConfirmationProps) {
  return (
    <div
      className="rounded-lg border border-[var(--fair-good)] border-opacity-30 bg-[var(--fair-good-bg)] p-3"
      role="status"
      aria-label="Tour request confirmation"
      data-tour-request-id={tourRequestId}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-[var(--fair-good)]" aria-hidden="true">&#10003;</span>
        <div>
          <p className="text-sm font-medium text-[var(--surface-800)]">
            Tour Request Submitted
          </p>
          <p className="mt-0.5 text-xs text-[var(--surface-600)]">
            {listingAddress}
          </p>
          <p className="mt-1 text-xs text-[var(--surface-500)]">
            Status: <span className="font-medium capitalize">{status}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
