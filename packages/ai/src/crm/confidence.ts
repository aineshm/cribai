/**
 * Pure confidence-scoring helpers for the CRM workflows (AIN-15).
 *
 * No I/O. No side effects. All functions are deterministic.
 */

/**
 * Map the extraction confidence string enum to a numeric score in [0, 1].
 * Mirrors the mapping documented in packages/ai/src/extraction/types.ts.
 *
 * Used by addListing to write `crm_listings.extraction_confidence`.
 */
export function confidenceToNumeric(c: 'high' | 'medium' | 'low'): number {
  switch (c) {
    case 'high':
      return 0.9;
    case 'medium':
      return 0.6;
    case 'low':
      return 0.3;
  }
}

/**
 * Derive an inference-confidence score from the number of listings a student
 * has saved. Returns a value in [0, 1].
 *
 * Formula:
 *   0 or 1 saves → 0  (not enough signal)
 *   n >= 2      → min(1, log₂(n) / log₂(10))
 *
 * Calibration checkpoints:
 *   saves=2  → ~0.30
 *   saves=3  → ~0.48  (first inference threshold)
 *   saves=5  → ~0.70  (sprint success criterion: >= 0.6)
 *   saves=10 → 1.00   (saturates)
 */
export function inferenceConfidence(savedCount: number): number {
  if (savedCount <= 1) return 0;
  return Math.min(1, Math.log2(savedCount) / Math.log2(10));
}
