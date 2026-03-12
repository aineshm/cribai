# Phase 21: App Navigation + Auth State - Research

**Researched:** 2026-03-11
**Domain:** Next.js 15 App Router navigation, Supabase SSR session detection, auth-aware UI
**Confidence:** HIGH

---

## Summary

Phase 21 closes two broken E2E flows identified in the v1.1 milestone audit: "Post sublease from within app" (no nav link to `/post`) and "Returning auth'd user at landing" (no auth state detection on landing page). The changes are surgical — no new routes, no new data schemas, no new API routes. Everything needed already exists in the codebase.

The work splits cleanly into two concerns: (1) adding nav links to `/post` and `/profile` inside `(main)/layout.tsx`, which requires reading Supabase session server-side since the layout is a Server Component, and (2) making the landing page (`app/page.tsx`) auth-aware so it shows "Go to Dashboard" instead of "Sign In" when a session exists. The landing page is currently `'use client'` with no auth detection. Converting it to a Server Component that passes auth state as a prop to its client children is the correct Next.js 15 pattern.

The core constraint: `(main)/layout.tsx` is a Server Component that already wraps `ConciergeShell` (a client boundary). Nav links to `/post` and `/profile` must only be visible to authenticated users. The standard approach in this codebase is to read Supabase session via `createServerComponentClient` with cookies, same as `profile/page.tsx` does. The landing page needs its own auth check using the same pattern, then passes `isAuthenticated: boolean` down to the `Hero`, `MobileStickyBar`, and nav client components.

**Primary recommendation:** Add server-side session read to `(main)/layout.tsx` and `app/page.tsx`. Pass `isAuthenticated` as a prop to auth-aware client components. Do not use `useEffect` + client-side Supabase for auth detection — SSR session is already available and avoids layout shift.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| POST-01 | User completes sublease posting via multi-step wizard (Basics, Details, Amenities, Photos, Description, Review) | Wizard already exists at `/post`. Gap is the missing nav link from `(main)` pages. Adding a nav link to layout closes the discoverability gap. |
| PROF-01 | User sees profile header card with avatar, name, university, verification badge | ProfileHeader already displays real session data. Gap is the missing nav link from `(main)` pages. |
| LAND-01 | User sees a marketing landing page with hero section, AI value prop, and "Get Started" CTA | Landing page exists. Gap is CTA always links to `/login` even for authenticated users — needs auth-aware conditional. |
| LAND-04 | Mobile users see sticky "Get Started" CTA at bottom of landing page | `MobileStickyBar` exists but always links to `/login`. Needs auth-aware href: authenticated → `/explore`, unauthenticated → `/login`. |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@campusnest/supabase` | workspace | SSR Supabase client for session reads | Already used in `profile/page.tsx` — `createServerComponentClient(cookieStore)` pattern |
| `next/navigation` | Next.js 15 | `redirect()` for server-side redirects | Used in profile/page.tsx; standard App Router pattern |
| `next/headers` | Next.js 15 | `cookies()` for SSR cookie access | Required to hydrate Supabase client server-side |
| `lucide-react` | latest | Icons for nav links (UserCircle, PlusSquare, etc.) | Project-wide icon standard (Phase 20 completed full migration) |
| `@/components/ui/button` | workspace | `buttonVariants` for styled nav links | Already used in landing page nav |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `framer-motion` | latest | Animation for nav link appearance | Only if fade-in on auth-nav links is needed; can be skipped for simplicity |
| `next/link` | Next.js 15 | Client-side navigation links | All nav items |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Server-side session in layout | `useUser()` hook client-side | Client hook causes layout shift (FOUC) — server read is preferred |
| Passing `isAuthenticated` as prop | React Context for auth state | Context adds complexity; prop drilling one level is simpler here |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended File Changes
```
apps/web/app/
├── (main)/layout.tsx         # Add server session read; render auth-nav links conditionally
├── page.tsx                  # Convert to Server Component; pass isAuthenticated to children
└── components/landing/
    ├── Hero.tsx              # Accept isAuthenticated prop; change CTA href conditionally
    └── MobileStickyBar.tsx   # Accept isAuthenticated prop; change href conditionally
```

### Pattern 1: Server Component Session Read in Layout

The `(main)/layout.tsx` is a Server Component (no `'use client'` directive). It can directly read cookies and call Supabase. This is identical to the pattern in `profile/page.tsx`.

**What:** Read session at the layout level, render nav links for `/post` and `/profile` only when authenticated.

**When to use:** When nav items must be auth-gated and layout is a Server Component.

```typescript
// Source: apps/web/app/(main)/profile/page.tsx (existing pattern)
import { cookies } from 'next/headers';
import { createServerComponentClient } from '@campusnest/supabase/server';

export default async function MainLayout({ children }) {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  // Dev-auth fallback (same pattern as profile/page.tsx)
  let resolvedUser = user;
  if (!resolvedUser) {
    const { headers } = await import('next/headers');
    const headersList = await headers();
    const devJson = headersList.get('x-dev-user-json');
    resolvedUser = devJson ? JSON.parse(devJson) : null;
  }

  const isAuthenticated = !!resolvedUser;
  // ... render nav with conditional links
}
```

**CRITICAL:** The dev-auth fallback (`x-dev-user-json` header) MUST be included, matching the pattern in `profile/page.tsx`. Without it, auth-gated nav links won't appear in dev mode.

### Pattern 2: Passing Auth State Down to Client Landing Components

`app/page.tsx` is currently `'use client'`. To read session server-side, convert to a Server Component and pass `isAuthenticated` as a prop to `Hero` and `MobileStickyBar`.

**What:** Server Component reads session, passes boolean prop to client children.

**When to use:** When a client component needs auth state but doesn't need to be the one fetching it.

```typescript
// Source: Next.js 15 App Router pattern — server → client prop passing
// app/page.tsx (becomes async Server Component, removes 'use client')
export default async function HomePage() {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthenticated = !!user;

  return (
    <div>
      <Hero isAuthenticated={isAuthenticated} />
      <MobileStickyBar isAuthenticated={isAuthenticated} />
      {/* ... other sections */}
    </div>
  );
}
```

**Important constraint:** `Hero` and `MobileStickyBar` use `framer-motion` and `useEffect` — they must remain `'use client'` components. Only the page wrapper becomes a Server Component.

### Pattern 3: Auth-Aware CTA Href

Both `Hero` (hero-cta section) and the landing page nav currently hardcode `/login`. With `isAuthenticated` prop:

```typescript
// Hero.tsx — conditional CTA
const ctaHref = isAuthenticated ? '/explore' : '/login';
const ctaText = isAuthenticated ? 'Go to Dashboard' : 'Get Started Free';
```

```typescript
// MobileStickyBar.tsx — conditional href
const ctaHref = isAuthenticated ? '/explore' : '/login';
const ctaText = isAuthenticated ? 'Go to Dashboard' : 'Get Started Free';
```

### Pattern 4: Nav Links for /post and /profile

The nav currently only has the CampusNest wordmark and `ConciergeNavButton`. Auth-gated links for Post and Profile should be added conditionally:

```typescript
// (main)/layout.tsx — auth-gated nav links
{isAuthenticated && (
  <>
    <Link href="/post">Post Sublease</Link>
    <Link href="/profile">Profile</Link>
  </>
)}
```

The `ConciergeNavButton` already exists as a client component inside `ConciergeShell`. Nav links are standard `<Link>` anchors — no client component needed.

### Anti-Patterns to Avoid

- **Client-side auth detection on landing page:** Using `useEffect` + Supabase client to detect session causes flash of "Sign In" before updating to "Go to Dashboard". Use SSR session read.
- **Wrapping layout.tsx in 'use client':** The layout must remain a Server Component so it can read cookies. Auth-aware child components receive `isAuthenticated` as a prop.
- **Forgetting dev-auth fallback:** The `x-dev-user-json` header pattern must be present anywhere Supabase session is read, otherwise auth-gated nav never shows in BYPASS_AUTH=true dev mode.
- **Rendering nav links outside the nav element:** Existing test `main-layout.test.tsx` asserts that `ConciergeNavButton` is inside a `<nav>` element. New links must also be inside the same `<nav>`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session detection | Custom cookie parser | `createServerComponentClient` + `supabase.auth.getUser()` | Already handles token refresh, cookie management, and SSR edge cases |
| Auth redirect | Custom redirect logic | `middleware.ts` already handles unauthenticated `/post` and `/profile` | Middleware already redirects unauthenticated users — no double-guard needed in layout |
| Nav state management | Auth context / global store | Server-read + prop passing | One level of prop drilling is simpler; no runtime state needed |

**Key insight:** The middleware already protects `/post` and `/profile` from unauthenticated access. The layout only needs to control *visibility* of nav links — not access control. Keep auth responsibilities separate.

---

## Common Pitfalls

### Pitfall 1: Missing Dev-Auth Fallback in Layout
**What goes wrong:** Nav links to `/post` and `/profile` never appear when running with `BYPASS_AUTH=true`.
**Why it happens:** `createServerComponentClient` returns null user when no real Supabase session exists in dev mode. The `x-dev-user-json` header injected by middleware must be read as a fallback.
**How to avoid:** Copy the exact fallback pattern from `profile/page.tsx` lines 14-19. Both the `cookies()` read AND the `headers()` fallback are required.
**Warning signs:** Nav links visible in production but not in dev server.

### Pitfall 2: layout.tsx Becomes 'use client'
**What goes wrong:** If `'use client'` is added to layout, `cookies()` and `headers()` from `next/headers` throw at runtime (they are server-only APIs).
**Why it happens:** Confusion about where the client boundary lives. `ConciergeShell` is the client boundary — layout itself is a Server Component.
**How to avoid:** Layout stays as an `async` Server Component. `ConciergeShell` handles its own client-side state internally.
**Warning signs:** Build error "cookies() was called outside a request scope" or "headers() only works in Server Components".

### Pitfall 3: page.tsx Stops Working After Server Component Conversion
**What goes wrong:** `app/page.tsx` currently uses `'use client'` at the top. Removing it and importing `cookies` from `next/headers` is correct — but any hooks or browser APIs called directly in the page body will break.
**Why it happens:** The page currently has no hooks (it just renders components), so the conversion is safe. But imports from the landing section components that are already `'use client'` remain valid as children.
**How to avoid:** Verify the page body has no `useState`, `useEffect`, or event handlers before removing `'use client'`. In the current code it does not — safe to convert.
**Warning signs:** "useState can only be used in a Client Component" at runtime.

### Pitfall 4: E2E Tests Break on Sign In Link Assertion
**What goes wrong:** `HomePage` page object in `tests/e2e/pages/HomePage.ts` has a locator for `signInLink` and `clickSignIn()`. If the landing page nav changes the "Sign In" link to "Go to Dashboard" (for authenticated users), unauthenticated E2E tests must still find "Sign In".
**Why it happens:** E2E tests run against a production-like environment. If no session cookie is present, the page shows unauthenticated state — tests should still pass. The concern is if tests run as an authenticated user, the "Sign In" locator breaks.
**How to avoid:** E2E tests for Phase 21 should test both states. Existing auth tests run unauthenticated by default — no session cookie present — so "Sign In" remains visible.
**Warning signs:** `signInLink` locator fails to find element.

### Pitfall 5: FooterCTA and Other Sections Also Link to /login
**What goes wrong:** Only `Hero` and `MobileStickyBar` are updated but `FooterCTA` still always links to `/login`.
**Why it happens:** Multiple components on the landing page contain CTAs. The phase spec calls out "CTAs" (plural) in success criterion 2 and 3.
**How to avoid:** Audit all landing page components for `/login` hardcodes and update consistently. `FooterCTA.tsx` likely also needs the auth-aware prop.
**Warning signs:** Authenticated user sees "Go to Dashboard" in hero but "Get Started Free → /login" in footer.

---

## Code Examples

### Existing Session Read Pattern (HIGH confidence)
```typescript
// Source: apps/web/app/(main)/profile/page.tsx
import { cookies, headers } from 'next/headers';
import { createServerComponentClient } from '@campusnest/supabase/server';

const cookieStore = await cookies();
const supabase = createServerComponentClient(cookieStore);
const { data: { user } } = await supabase.auth.getUser();

let resolvedUser = user;
if (!resolvedUser) {
  const headersList = await headers();
  const devJson = headersList.get('x-dev-user-json');
  resolvedUser = devJson ? (JSON.parse(devJson) as typeof user) : null;
}

if (!resolvedUser) {
  redirect('/login?returnTo=/profile');
}
```

### Existing Nav Structure (HIGH confidence)
```typescript
// Source: apps/web/app/(main)/layout.tsx — current state
<nav className="sticky top-0 z-50 border-b border-[var(--surface-200)] bg-white/80 backdrop-blur-sm px-6 py-4">
  <div className="mx-auto flex max-w-6xl items-center justify-between">
    <Link href="/" className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]">
      CampusNest
    </Link>
    <ConciergeNavButton />
  </div>
</nav>
```

New links should go between the wordmark and `ConciergeNavButton`, in a `flex gap-4` group.

### Existing MobileStickyBar Structure (HIGH confidence)
```typescript
// Source: apps/web/components/landing/MobileStickyBar.tsx
// IntersectionObserver watches #hero-cta to show/hide the bar
// Currently: href="/login", text="Get Started Free"
// Phase 21: href={isAuthenticated ? '/explore' : '/login'}
//           text={isAuthenticated ? 'Go to Dashboard' : 'Get Started Free'}
```

### Existing Main Layout Unit Test (HIGH confidence)
```typescript
// Source: apps/web/__tests__/main-layout.test.tsx
// Tests will need to be extended to cover:
// 1. Auth nav links (Post Sublease, Profile) appear when isAuthenticated
// 2. Auth nav links absent when !isAuthenticated
// Layout is Server Component — tested by mocking supabase/server and next/headers
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Client-side auth detection (`useEffect` + Supabase client) | Server Component reads session via cookies | Next.js 13+ App Router | No layout shift, no flash of wrong UI |
| Global auth context provider | SSR session prop passing | Project convention | Simpler, no provider wrapper needed |

**Deprecated/outdated:**
- `useSession()` or client Supabase hooks in layout: Not used in this project — all session reads are server-side via `createServerComponentClient`.

---

## Open Questions

1. **Should FooterCTA also be auth-aware?**
   - What we know: FooterCTA has a "Get Started Free → /login" CTA. Success criterion 2 says "landing page detects authenticated session and shows 'Go to Dashboard' CTA" without specifying which CTAs exactly.
   - What's unclear: Whether FooterCTA is in scope or only Hero and MobileStickyBar.
   - Recommendation: Update FooterCTA for consistency. If authenticated user scrolls to footer and sees "/login", the experience is broken. Low-cost change.

2. **Should nav link labels be "Post Sublease" or "Post"?**
   - What we know: The route is `/post`, the page is described as "Post Sublease" in requirements.
   - What's unclear: Exact label text.
   - Recommendation: Use short label "Post" for nav to match compact nav aesthetic (ConciergeNavButton uses single word "Concierge").

3. **Icon for nav links?**
   - What we know: ConciergeNavButton uses `Sparkles` icon from lucide-react with the label. The nav style is compact.
   - What's unclear: Whether post/profile links should have icons or text-only.
   - Recommendation: Text-only links for now, consistent with typical minimal nav patterns. Can be enhanced later.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x (unit) + Playwright (E2E) |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `pnpm --filter web test --run` |
| Full suite command | `pnpm --filter web test --run && pnpm --filter web exec playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| POST-01 | Nav link to /post visible to authenticated user in (main) nav | unit | `pnpm --filter web test --run __tests__/main-layout.test.tsx` | ✅ (needs extension) |
| POST-01 | Nav link absent for unauthenticated user | unit | `pnpm --filter web test --run __tests__/main-layout.test.tsx` | ✅ (needs extension) |
| POST-01 | "Post sublease from within app" E2E flow (nav link → /post → wizard) | e2e | `pnpm --filter web exec playwright test tests/e2e/navigation.spec.ts` | ❌ Wave 0 |
| PROF-01 | Nav link to /profile visible to authenticated user | unit | `pnpm --filter web test --run __tests__/main-layout.test.tsx` | ✅ (needs extension) |
| LAND-01 | Authenticated user sees "Go to Dashboard" CTA, not "Sign In" | unit | `pnpm --filter web test --run components/landing/__tests__/Hero.test.tsx` | ❌ Wave 0 |
| LAND-01 | Unauthenticated user sees "Get Started Free" CTA → /login | unit | `pnpm --filter web test --run components/landing/__tests__/Hero.test.tsx` | ❌ Wave 0 |
| LAND-01 | "Returning auth'd user at landing" E2E flow | e2e | `pnpm --filter web exec playwright test tests/e2e/navigation.spec.ts` | ❌ Wave 0 |
| LAND-04 | MobileStickyBar href is /explore for authenticated user | unit | `pnpm --filter web test --run components/landing/__tests__/MobileStickyBar.test.tsx` | ❌ Wave 0 |
| LAND-04 | MobileStickyBar href is /login for unauthenticated user | unit | `pnpm --filter web test --run components/landing/__tests__/MobileStickyBar.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter web test --run`
- **Per wave merge:** `pnpm --filter web test --run && pnpm run build`
- **Phase gate:** Full suite green + E2E navigation spec before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/web/components/landing/__tests__/Hero.test.tsx` — covers LAND-01 (auth-aware CTA)
- [ ] `apps/web/components/landing/__tests__/MobileStickyBar.test.tsx` — covers LAND-04 (auth-aware sticky bar)
- [ ] `apps/web/tests/e2e/navigation.spec.ts` — covers POST-01 (post sublease flow) and LAND-01 (returning auth'd user flow)
- [ ] `apps/web/tests/e2e/pages/ExplorePage.ts` — page object for E2E navigation tests

Note: `apps/web/__tests__/main-layout.test.tsx` already exists and will be extended (not created).

---

## Sources

### Primary (HIGH confidence)
- `apps/web/app/(main)/layout.tsx` — current nav structure, ConciergeShell/ConciergeNavButton pattern
- `apps/web/app/(main)/profile/page.tsx` — canonical session read pattern with dev-auth fallback
- `apps/web/middleware.ts` — protectedFlatRoutes, dev-auth bypass, production Supabase auth flow
- `apps/web/app/page.tsx` — current landing page structure, client component organization
- `apps/web/components/landing/Hero.tsx` — hero CTA structure, #hero-cta anchor
- `apps/web/components/landing/MobileStickyBar.tsx` — IntersectionObserver pattern, current href
- `apps/web/__tests__/main-layout.test.tsx` — existing layout test coverage
- `apps/web/tests/e2e/pages/HomePage.ts` — E2E page object, existing locators

### Secondary (MEDIUM confidence)
- `.planning/v1.1-MILESTONE-AUDIT.md` — gap analysis, broken flow root causes
- `.planning/REQUIREMENTS.md` — requirement definitions for POST-01, PROF-01, LAND-01, LAND-04

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; patterns are established in codebase
- Architecture: HIGH — all patterns directly observed from existing working code
- Pitfalls: HIGH — dev-auth fallback and client boundary pitfalls derived from actual code inspection
- Test gaps: HIGH — vitest config and existing test structure directly observed

**Research date:** 2026-03-11
**Valid until:** 2026-04-10 (stable Next.js 15 + Supabase patterns)
