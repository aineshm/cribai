/**
 * errorMessage (AIN-60) — normalize an unknown rejection into a display string
 * for the CRM loader error states. Pure; no logging side effects.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim().length > 0) return err.message;
  if (typeof err === 'string' && err.trim().length > 0) return err;
  return 'Something went wrong loading your saved listings.';
}
