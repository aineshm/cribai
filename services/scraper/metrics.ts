export interface ScrapeMetrics {
  readonly upserted: number;
  readonly staleMarked: number;
  readonly archived: number;
  readonly deleted: number;
  readonly errors: number;
}

export function createEmptyMetrics(): ScrapeMetrics {
  return { upserted: 0, staleMarked: 0, archived: 0, deleted: 0, errors: 0 };
}

/**
 * Output structured metrics to stdout for CI parsing.
 * Exits with code 1 if 0 listings were upserted (indicates scraper failure).
 */
export function outputMetrics(metrics: ScrapeMetrics): void {
  // Human-readable summary
  console.log('\n=== Scrape Summary ===');
  console.log(`Upserted: ${metrics.upserted}`);
  console.log(`Stale Marked: ${metrics.staleMarked}`);
  console.log(`Archived: ${metrics.archived}`);
  console.log(`Deleted: ${metrics.deleted}`);
  console.log(`Errors: ${metrics.errors}`);

  // Structured output for CI parsing
  console.log(`::metrics::${JSON.stringify(metrics)}`);

  if (metrics.upserted === 0 && metrics.errors > 0) {
    console.error('FAILURE: 0 listings scraped with errors -- check source configurations');
    process.exit(1);
  } else if (metrics.upserted === 0) {
    console.warn('WARNING: 0 listings upserted -- sources may be blocked or API keys missing');
  }
}
