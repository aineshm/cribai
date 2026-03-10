# Phase 1: Auth and Platform Foundation - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix broken magic link auth flow, add .edu email validation, optional profile creation, establish UW Madison as primary campus, and ensure responsive design. No new features beyond what's in AUTH-01 through AUTH-05, PLAT-01 through PLAT-03.

</domain>

<decisions>
## Implementation Decisions

### Auth Error Handling
- Block non-.edu emails immediately with inline validation error before sending magic link ("CampusNest requires a .edu email")
- Expired/used magic links: redirect to login page with toast notification explaining the issue + prompt to request a new link
- Fix the existing broken redirect in the callback route (currently redirects incorrectly after clicking magic link)

### Profile Flow
- After first successful auth: show a modal overlay on the campus page with "Complete your profile" and a visible skip button
- A persistent settings/profile page must exist at `/settings/profile` (or similar) for later editing
- Profile fields (student context): display name, avatar (upload or initials), university, graduation year, major
- Profile creation is optional — skip button dismisses modal, user can complete later from settings

### Campus Landing Experience
- Chat-first: CribAI chat is the primary interface on the campus page — "What are you looking for?"
- Chat brings up a grid of listings based on the student's query (the AI IS the product)
- Separate dashboard page exists with: personal appointments, recently viewed listings, saved items
- The AI can also answer questions about dashboard data (appointments, etc.)
- UW Madison is the default/primary campus

### Responsive Design
- UI must be usable on mobile browsers
- Chat-first layout needs to work well on small screens

### Claude's Discretion
- Exact toast notification library/approach
- Mobile layout breakpoints and responsive patterns
- Auth middleware implementation details
- Session refresh strategy

</decisions>

<specifics>
## Specific Ideas

- "The AI IS the product" — chat is front and center, not a sidebar widget
- Dashboard is secondary to chat but important for returning users to see their activity
- Student context fields on profile (university, graduation year, major) are useful prep for v2 roommate matching

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/app/(auth)/login/page.tsx`: Existing login page with `signInWithOtp()` — needs .edu validation added
- `apps/web/app/(auth)/callback/route.ts`: Auth callback route — the broken redirect lives here
- `apps/web/app/auth/callback/`: Additional auth route — possible duplicate to investigate
- `apps/web/components/auth-nav.tsx`: Auth navigation bar — reuse for authenticated state display
- `apps/web/components/cribai-chat.tsx`: Full chat UI with SSE — already works, needs to be the landing focus
- `apps/web/lib/campus-context.tsx`: Campus React context provider — reuse for UW Madison scoping
- `packages/supabase/src/client.ts` and `server.ts`: Client factories for browser and SSR auth

### Established Patterns
- Supabase Auth with magic link OTP via `@supabase/ssr` cookie handling
- Campus-scoped multi-tenancy via URL slug `[campusSlug]` and React context
- Design tokens in `globals.css` with `--primary-*`, `--surface-*` CSS variables
- Tailwind v4 with CSS custom properties for styling

### Integration Points
- `apps/web/middleware.ts`: Auth guard and rate limiting — needs to handle auth redirects correctly
- `apps/web/app/(campus)/[campusSlug]/layout.tsx`: Campus layout reads user session — needs profile awareness
- `supabase/migrations/001_initial_schema.sql`: `profiles` table exists with basic fields — may need migration for student context fields

</code_context>

<deferred>
## Deferred Ideas

- Dashboard with appointments/recently viewed/saved items — partially Phase 1 (page structure) but saved listings functionality is Phase 4
- AI answering questions about dashboard data — depends on chat persistence (Phase 6) and saved listings (Phase 4)
- Facebook Marketplace sublease scraping — noted for future milestone

</deferred>

---

*Phase: 01-auth-and-platform-foundation*
*Context gathered: 2026-03-05*
