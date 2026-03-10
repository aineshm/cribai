# Phase 7: Fix E2E Test Issues and Complete v1 - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning
**Source:** E2E test reports (docs/agent-outputs/e2e-listings-results.md, e2e-auth-chat-results.md, ux-audit.md)

<domain>
## Phase Boundary

Fix all bugs discovered during E2E testing and address remaining UX gaps to ship a complete v1. Agents 3 & 4 already addressed 28 of 42 UX audit items (committed in ba64784). This phase handles the remaining bugs and gaps.

</domain>

<decisions>
## Implementation Decisions

### E2E Bugs (MUST FIX)

- **Price filter shows wrong cards**: Count updates server-side (79 results) but displayed cards still show out-of-range prices ($0, $280, $350). Root cause: likely stale/cached grid data or filter not applied to query.
- **Conversations not persisted**: Chat messages only held in client state. No conversation record created in `conversations` table. `/api/conversations` POST endpoint exists but frontend never calls it. Sidebar always shows "No conversations yet." Messages lost on reload.
- **schedule_tour tool ignores dev auth**: Tool handler checks Supabase auth directly, doesn't recognize BYPASS_AUTH. Returns "You must be signed in" in dev mode. Must check `isDevAuthEnabled()` and use dev user ID from headers/cookies (same pattern as `/api/conversations/route.ts`).
- **Google Places photos return 403**: All photos from `places.googleapis.com` fail when proxied through Next.js Image Optimizer. Need to remove/replace these broken URLs or switch photo source.

### Remaining UX Issues (from audit, not yet fixed)

- **M2: "Recently Viewed" dashboard card is placeholder** — either implement localStorage-based view tracking or remove the card
- **M3: Submit listing button copy** — change "Submit Listing" to community-oriented CTA
- **M5: Profile university field hardcoded** — should derive from campus context
- **M6: Notification auto-mark-as-read** — visiting page immediately marks all read with no undo
- **M9: No tour confirmation step** — tour is submitted without preview/confirmation before tool executes
- **Missing favicon** — add favicon to prevent 404 on every page load

### Claude's Discretion

- Technical approach for fixing price filter (server-side vs client-side filtering)
- Photo placeholder strategy for listings without photos (already partially addressed by Agent 3)
- Whether to implement Recently Viewed tracking or remove the placeholder
- Conversation persistence implementation details (lazy creation pattern already designed in Phase 6)

</decisions>

<specifics>
## Specific Ideas

- Conversation persistence: Phase 6 designed lazy creation on first message (06-01 decision). The `/api/conversations` POST endpoint exists. Frontend just needs to call it.
- Dev auth pattern: `/api/conversations/route.ts` already handles dev auth correctly — replicate in schedule_tour tool handler
- Price filter: The count correctly updates to 79, so server query works. Issue is likely the card grid not re-rendering with filtered data, or using stale query params.
- Google Places photos: Since scraper was rewritten in quick task #3 (Zillow Apify + CL cheerio), Google Places photos are legacy. Can safely purge these URLs from DB.

</specifics>

<deferred>
## Deferred Ideas

- M2 Recently Viewed: defer to v2 if implementation is complex
- Tour confirmation flow (M9): defer to v2 — current flow works, just lacks pre-confirmation UI
- Property type filter: not in current data schema, defer to v2
- Map on listing detail: needs Mapbox/Google Maps API key setup, defer if not configured

</deferred>

---

*Phase: 07-fix-e2e-test-issues-and-complete-v1*
*Context gathered: 2026-03-09 from E2E test reports*
