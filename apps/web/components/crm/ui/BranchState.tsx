import type { ReactNode } from 'react';
import type { FanoutBranch } from '@campusnest/ai';

/**
 * Crash-safe renderer for a FanoutBranch<T>.
 *
 * - `ok`      → renders `children(branch.data)`.
 * - `skipped` → a quiet "Couldn't check — {reason}" line (never touches `.data`).
 * - `error`   → the same line in the bad/error color, surfacing `branch.error`.
 *
 * The whole point of this atom is that the `data` field is only ever read on the
 * `ok` arm, so a skipped/error branch can never throw on a missing payload.
 */
export function BranchState<T>({
  branch,
  children,
}: {
  branch: FanoutBranch<T>;
  children: (data: T) => ReactNode;
}) {
  if (branch.status === 'ok') return <>{children(branch.data)}</>;

  if (branch.status === 'skipped') {
    return (
      <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
        Couldn&rsquo;t check — {branch.reason}
      </p>
    );
  }

  return (
    <p className="text-sm" style={{ color: 'var(--fair-bad)' }}>
      Couldn&rsquo;t check — {branch.error}
    </p>
  );
}
