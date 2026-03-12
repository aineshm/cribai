# Roadmap: CampusNest

## Milestones

- ✅ **v1.0 CampusNest MVP** — Phases 1-9 (shipped 2026-03-10)
- 🚧 **v1.1 UI/UX Upgrade** — Phases 10-22 (in progress)

## Phases

<details>
<summary>✅ v1.0 CampusNest MVP (Phases 1-9) — SHIPPED 2026-03-10</summary>

- [x] Phase 1: Auth and Platform Foundation (3/3 plans) — completed 2026-03-05
- [x] Phase 2: Data Pipeline (3/3 plans) — completed 2026-03-06
- [x] Phase 3: Semantic Search (3/3 plans) — completed 2026-03-06
- [x] Phase 4: Saved Listings and Alerts (4/4 plans) — completed 2026-03-06
- [x] Phase 5: Agentic Data Pipeline + Web Search (5/5 plans) — completed 2026-03-08
- [x] Phase 6: Agent Tool Expansion + Polish (3/3 plans) — completed 2026-03-09
- [x] Phase 7: Fix E2E Test Issues + Complete V1 (4/4 plans) — completed 2026-03-10
- [x] Phase 8: Close Audit Gaps + Verify Phase 4 (2/2 plans) — completed 2026-03-10
- [x] Phase 9: V1 Integration Polish + Doc Cleanup (2/2 plans) — completed 2026-03-10

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

### v1.1 UI/UX Upgrade (In Progress)

**Milestone Goal:** Migrate the entire frontend to the new Figma design system (Space Grotesk + DM Sans, shadcn/ui, Lucide, framer-motion) and introduce the AI Concierge missions page — shifting from chat-first to agent-first UX.

- [ ] **Phase 10: Design System Foundation** - Install and wire shadcn/ui, Space Grotesk + DM Sans fonts, Lucide icons, framer-motion base, and token bridge — gates all UI phases
- [ ] **Phase 11: Landing Page + Auth Redesign** - Marketing landing page with hero/social proof/CTA + branded split-panel auth flow with slide animations
- [ ] **Phase 12: Explore Page** - Unified split view (listings 60% + map 40%) with filter chips, floating CribAI panel in root layout, and extracted hook
- [ ] **Phase 13: Listing Detail Redesign** - Photo gallery grid, two-column sticky CTA layout, AI lease summary, commute section, and mobile sticky bar
- [ ] **Phase 14: Post Sublease + Profile/Saved Redesign** - Multi-step sublease wizard with progress tracker + combined profile/saved tabbed page
- [ ] **Phase 15: AI Concierge UI** - Task-based mission board with status pipeline, HITL draft approval, steering bar, agent summaries, and proactive empty state
- [x] **Phase 18: Explore Page Wiring + Verification** - Add Links to ListingCard, scope AIChatButton to Explore, wire AIChatPanel, add tests for ExploreLayout/ViewToggle/FilterChips (gap closure) (completed 2026-03-11)
- [x] **Phase 19: Auth Flow + Route Protection** - Fix post-auth redirect, protect /post and /profile with middleware, wire ProfileHeader to auth session, wire SavedListings with Links, enable Detail Chat button (gap closure) (completed 2026-03-11)
- [x] **Phase 20: Concierge Mount + Design Cleanup** - Mount ConciergeProvider in (main) layout, migrate remaining inline SVGs to Lucide (gap closure) (completed 2026-03-11)

## Phase Details

### Phase 10: Design System Foundation
**Goal**: The design system infrastructure is installed and verified — Space Grotesk + DM Sans fonts load on every page, shadcn/ui primitives are available with a clean token bridge, Lucide icons are tree-shakeable, and framer-motion wrappers are established — unblocking all subsequent UI phases without breaking any existing v1.0 features.
**Depends on**: Nothing (v1.1 starting phase — v1.0 is complete)
**Requirements**: DESIGN-01, DESIGN-02, DESIGN-03, DESIGN-04, DESIGN-05, COMPAT-01
**Success Criteria** (what must be TRUE):
  1. Every page renders Space Grotesk for headings and DM Sans for body text (verified by font inspector)
  2. A shadcn/ui Button and Card render correctly in a smoke-test page with no CSS regression on existing pages
  3. An icon rendered via lucide-react appears correctly and the bundle does not include unused icons (verified by build output)
  4. A `MotionSection` client wrapper animates on mount without triggering Server Component boundary errors
  5. The app builds and all existing tests pass after the token bridge lands in `globals.css`
**Plans**: TBD

### Phase 11: Landing Page + Auth Redesign
**Goal**: First-time visitors land on a polished marketing page that communicates CampusNest's AI value prop and converts to sign-up; the auth page uses a branded split-panel layout with slide-animated multi-step OTP flow — all built on Phase 10's design system.
**Depends on**: Phase 10
**Requirements**: LAND-01, LAND-02, LAND-03, LAND-04, AUTH-05, AUTH-06
**Success Criteria** (what must be TRUE):
  1. Unauthenticated visitor to `/` sees the marketing landing page (hero, value prop, "Get Started" CTA) — not the auth wall
  2. Landing page social proof bar, feature cards, "How It Works" section, and footer CTA are visible on desktop
  3. Mobile visitor sees a sticky "Get Started" button pinned to the bottom of the screen throughout scroll
  4. Auth page renders a branded left panel alongside the form on desktop (split layout)
  5. OTP flow transitions from email entry to code entry to profile step with visible slide animations between steps
**Plans**: TBD

### Phase 12: Explore Page
**Goal**: Users can search and browse listings in a unified split view — listing grid on the left, interactive map on the right — with filter chips above and CribAI accessible as a floating slide-over panel that persists across route navigation; the `/listings` and `/cribai` routes redirect here.
**Depends on**: Phase 10
**Requirements**: EXPL-01, EXPL-02, EXPL-03, EXPL-04, EXPL-05
**Success Criteria** (what must be TRUE):
  1. Desktop user sees listings grid (60%) and Mapbox map (40%) side by side on the explore page
  2. Mobile user can switch between List and Map views using a segmented toggle control
  3. Filter chips (Price, Beds, Distance, Move-in Date, Pet Friendly, Furnished) appear above results and update the listing grid when changed
  4. Clicking the floating AI button opens CribAI as a slide-over panel; navigating to another route and returning keeps the panel open and conversation intact
  5. Each listing card shows photo, price, beds/baths, distance badge, save button, and AI Verified badge
**Plans**: TBD

### Phase 13: Listing Detail Redesign
**Goal**: The listing detail page presents a visually rich, conversion-oriented layout — photo gallery grid with lightbox, sticky CTA sidebar, AI-generated lease summary, commute chips to campus — matching the Figma spec across desktop and mobile.
**Depends on**: Phase 10
**Requirements**: DETAIL-01, DETAIL-02, DETAIL-03, DETAIL-04, DETAIL-05
**Success Criteria** (what must be TRUE):
  1. Listing detail shows a 2/3 hero + 1/3 side grid photo layout; clicking any photo opens a full-screen lightbox
  2. Desktop shows a sticky CTA card on the right column with "Book Tour" and "Ask AI" buttons that remain visible while scrolling the left content column
  3. Landlord info card, amenities grid, and an AI-generated lease summary section are visible below the main content
  4. Commute section shows a map with distance and estimated transit/walk time to at least one campus building
  5. Mobile user sees a sticky bottom bar with price, "Book Tour", and "Chat with AI" buttons
**Plans**: TBD

### Phase 14: Post Sublease + Profile/Saved Redesign
**Goal**: Students posting a sublease complete a guided multi-step wizard with visible progress; the profile and saved listings pages are merged into a single tabbed page with a profile header — reducing navigation friction and completing the redesign of all non-explore, non-concierge pages.
**Depends on**: Phase 10
**Requirements**: POST-01, POST-02, POST-03, PROF-01, PROF-02, PROF-03
**Success Criteria** (what must be TRUE):
  1. Post sublease form guides the user through distinct steps: Basics, Details, Amenities, Photos, Description, Review — with forward/back navigation
  2. Desktop post sublease shows a sidebar listing all steps with the current step highlighted
  3. Mobile post sublease shows a progress bar with step count and completion percentage
  4. Profile/Saved page shows a header card with avatar, name, university, and verification badge
  5. Tabs switch between Saved Listings and Account Settings views; Settings section has Personal Info, Notifications, and Log Out navigation items
**Plans**: TBD

### Phase 15: AI Concierge UI
**Goal**: The AI Concierge page gives users a mission-based view of CribAI's async task work — a sidebar lists active and past missions with status indicators, a mission detail view shows action cards, agent summaries, and raw logs, a steering bar allows mid-mission correction, and an empty state suggests proactive missions — built with mock data (no backend executor in v1.1).
**Depends on**: Phase 10, Phase 12
**Requirements**: AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05, AGENT-06
**Success Criteria** (what must be TRUE):
  1. Concierge sidebar lists mock mission cards with status indicators (pending, running, awaiting approval, complete, failed)
  2. Active/Past tab filter switches the mission list between in-progress and completed missions
  3. Mission detail view shows status-specific action cards (e.g., draft approval card for a scheduled tour mission)
  4. Steering bar is visible at the bottom of the mission detail and accepts text input for course correction
  5. Empty state (no missions) shows at least three proactive mission suggestion cards based on context
**Plans**: TBD

### Phase 18: Explore Page Wiring + Verification
**Goal**: Close all Phase 12 audit gaps — add `<Link>` navigation to ListingCard, scope AIChatButton to Explore page only, wire AIChatPanel to CribAI engine (or remove hardcoded response), and add E2E/unit test coverage for ExploreLayout, ViewToggle, and FilterChips components.
**Depends on**: Phase 12
**Requirements**: EXPL-01, EXPL-02, EXPL-03, EXPL-04, EXPL-05
**Gap Closure**: Closes gaps from v1.1 milestone audit
**Success Criteria** (what must be TRUE):
  1. ListingCard wraps content in a `<Link>` to `/listing/[id]` — clicking navigates to listing detail
  2. AIChatButton only renders on Explore page (not landing, detail, or profile pages)
  3. AIChatPanel sends user messages to CribAI engine and displays responses (no hardcoded DEFAULT_RESPONSE)
  4. ExploreLayout, ViewToggle, and FilterChips have passing E2E or unit tests
  5. Explore → Listing Detail flow works end-to-end
**Plans:** 2/2 plans complete
Plans:
- [ ] 18-01-PLAN.md — Wire ListingCard Link, scope AIChatButton to Explore, replace ChatProvider stub with SSE
- [ ] 18-02-PLAN.md — Unit tests for ExploreLayout, ViewToggle, FilterChips, ListingCard, and filterListings

### Phase 19: Auth Flow + Route Protection
**Goal**: Fix cross-phase integration issues — correct post-auth redirect to `/explore`, protect `/post` and `/profile` routes with auth middleware, wire ProfileHeader to real auth session data, add `<Link>` navigation to SavedListings cards, and enable the Detail page mobile Chat button.
**Depends on**: Phase 11, Phase 13, Phase 14
**Requirements**: AUTH-06, POST-01, PROF-01, PROF-02, DETAIL-05
**Gap Closure**: Closes gaps from v1.1 milestone audit
**Success Criteria** (what must be TRUE):
  1. After OTP verification, user is redirected to `/explore` (not `/uw-madison/cribai`)
  2. Unauthenticated users accessing `/post` or `/profile` are redirected to auth page
  3. ProfileHeader displays the authenticated user's name and university from Supabase session
  4. SavedListings cards link to `/listing/[id]` — clicking navigates to listing detail
  5. MobileBottomBar "Chat with AI" button on listing detail opens AIChatPanel (not disabled)
**Plans:** 2/2 plans complete
Plans:
- [ ] 19-01-PLAN.md -- Fix post-auth redirect and add middleware route protection
- [ ] 19-02-PLAN.md -- Wire ProfileHeader to session, add SavedListings links, enable MobileBottomBar chat

### Phase 20: Concierge Mount + Design Cleanup
**Goal**: Mount ConciergeProvider and ConciergeShell in the `(main)` route group layout so the AI Concierge UI is accessible from all v1.1 pages, and complete the Lucide icon migration by replacing 8 remaining inline SVGs.
**Depends on**: Phase 15, Phase 10
**Requirements**: AGENT-01, DESIGN-03
**Gap Closure**: Closes gaps from v1.1 milestone audit
**Success Criteria** (what must be TRUE):
  1. ConciergeProvider wraps children in `(main)/layout.tsx` — ConciergeNavButton visible in main nav
  2. ConciergeShell (sidebar + detail) opens from nav button on any (main) route page
  3. All 8 previously-identified inline SVGs are replaced with Lucide icon imports
  4. No inline `<svg>` elements remain in v1.1 components (verified by grep)
**Plans:** 2/2 plans complete
Plans:
- [ ] 20-01-PLAN.md — Mount ConciergeShell + ConciergeNavButton in (main)/layout.tsx with unit test
- [ ] 20-02-PLAN.md — Replace 14 inline SVGs across 10 component files with Lucide icon imports

### Phase 21: App Navigation + Auth State
**Goal**: Make /post and /profile discoverable from the main app navigation and add auth-aware behavior to the landing page — so returning authenticated users see a shortcut to /explore instead of being funneled through login again.
**Depends on**: Phase 14, Phase 19, Phase 11
**Requirements**: POST-01, PROF-01, LAND-01, LAND-04
**Gap Closure**: Closes gaps from v1.1 milestone audit
**Success Criteria** (what must be TRUE):
  1. (main)/layout.tsx navigation includes links to /post and /profile (visible to authenticated users)
  2. Landing page detects authenticated session and shows "Go to Dashboard" CTA instead of "Sign In"
  3. Mobile sticky CTA on landing adapts to auth state (authenticated → /explore, unauthenticated → /login)
  4. "Post sublease from within app" E2E flow completes (nav link → /post → wizard)
  5. "Returning auth'd user at landing" E2E flow completes (landing → /explore shortcut)
**Plans:** 2/2 plans complete
Plans:
- [ ] 21-01-PLAN.md — Add auth-gated nav links to (main) layout + make landing page auth-aware with unit tests
- [ ] 21-02-PLAN.md — Update E2E test infrastructure and add navigation flow E2E tests

### Phase 22: Token Cleanup + Chat Multi-Campus
**Goal**: Resolve the orphaned design-tokens.ts file (either delete or integrate into component imports) and make ChatProvider campus-aware by deriving campusSlug from user context instead of hardcoding 'uw-madison'.
**Depends on**: Phase 10, Phase 18
**Requirements**: DESIGN-05, EXPL-04
**Gap Closure**: Closes gaps from v1.1 milestone audit
**Success Criteria** (what must be TRUE):
  1. design-tokens.ts is either deleted (if CSS custom properties are the sole token source) or imported by at least one component
  2. No duplicate token values exist between design-tokens.ts and globals.css (single source of truth)
  3. ChatProvider derives campusSlug from user profile or route context (not hardcoded)
  4. CribAI chat sends correct campus context for the authenticated user's campus
**Plans:** 2/2 plans complete
Plans:
- [ ] 22-01-PLAN.md — Delete design-tokens.ts and verify build passes
- [ ] 22-02-PLAN.md — Make ChatProvider campus-aware via campusSlug prop injection from campus layout

### Phase 23: Chat Campus Context + Profile Persistence
**Goal**: Fix the two broken E2E flows — give the root-layout ChatProvider a valid campusSlug (derived from user profile or a sensible default) so Explore page and Listing Detail chat work, and persist ProfileSetup data to Supabase so onboarding profile step is not a dead end.
**Depends on**: Phase 22, Phase 19
**Requirements**: EXPL-04, DETAIL-05, AUTH-05
**Gap Closure**: Closes integration gaps from v1.1 milestone audit (2026-03-12)
**Success Criteria** (what must be TRUE):
  1. Explore page AIChatPanel sends a valid campusSlug to /api/ai/cribai and receives a successful response (not 404)
  2. Listing Detail MobileBottomBar Chat button opens AIChatPanel that sends a valid campusSlug and receives a successful response
  3. ProfileSetup handleProfileComplete persists firstName, university, and graduationYear to Supabase user metadata
  4. After onboarding, /profile page displays the persisted name and university (not email-derived defaults)
  5. Unit tests cover campusSlug derivation and profile persistence
**Plans:** 2/2 plans complete
Plans:
- [ ] 23-01-PLAN.md — Derive campusSlug in (main)/layout.tsx and inject into inner ChatProvider
- [ ] 23-02-PLAN.md — Fix AuthForm.handleProfileComplete to persist profile data via supabase.auth.updateUser

### Phase 24: Listing AI Summary + Verification Sweep
**Goal**: Add the missing AI-generated lease summary section to the listing detail page, run formal verification for phases 10-15 and 18 to close the 23-requirement verification gap, and update REQUIREMENTS.md traceability table to reflect current state.
**Depends on**: Phase 23
**Requirements**: DETAIL-03, DESIGN-01, DESIGN-02, DESIGN-04, COMPAT-01, LAND-02, LAND-03, AUTH-05, EXPL-01, EXPL-02, EXPL-03, EXPL-05, DETAIL-01, DETAIL-02, DETAIL-04, POST-02, POST-03, PROF-03, AGENT-02, AGENT-03, AGENT-04, AGENT-05, AGENT-06
**Gap Closure**: Closes verification gaps from v1.1 milestone audit (2026-03-12)
**Success Criteria** (what must be TRUE):
  1. ListingContent renders an AI lease summary section with key lease terms extracted from listing data
  2. DetailedListing type includes an aiSummary or leaseSummary field
  3. VERIFICATION.md exists for phases 10, 11, 13, 14, 15, and 18
  4. All 23 previously-unverified requirements confirmed as satisfied or gaps identified
  5. REQUIREMENTS.md traceability table reflects current status for all 34 v1.1 requirements
**Plans:** 2/3 plans executed
Plans:
- [ ] 24-01-PLAN.md — Add aiSummary field + render in LeaseSummary (DETAIL-03)
- [ ] 24-02-PLAN.md — Create VERIFICATION.md for phases 10, 11, 13 (DESIGN-01/02/04, COMPAT-01, LAND-02/03, AUTH-05, DETAIL-01/02/04)
- [ ] 24-03-PLAN.md — Create VERIFICATION.md for phases 14, 15, 18 + update REQUIREMENTS.md traceability

## Progress

**Execution Order:**
Phases execute in numeric order: 10 → 11 → 12 → 13 → 14 → 15 → 18 → 19 → 20 → 21 → 22 → 23 → 24

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Auth and Platform Foundation | v1.0 | 3/3 | Complete | 2026-03-05 |
| 2. Data Pipeline | v1.0 | 3/3 | Complete | 2026-03-06 |
| 3. Semantic Search | v1.0 | 3/3 | Complete | 2026-03-06 |
| 4. Saved Listings and Alerts | v1.0 | 4/4 | Complete | 2026-03-06 |
| 5. Agentic Data Pipeline + Web Search | v1.0 | 5/5 | Complete | 2026-03-08 |
| 6. Agent Tool Expansion + Polish | v1.0 | 3/3 | Complete | 2026-03-09 |
| 7. Fix E2E + Complete V1 | v1.0 | 4/4 | Complete | 2026-03-10 |
| 8. Close Audit Gaps | v1.0 | 2/2 | Complete | 2026-03-10 |
| 9. Integration Polish | v1.0 | 2/2 | Complete | 2026-03-10 |
| 10. Design System Foundation | v1.1 | 0/TBD | Not started | - |
| 11. Landing Page + Auth Redesign | v1.1 | 0/TBD | Not started | - |
| 12. Explore Page | v1.1 | 0/TBD | Not started | - |
| 13. Listing Detail Redesign | v1.1 | 0/TBD | Not started | - |
| 14. Post Sublease + Profile/Saved Redesign | v1.1 | 0/TBD | Not started | - |
| 15. AI Concierge UI | v1.1 | 0/TBD | Not started | - |
| 18. Explore Page Wiring + Verification | 2/2 | Complete   | 2026-03-11 | - |
| 19. Auth Flow + Route Protection | 2/2 | Complete    | 2026-03-11 | - |
| 20. Concierge Mount + Design Cleanup | 2/2 | Complete    | 2026-03-11 | - |
| 21. App Navigation + Auth State | 2/2 | Complete    | 2026-03-12 | - |
| 22. Token Cleanup + Chat Multi-Campus | 2/2 | Complete    | 2026-03-12 | - |
| 23. Chat Campus Context + Profile Persistence | 2/2 | Complete    | 2026-03-12 | - |
| 24. Listing AI Summary + Verification Sweep | 2/3 | In Progress|  | - |
