export interface SourceDiagnostic {
  readonly source: string;
  readonly requestCount: number;
  readonly responseCode?: number;
  readonly itemsFound: number;
  readonly itemsUpserted: number;
  readonly failureReason?: string;
  readonly durationMs: number;
}

export function createDiagnostic(
  source: string,
  startTime: number,
  result: {
    readonly found: number;
    readonly upserted: number;
    readonly error?: string;
    readonly responseCode?: number;
  },
): SourceDiagnostic {
  return {
    source,
    requestCount: 1,
    responseCode: result.responseCode,
    itemsFound: result.found,
    itemsUpserted: result.upserted,
    failureReason: result.error,
    durationMs: Date.now() - startTime,
  };
}

export function formatDiagnosticReport(
  diagnostics: readonly SourceDiagnostic[],
): string {
  const lines: string[] = [
    '## Per-Source Diagnostics',
    '',
    '| Source | Status | Found | Upserted | Duration | Notes |',
    '|--------|--------|-------|----------|----------|-------|',
  ];

  for (const d of diagnostics) {
    const status = d.failureReason ? 'FAILED' : 'OK';
    const durationStr = d.durationMs >= 1000
      ? `${(d.durationMs / 1000).toFixed(1)}s`
      : `${d.durationMs}ms`;
    const notes = d.failureReason
      ?? (d.itemsFound === 0 ? 'No listings found' : '');

    lines.push(
      `| ${d.source} | ${status} | ${d.itemsFound} | ${d.itemsUpserted} | ${durationStr} | ${notes} |`,
    );
  }

  return lines.join('\n');
}
