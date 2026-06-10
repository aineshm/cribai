/**
 * CRM feature visibility gate — the "merge dark" kill-switch.
 *
 * Distinct from NEXT_PUBLIC_CRM_MOCK (which picks the DATA SOURCE): this flag
 * controls whether the "My Apartments" feature is REACHABLE at all. With it off
 * the routes 404 and the nav entries don't render, so the front end can land on
 * main without exposing a half-wired surface to users.
 *
 * Off unless explicitly 'true' (safe prod default). Set NEXT_PUBLIC_CRM_ENABLED
 * to flip it on — readable in both server (route guard, layout) and client
 * (MobileBottomNav) contexts since it's a NEXT_PUBLIC var.
 */
export const isCrmEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_CRM_ENABLED === 'true';
