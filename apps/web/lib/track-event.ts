/**
 * Fire-and-forget analytics event tracker.
 * Sends events to /api/events — failures are silently ignored.
 */
export function trackEvent(
  event: string,
  metadata?: Record<string, unknown>
): void {
  fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, metadata }),
  }).catch(() => {
    // Analytics should never block the user experience
  });
}
