/**
 * Shared Zod schema fragment for validating `sourceUrl` parameters (AIN-72).
 *
 * Used by both POST /api/crm/ingest and GET /api/crm/saved to avoid
 * duplicating the http(s)-only + trim + length validation.
 */
import { z } from 'zod';

/**
 * Validates a listing source URL:
 *   - Trimmed string, 1–2048 chars.
 *   - Only http: or https: schemes accepted (no file:, javascript:, etc.).
 *   - Matches the ingest route's contract so dedup comparisons are consistent.
 */
export const sourceUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(
    (value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === 'http:' || protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Only http(s) listing URLs are supported' },
  );
