# Phase 19: Auth Flow + Route Protection - Research

**Researched:** 2026-03-11
**Domain:** Next.js 15 middleware auth, Supabase SSR session, client-side session fetch, Next.js Link navigation
**Confidence:** HIGH

## Summary

Phase 19 closes five distinct integration gaps left by Phases 11, 13, and 14. All five issues are already present in the codebase at known locations; no new libraries are required. The work is pure wiring: fix two hard-coded strings, add two middleware route guards, convert one disabled button, and wrap one set of cards in `<Link>`.

The central challenge is that `ProfilePage` is a `'use client'` component that receives hardcoded props today. Converting it to fetch the Supabase session requires either (a) making the page a Server Component that passes session data as props, or (b) fetching the session client-side with `supabase.auth.getUser()` from `@campusnest/supabase/client`. Option (a) is preferred — it avoids a loading flash and aligns with Next.js 15 App Router conventions. However, `ProfilePage` uses framer-motion page transitions (which require `'use client'`), so the correct split is: Server Component page that fetches session + passes data as props to a `'use client'` `ProfilePageClient` wrapper that owns the motion.

The `MobileBottomBar` Chat button is disabled with no wiring. It needs `useChatContext` from the existing `ChatProvider`. Because `ChatProvider` lives in `RootLayout`, it is already available on the listing detail page — the button just needs `onClick={() => setOpen(true)}` and the `disabled` attribute removed.

**Primary recommendation:** Treat each success criterion as an independent, isolated change. None of the five fixes depends on another.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-06 | Auth form transitions between email, OTP, and profile steps with slide animations; post-auth redirect goes to `/explore` | `AuthForm.tsx` line 135 hardcodes `/uw-madison/cribai` as fallback; fix to `/explore` |
| POST-01 | User completes sublease posting via multi-step wizard; route must be auth-protected | Middleware `protectedRouteMatch` regex does not include `/post`; add it |
| PROF-01 | User sees profile header card with avatar, name, university, verification badge (from real session) | `ProfilePage` passes hardcoded "Alex Johnson" / "State University"; wire real session |
| PROF-02 | Tabbed navigation between Saved Listings and Account Settings; SavedListings cards must link to `/listing/[id]` | `SavedListings.tsx` wraps cards in plain `<motion.div>` with no Link; add `<Link>` |
| DETAIL-05 | Mobile users see sticky bottom bar with price, Book Tour, and Chat with AI buttons (Chat must work) | `MobileBottomBar` Chat button is `disabled` with `title="Coming soon"`; wire ChatContext |
</phase_requirements>

## Standard Stack

### Core (all already installed — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/ssr` | installed | Server-side auth session reading | Project's existing server client pattern |
| `@campusnest/supabase/client` | monorepo pkg | Browser Supabase client | Already used in AuthForm, campus routes |
| `@campusnest/supabase/server` | monorepo pkg | `createServerComponentClient` | Already used in campus route Server Components |
| `next/link` | Next.js 15 | Client-side navigation | Prefetching, accessibility, SPA navigation |
| `next/headers` | Next.js 15 | Read cookies in Server Components | Required for SSR Supabase session fetch |

### No New Packages Needed

All five fixes use code already in the repo. Do NOT introduce new auth libraries or routing abstractions.

## Architecture Patterns

### Recommended File Touch Map

```
apps/web/
├── components/auth/AuthForm.tsx          # Fix redirect fallback (line 135)
├── middleware.ts                          # Add /post and /profile to protected routes
├── app/(main)/profile/page.tsx           # Convert to Server Component + pass session props
├── components/profile/ProfileHeader.tsx  # Accept optional async-resolved props (no change needed)
├── components/profile/SavedListings.tsx  # Wrap cards in <Link href="/listing/[id]">
└── components/listing/MobileBottomBar.tsx # Wire useChatContext, remove disabled
```

### Pattern 1: Fix Post-Auth Redirect (AUTH-06)

**What:** `handleProfileComplete` in `AuthForm.tsx` uses `/uw-madison/cribai` as the fallback when no `returnTo` query param is present. The new fallback is `/explore`.

**Current code (line 131-136):**
```typescript
// apps/web/components/auth/AuthForm.tsx
const returnTo = searchParams.get('returnTo');
const destination =
  returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
    ? returnTo
    : '/uw-madison/cribai';   // <-- this is the bug
router.push(destination);
```

**Fix:**
```typescript
const returnTo = searchParams.get('returnTo');
const destination =
  returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
    ? returnTo
    : '/explore';
router.push(destination);
```

**Also check:** `middleware.ts` line 45 also redirects `/login` to `/${lastCampus}/cribai` in dev mode. This is the dev-bypass path — it should also be updated to redirect to `/explore` for consistency.

**And check:** `apps/web/app/auth/confirm/route.ts` line 10 — the email link confirmation fallback uses `/${lastCampus}/cribai`. Update to `/explore`.

### Pattern 2: Middleware Route Protection (POST-01, auth guard for /profile)

**What:** The existing `protectedRouteMatch` regex on line 107-110 of `middleware.ts` guards campus-scoped routes (`/[campusSlug]/cribai|dashboard|saved|...`). The v1.1 routes `/post` and `/profile` are flat routes under `(main)` — they are NOT campus-scoped and are not currently protected.

**Current regex:**
```typescript
const protectedRouteMatch = pathname.match(
  /^\/([^/]+)\/(cribai|dashboard|saved|notifications|submit-listing)/
);
```

**Fix — add flat route protection before the existing regex:**
```typescript
// Protect flat v1.1 routes
const protectedFlatRoutes = ['/post', '/profile'];
if (protectedFlatRoutes.some((route) => pathname.startsWith(route)) && !user) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('returnTo', pathname);
  return NextResponse.redirect(loginUrl);
}
```

**Note:** Use `returnTo` (not `next`) as the query param name to match what `AuthForm.tsx` reads with `searchParams.get('returnTo')`.

**Critical middleware ordering:** This new check must come AFTER the dev-auth bypass block (line 30-61) and AFTER the Supabase client setup (line 73-90), but BEFORE the existing campus route check. The user object is resolved on line 93-95.

### Pattern 3: Wire ProfileHeader to Real Auth Session (PROF-01)

**What:** `ProfilePage` (`app/(main)/profile/page.tsx`) is currently `'use client'` and passes hardcoded strings to `ProfileHeader`. It needs real session data.

**Constraint:** The page uses `framer-motion` (`motion.div`, `pageTransition`), which requires `'use client'`. The clean solution in Next.js 15 App Router is:

1. Make `profile/page.tsx` a **Server Component** (remove `'use client'`)
2. Fetch the session in the server component using `createServerComponentClient`
3. Extract `name`, `email`, `university`, `graduationYear` from `session.user`
4. Pass them as props to a new `ProfilePageClient` component that owns all the motion/tabs UI

**Session data shape (from Supabase user object):**
```typescript
// user.email — the .edu email
// user.user_metadata.full_name — name (if set during profile setup)
// user.user_metadata.university — university (if set during profile setup)
// user.user_metadata.graduation_year — graduation year
// user.created_at — for "member since" formatting
```

**Server component pattern (using `next/headers`):**
```typescript
// apps/web/app/(main)/profile/page.tsx
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@campusnest/supabase/server';
import { ProfilePageClient } from '@/components/profile/ProfilePageClient';
import { redirect } from 'next/navigation';

export default async function ProfilePage() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnTo=/profile');
  }

  const meta = user.user_metadata ?? {};
  return (
    <ProfilePageClient
      name={meta.full_name ?? user.email ?? 'Student'}
      email={user.email ?? ''}
      university={meta.university ?? ''}
      graduationYear={meta.graduation_year ?? ''}
      memberSince={new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
      isVerified={!!user.email_confirmed_at}
    />
  );
}
```

**Dev-auth fallback:** When `BYPASS_AUTH=true`, `supabase.auth.getUser()` will return null. Either the middleware already injects a dev user header (which you can read via `headers()`) or redirect to `/login` will be caught by the dev-bypass. Verify the dev-mode `user` resolution path in middleware. The safest approach: in dev mode, the middleware sets `x-dev-user-json` — read this header in the server component as a secondary fallback.

**`ProfilePageClient` is a new file** — extract the current page body into it, accept session data as props, keep `'use client'`.

### Pattern 4: SavedListings Cards with Navigation (PROF-02)

**What:** `SavedListings.tsx` wraps each card in `<motion.div>` but does not navigate. The `Card` has `cursor-pointer` but no link.

**Fix — wrap Card in Next.js Link:**
```typescript
// apps/web/components/profile/SavedListings.tsx
import Link from 'next/link';

// Inside the map:
<motion.div key={listing.id} variants={staggerItem}>
  <Link href={`/listing/${listing.id}`} className="block">
    <Card className="cursor-pointer transition-shadow hover:shadow-md">
      {/* existing content unchanged */}
    </Card>
  </Link>
</motion.div>
```

**Note:** `<Link>` renders an `<a>` tag. Adding `className="block"` ensures the anchor fills the full card width so the whole card is clickable. The `cursor-pointer` on Card is redundant but harmless.

**Demo data ids:** Current `DEMO_LISTINGS` use ids `'1'`, `'2'`, `'3'`. The listing detail page at `/listing/[id]` calls `getMockListingById(id)` — if those ids don't exist in the mock data, the detail page will 404. Either align the demo ids with mock-listing-detail ids, or accept that the nav works but detail may show notFound. The gap requirement is only that clicking navigates — not that the destination resolves.

### Pattern 5: Enable MobileBottomBar Chat Button (DETAIL-05)

**What:** `MobileBottomBar.tsx` renders the Chat button as permanently `disabled` with `title="Coming soon"`. The `ChatProvider` (with `setOpen`) is already mounted at root layout level.

**Fix:**
```typescript
// apps/web/components/listing/MobileBottomBar.tsx
import { useChatContext } from '@/components/chat/ChatProvider';

export function MobileBottomBar({ price, listingTitle }: MobileBottomBarProps) {
  const [tourModalOpen, setTourModalOpen] = useState(false);
  const { setOpen: openChat } = useChatContext();

  // ...existing JSX...
  <Button variant="outline" size="sm" onClick={() => openChat(true)}>
    <MessageCircle className="size-4" />
    Chat
  </Button>
```

**Remove:** `disabled` attribute and `title="Coming soon"` from the Chat button.

**Note:** `ChatProvider` is in `RootLayout` — it wraps all routes. `useChatContext` will work inside `MobileBottomBar` without any additional provider changes.

### Anti-Patterns to Avoid

- **Do NOT make ProfilePage `'use client'` just to call `supabase.auth.getSession()`** — `getSession()` is client-only and trusts the local cache; `getUser()` in a Server Component validates with the Supabase server.
- **Do NOT use `supabase.auth.getSession()` for security-critical data** — Supabase SSR docs explicitly say to use `getUser()` for server-side auth checks.
- **Do NOT add `next` query param to middleware redirect** — `AuthForm` reads `returnTo`, not `next`. Mixing them will break the redirect-after-login flow.
- **Do NOT wrap the Link outside motion.div** — keep `motion.div` as the outer for stagger animations, `Link` inside wrapping only the Card.
- **Do NOT modify `ChatProvider`** — it already has `setOpen`. Only `MobileBottomBar` needs to be updated.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Server-side session fetch | Custom cookie parsing | `createServerComponentClient` from `@campusnest/supabase/server` | Already handles SSR cookie edge cases, token refresh |
| Client-side navigation with prefetch | `<a href>` or `window.location` | `next/link` | Prefetching, soft navigation, no full page reload |
| Route protection logic | Custom auth HOC | Next.js middleware (`middleware.ts`) | Single enforcement point, runs before page render |

**Key insight:** All infrastructure (supabase client, ChatProvider, middleware) already exists. Phase 19 is pure wiring, not infrastructure.

## Common Pitfalls

### Pitfall 1: `returnTo` vs `next` Query Param Mismatch

**What goes wrong:** Middleware sets `?next=/profile` but `AuthForm` reads `searchParams.get('returnTo')` — the redirect-after-login silently falls back to `/explore` instead of the intended destination.

**Why it happens:** Different naming conventions across different auth implementations in the same codebase.

**How to avoid:** Use `returnTo` consistently. Check both middleware and `auth/confirm/route.ts`.

**Warning signs:** After login, user always lands on `/explore` even when they navigated from `/profile`.

### Pitfall 2: ProfilePage Framer-Motion Boundary Error

**What goes wrong:** Converting `profile/page.tsx` to a Server Component while it still contains `motion.div` triggers "Server Component boundary" errors.

**Why it happens:** `motion.div` from `framer-motion` is a client-only API.

**How to avoid:** Extract all motion/tab UI into `ProfilePageClient.tsx` with `'use client'`. The Server Component only fetches data and renders `<ProfilePageClient {...props} />`.

**Warning signs:** Build error: "You're importing a component that needs `useState`. It only works in a Client Component..."

### Pitfall 3: Dev Auth Bypass Makes ProfilePage Show Empty Data

**What goes wrong:** In dev mode (`BYPASS_AUTH=true`), Supabase returns no user. The server component redirects to `/login`, which is immediately redirected back by dev middleware — creating an infinite redirect loop.

**Why it happens:** The dev-mode middleware redirects `/login` → `/uw-madison/cribai` (or after fix, `/explore`). If the profile server component redirects to `/login`, middleware bounces it back.

**How to avoid:** Read the `x-dev-user-json` header in the server component as a fallback. The middleware already sets this header. Import `headers` from `next/headers` and parse it.

```typescript
import { headers } from 'next/headers';

// In server component:
const headersList = await headers();
const devUserJson = headersList.get('x-dev-user-json');
const devUser = devUserJson ? JSON.parse(devUserJson) : null;
const resolvedUser = supabaseUser ?? devUser;
```

**Warning signs:** Infinite redirect loop in dev mode, or profile page always shows `/login` in dev.

### Pitfall 4: SavedListings Demo IDs Don't Match Mock Detail Data

**What goes wrong:** Clicking a saved listing card navigates to `/listing/1` but the listing detail page calls `getMockListingById('1')` which returns undefined → `notFound()`.

**Why it happens:** `DEMO_LISTINGS` was created independently from `mock-listing-detail.ts`.

**How to avoid:** Before the plan, check `getMockListingById` ids — if they don't include `'1'`, `'2'`, `'3'`, update `DEMO_LISTINGS` to use real mock ids. The navigation requirement (PROF-02) only specifies that clicking navigates; `notFound()` is a different failure mode.

**Warning signs:** Card click navigates correctly but renders a 404 page.

### Pitfall 5: MobileBottomBar useChatContext Hook Error

**What goes wrong:** If `MobileBottomBar` is ever rendered outside a `ChatProvider` (e.g., in an isolated unit test), `useChatContext` throws "useChatContext must be used within a ChatProvider".

**Why it happens:** The hook throws explicitly on null context.

**How to avoid:** In tests for `MobileBottomBar`, wrap the render in `<ChatProvider>`. The real page is already covered by `RootLayout`. No production issue.

**Warning signs:** Test failures with "useChatContext must be used within a ChatProvider".

## Code Examples

Verified patterns from existing codebase:

### Reading Cookies in a Server Component (Next.js 15 pattern)

```typescript
// Source: packages/supabase/src/server.ts (existing pattern)
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@campusnest/supabase/server';

// In an async Server Component:
const cookieStore = await cookies();
const supabase = createServerComponentClient(cookieStore);
const { data: { user } } = await supabase.auth.getUser();
```

### Middleware Flat Route Guard (additive to existing pattern)

```typescript
// Source: middleware.ts (existing pattern for campus routes, adapted)
const protectedFlatRoutes = ['/post', '/profile'];
if (protectedFlatRoutes.some((route) => pathname.startsWith(route)) && !user) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('returnTo', pathname);
  return NextResponse.redirect(loginUrl);
}
```

### Link Wrapping a Card (Next.js pattern)

```typescript
// Source: Next.js 15 docs — Link component usage
import Link from 'next/link';

<Link href={`/listing/${listing.id}`} className="block">
  <Card className="cursor-pointer transition-shadow hover:shadow-md">
    {/* content */}
  </Card>
</Link>
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Campus-scoped routes (`/[campus]/...`) | Flat App Router routes (`/post`, `/profile`, `/explore`) | Middleware must guard both patterns separately |
| `supabase.auth.getSession()` (client-only) | `supabase.auth.getUser()` (server-validated) | Security: server-verified identity, not cached claim |
| Hardcoded `/uw-madison/cribai` fallback | `/explore` as universal post-auth destination | Aligns with v1.1 UX where Explore is the home page |

**Deprecated/outdated:**
- `/uw-madison/cribai` as post-auth redirect: replaced by `/explore` in v1.1 information architecture

## Open Questions

1. **Dev-mode user metadata shape**
   - What we know: `toSupabaseUser(devUser)` in `lib/dev-auth.ts` converts mock users to Supabase user shape
   - What's unclear: Whether `user_metadata` includes `full_name`, `university`, `graduation_year`
   - Recommendation: Read `lib/dev-auth.ts` in the plan step; if metadata is missing, ProfilePageClient should use sensible defaults (`email` prefix as name, empty university string)

2. **Mock listing IDs for SavedListings navigation**
   - What we know: `DEMO_LISTINGS` uses ids `'1'`, `'2'`, `'3'`; `getMockListingById` uses a different source
   - What's unclear: Whether mock-listing-detail.ts has entries with these ids
   - Recommendation: Read `lib/mock-listing-detail.ts` in the plan step; align DEMO_LISTINGS ids or accept 404 on click (only navigation behavior is required by PROF-02)

3. **`auth/confirm/route.ts` redirect scope**
   - What we know: Line 10 defaults to `/${lastCampus}/cribai` — the email-link confirm path
   - What's unclear: Whether Phase 19 scope includes fixing this route (not mentioned in success criteria, but logically consistent)
   - Recommendation: Fix it — the success criterion says "After OTP verification" which includes email-link OTP, not just inline OTP. Low risk, 1-line change.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest + @testing-library/react |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `cd apps/web && pnpm vitest run` |
| Full suite command | `cd apps/web && pnpm vitest run --reporter=verbose` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-06 | `handleProfileComplete` redirects to `/explore` when no returnTo | unit | `cd apps/web && pnpm vitest run components/auth/__tests__/AuthForm.test.tsx` | Wave 0 |
| POST-01 | Unauthenticated request to `/post` gets redirected to `/login?returnTo=/post` | unit | `cd apps/web && pnpm vitest run lib/__tests__/middleware.test.ts` | Wave 0 |
| PROF-01 | ProfileHeader renders session name and university (not hardcoded) | unit | `cd apps/web && pnpm vitest run components/profile/__tests__/ProfileHeader.test.tsx` | Exists (extend) |
| PROF-02 | SavedListings cards render as links to `/listing/[id]` | unit | `cd apps/web && pnpm vitest run components/profile/__tests__/SavedListings.test.tsx` | Wave 0 |
| DETAIL-05 | MobileBottomBar Chat button is not disabled and calls setOpen | unit | `cd apps/web && pnpm vitest run components/listing/__tests__/MobileBottomBar.test.tsx` | Wave 0 |

### Sampling Rate

- **Per task commit:** `cd apps/web && pnpm vitest run`
- **Per wave merge:** `cd apps/web && pnpm vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `apps/web/components/auth/__tests__/AuthForm.redirect.test.tsx` — covers AUTH-06 redirect behavior
- [ ] `apps/web/lib/__tests__/middleware.test.ts` — covers POST-01 and /profile route guard (middleware unit test)
- [ ] `apps/web/components/profile/__tests__/SavedListings.test.tsx` — covers PROF-02 Link navigation
- [ ] `apps/web/components/listing/__tests__/MobileBottomBar.test.tsx` — covers DETAIL-05 Chat button

Note: `ProfileHeader.test.tsx` exists but tests static props — extend it to test with dynamic session data once ProfilePageClient is created.

## Sources

### Primary (HIGH confidence)

- Direct codebase read — `apps/web/middleware.ts` (production route protection logic, exact regex)
- Direct codebase read — `apps/web/components/auth/AuthForm.tsx` (hardcoded redirect at line 135)
- Direct codebase read — `apps/web/app/auth/confirm/route.ts` (email-link confirm redirect fallback)
- Direct codebase read — `apps/web/components/listing/MobileBottomBar.tsx` (disabled Chat button)
- Direct codebase read — `apps/web/components/profile/SavedListings.tsx` (no Link present)
- Direct codebase read — `apps/web/app/(main)/profile/page.tsx` (hardcoded profile props)
- Direct codebase read — `packages/supabase/src/server.ts` (`createServerComponentClient` API)
- Direct codebase read — `apps/web/components/chat/ChatProvider.tsx` (`ChatContext` shape, `setOpen` available)

### Secondary (MEDIUM confidence)

- Next.js 15 App Router convention: `async cookies()` required for Server Components (breaking change from Next.js 14 — `cookies()` became async in Next.js 15)
- Supabase SSR recommendation: use `getUser()` not `getSession()` for server-side identity verification

### Tertiary (LOW confidence)

- Dev auth `x-dev-user-json` header behavior in Server Components — assumed to work based on middleware code setting the header; not directly tested

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in repo, no new dependencies
- Architecture: HIGH — all touch points identified by direct code read; patterns follow existing codebase conventions
- Pitfalls: HIGH — all pitfalls derived from reading actual code (hardcoded strings, missing guards, disabled buttons)
- Test gaps: HIGH — vitest config read directly; existing test patterns confirmed

**Research date:** 2026-03-11
**Valid until:** 2026-04-10 (stable domain — Next.js middleware and Supabase SSR patterns are stable)
