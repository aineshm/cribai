# Phase 4: Saved Listings and Alerts - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Students can save/favorite listings, view them on a dedicated saved listings page, see full listing detail pages with photo galleries and key info, and receive in-app notifications when saved listings' prices change. No new listing sources (Phase 5), no chat persistence (Phase 6), no roommate matching (v2).

</domain>

<decisions>
## Implementation Decisions

### Save/Favorite Interaction
- Heart icon on listing cards (overlay on hero photo area, Airbnb-style) and listing detail page
- Heart fills with animation (outline to filled, scale animation) + brief toast "Saved to favorites"
- Unauthenticated users see the heart icon; clicking prompts login redirect with return URL
- CribAI gets a new `get_saved_listings` tool so it can reference saves ("compare my saved ones", "which of my saves is cheapest?")

### Price Change Alerts
- In-app notification center: bell icon in nav with unread count, notification page shows price changes
- No email alerts for v1 — in-app only
- Price change detection runs after each nightly scrape (piggyback on GitHub Actions pipeline, no pg_cron needed)
- Any price change triggers an alert — no minimum threshold
- Display: color-coded arrows (green down for decreases, red up for increases) with old price -> new price and listing name

### Saved Listings Page
- Route: `/[campusSlug]/saved` (campus-scoped)
- Grid layout using existing ListingCard component, sorted by date saved (most recent first)
- Persistent "Saved" nav item in campus sidebar/top nav with badge showing count of price-changed saves
- Available actions: heart toggle to unsave, click card to open detail page
- Empty state: friendly message "No saved listings yet" + CTA button linking to CribAI chat

### Listing Detail Page
- Route: `/[campusSlug]/listings/[id]`
- Top: ListingPhotoGallery component (already exists) + prominent save button
- Key info section: rent, beds/baths/sqft, fairness score badge, true cost breakdown, freshness badge
- Amenities list section
- Interactive Mapbox map showing listing location (reuse MapBlock component from Phase 3 for consistency)
- "Ask CribAI about this place" CTA button that opens chat pre-filled with listing context
- "Similar nearby" section at bottom: 3 similar listings by price/location using existing ListingCard component
- Similar listings sourced via semantic embeddings or simple price+location proximity

### Claude's Discretion
- Database schema for saved_listings table (user_id + listing_id, timestamps, unique constraint)
- Notification storage schema (notifications table with type, read/unread, payload)
- Heart icon animation implementation details
- Similar listings algorithm (vector similarity vs SQL proximity)
- Bell icon notification dropdown vs full page
- "Ask CribAI" pre-fill mechanism (query params, localStorage, or React context)
- Notification badge count implementation

</decisions>

<specifics>
## Specific Ideas

- Heart icon placement on cards should be like Airbnb — top-right of the photo area, semi-transparent background for visibility
- "The AI IS the product" — the "Ask CribAI about this place" button on detail pages reinforces the AI-first experience
- Price change alerts are part of the retention loop — save listings, get notified, come back
- Navigation badge on "Saved" shows price-changed count, not total saved count — draws attention to actionable updates

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/components/listing-card.tsx`: Card component with hero photo, rent, beds/baths, fairness score, freshness badge — add heart overlay
- `apps/web/components/listing-photo-gallery.tsx`: Horizontal scroll gallery with dot indicators — reuse on detail page
- `apps/web/components/freshness-badge.tsx`: Emerald/amber/red freshness indicators — reuse on detail page
- `apps/web/components/chat/chat-map-block.tsx`: Mapbox GL JS map component — reuse for detail page location map
- `apps/web/lib/score-colors.ts`: Score color variants utility — reuse for fairness display on detail page
- `packages/ai/src/tools/`: Tool system (schemas, executor, handlers) — add get_saved_listings tool

### Established Patterns
- Supabase RLS with `auth.uid()` for user-scoped data (profiles, tour_requests)
- Campus-scoped multi-tenancy via `campus_id` foreign key
- Schema-first types: Zod schemas in `packages/types/`, inferred TypeScript types
- SSE streaming with typed ChatEvent blocks for new AI tool responses
- Sonner toast notifications (installed in Phase 1)
- `listing_history` table already archives price metadata — reuse for change detection

### Integration Points
- `supabase/migrations/`: New migration for saved_listings and notifications tables
- `apps/web/app/(campus)/[campusSlug]/`: New routes for `/saved` and `/listings/[id]`
- `apps/web/components/auth-nav.tsx`: Add "Saved" nav link + bell icon with notification count
- `.github/workflows/nightly-scrape.yml`: Add price change detection step after scrape
- `services/scraper/run.ts`: Compare new prices to previous values during upsert
- `packages/ai/src/tools/`: Register get_saved_listings tool (schema, handler, executor)

</code_context>

<deferred>
## Deferred Ideas

- Email notifications for price changes — add when email infrastructure is needed for other features
- Price history chart on detail page — future enhancement with charting library
- Notes/tags on saved listings — more powerful but adds complexity beyond v1 needs
- Compare selected saved listings (multi-select checkbox) — CribAI's compare tool handles this already
- Popularity-based empty state suggestions — needs usage metrics that don't exist yet
- Re-ranking search results based on user saves/clicks — requires behavioral data collection (Phase 5+)

</deferred>

---

*Phase: 04-saved-listings-and-alerts*
*Context gathered: 2026-03-05*
