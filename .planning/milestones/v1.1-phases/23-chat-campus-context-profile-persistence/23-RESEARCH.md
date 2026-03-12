# Phase 23: Chat Campus Context + Profile Persistence - Research

**Researched:** 2026-03-11
**Domain:** Next.js 15 Server Components, Supabase Auth user_metadata, React context prop drilling
**Confidence:** HIGH

## Summary

Phase 23 closes two concrete integration bugs surfaced by the v1.1 milestone audit. Both bugs are straightforward to fix once the data flow is understood — they require minimal new abstractions and no new dependencies.

**Bug 1 — ChatProvider campusSlug (EXPL-04, DETAIL-05):** The root layout mounts `<ChatProvider>` with no `campusSlug` prop, which defaults to `''`. Any chat message sent from the Explore page or Listing Detail mobile bar POSTs `campusSlug: ''` to `/api/ai/cribai`, which queries `campus_configs.eq('slug', '')` → 0 rows → 404. The campus layout already mounts a correct inner `<ChatProvider campusSlug={campusSlug}>` (innermost-wins React context pattern), so campus-scoped routes work. The flat `(main)` routes — `/explore` and `/listing/[id]` — sit under the root layout's broken ChatProvider. The fix is to make the root-layout ChatProvider receive a real slug derived from the authenticated user's session.

**Bug 2 — ProfileSetup persistence (AUTH-05):** `AuthForm.handleProfileComplete` receives `{ firstName, university, graduationYear }` from `ProfileSetup.onComplete` but ignores the argument — it navigates immediately with no write to Supabase. The profile page reads `user_metadata.full_name`, `user_metadata.university`, and `user_metadata.graduation_year` from the Supabase session. The fix is to call `supabase.auth.updateUser({ data: { full_name, university, graduation_year } })` before navigating.

**Primary recommendation:** Derive campusSlug for the root layout by reading the authenticated user's Supabase `user_metadata.campus_slug` (or a first-available campus fallback) in a new Server Component API route or inside `(main)/layout.tsx`. Persist ProfileSetup data by calling `supabase.auth.updateUser` in `AuthForm.handleProfileComplete` before `router.push`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXPL-04 | Floating AI button opens CribAI as a slide-over chat panel (not a separate page) | ChatProvider in root layout must receive a valid campusSlug so the panel can call /api/ai/cribai without 404 |
| DETAIL-05 | Mobile users see sticky bottom bar with price, Book Tour, and Chat with AI buttons | MobileBottomBar uses useChatContext() — the same root-layout ChatProvider fix unblocks chat here |
| AUTH-05 | Auth page uses split layout with branded left panel (desktop) and animated multi-step form | Auth-05 also covers profile step data persistence: handleProfileComplete must write to Supabase before navigating |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @supabase/ssr | installed | Browser Supabase client (already in use) | `createClient()` from `@campusnest/supabase/client` — the existing browser client |
| @supabase/supabase-js | installed | `auth.updateUser()` for user_metadata writes | updateUser persists to auth.users.raw_user_meta_data |
| Next.js 15 App Router | 15.x | Server Component data fetching in layouts | `(main)/layout.tsx` is already an async server component |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next/headers `cookies()` | built-in | Read auth session server-side | Already used in `(main)/layout.tsx` and `profile/page.tsx` |
| `createServerComponentClient` | @campusnest/supabase/server | Auth-aware Supabase server client | Already used in `(main)/layout.tsx` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reading campus_slug from user_metadata server-side | Querying first campus from DB | metadata approach zero extra DB query; first-campus fallback needed if metadata empty |
| updateUser for profile persistence | Writing to `profiles` table | updateUser is one call from the browser client already used in AuthForm; profiles table write requires server action |

**No new installation needed** — all required packages are already in the monorepo.

## Architecture Patterns

### Recommended Project Structure
No new files/folders required. Changes land in existing files:
```
apps/web/
├── app/
│   ├── layout.tsx                     # CHANGE: pass campusSlug to ChatProvider
│   └── (main)/
│       └── layout.tsx                 # CHANGE: derive campusSlug from session + pass to root ChatProvider
├── components/
│   └── auth/
│       └── AuthForm.tsx               # CHANGE: call updateUser before router.push
└── components/chat/
    └── __tests__/
        └── ChatProvider.test.tsx      # UPDATE: adjust "empty campusSlug" test; add campusSlug derivation test
    and add:
    └── components/auth/__tests__/
        └── AuthForm.persist.test.tsx  # NEW: verify updateUser called with correct data
```

### Pattern 1: Derive campusSlug in (main)/layout.tsx and pass it down via ChatProvider prop

**What:** `(main)/layout.tsx` is already an async server component that reads auth state. Add a campus lookup: read `user_metadata.campus_slug` from the session; if absent, query `campus_configs` for the first available slug as fallback; pass it to the root-layout ChatProvider via a server-to-client boundary.

**Problem:** Root `layout.tsx` cannot be converted to async (it wraps the entire Next.js tree including `<html>`). The root ChatProvider is a client component — it cannot receive async data directly from the root layout because root layout has no access to user session.

**Solution — "lift campusSlug into (main)/layout.tsx":**

The `(main)/layout.tsx` renders after the root layout. It is already an async server component. Replace the root layout's `<ChatProvider>` (no campusSlug) with a ChatProvider that accepts a campusSlug prop passed through a thin server→client bridge.

The cleanest implementation:
1. Keep `<ChatProvider>` in root layout with default empty string — it will be shadowed.
2. In `(main)/layout.tsx`, derive the campusSlug and mount a second `<ChatProvider campusSlug={slug}>` wrapping `{children}`. This follows the same innermost-wins pattern already working for the campus layout.
3. The Explore page (`/explore`) and Listing Detail (`/listing/[id]`) are both inside `(main)`, so they get the correct inner ChatProvider.

This requires zero changes to root `layout.tsx` and zero new abstractions.

**Campus slug derivation in `(main)/layout.tsx`:**
```typescript
// Source: existing pattern from (campus)/[campusSlug]/layout.tsx lines 25-29
const supabase = createServerComponentClient(cookieStore);
const { data: { user } } = await supabase.auth.getUser();

// 1. Try user metadata first (fastest — no extra DB hit)
const campusSlug =
  (user?.user_metadata?.campus_slug as string | undefined) ??
  await getDefaultCampusSlug(supabase);
```

**Fallback: first available campus from DB:**
```typescript
async function getDefaultCampusSlug(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from('campus_configs')
    .select('slug')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  return data?.slug ?? 'uw-madison'; // hardcoded last-resort only
}
```

**When to use:** Always for `(main)` routes (Explore, Listing Detail, Profile, Post).

### Pattern 2: Persist profile data in AuthForm.handleProfileComplete

**What:** Before calling `router.push`, call `supabase.auth.updateUser` with the profile data. The profile page already reads `user_metadata.full_name`, `user_metadata.university`, `user_metadata.graduation_year`.

**Critical detail:** `updateUser` is async. The function must `await` it and handle errors before navigating.

```typescript
// Source: Supabase JS docs — supabase.auth.updateUser
async function handleProfileComplete(profile: { firstName: string; university: string; graduationYear: string }) {
  setLoading(true);
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({
    data: {
      full_name: profile.firstName,
      university: profile.university,
      graduation_year: profile.graduationYear,
    },
  });

  if (error) {
    setError(error.message);
    setLoading(false);
    return;
  }

  const returnTo = searchParams.get('returnTo');
  const destination =
    returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
      ? returnTo
      : '/explore';
  router.push(destination);
}
```

**Key alignment with profile page:** `profile/page.tsx` reads:
- `meta.full_name` → map from `profile.firstName`
- `meta.university` → map from `profile.university`
- `meta.graduation_year` → map from `profile.graduationYear` (profile page accepts both snake_case and camelCase)

**When to use:** Called from `AuthForm.handleProfileComplete` — replaces the current stub.

### Anti-Patterns to Avoid

- **Do not convert root `layout.tsx` to async** — Next.js root layout wraps `<html>` and cannot be a Data Fetching async server component in the App Router in a straightforward way; (main)/layout is the correct insertion point.
- **Do not add a new `/api/` route to resolve campus slug** — unnecessary round-trip; the server component layout can query Supabase directly.
- **Do not modify ChatProvider to call updateUser** — ChatProvider manages chat state only; auth persistence belongs in AuthForm where the user session was just created.
- **Do not change the innermost-wins ChatProvider pattern** — campus layout already correctly mounts `<ChatProvider campusSlug={campusSlug}>` for campus routes; leave that untouched.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| User metadata persistence | Custom profiles table write in AuthForm | `supabase.auth.updateUser({ data: {...} })` | updateUser writes to raw_user_meta_data on the existing auth.users row; profile page already reads from user_metadata |
| Campus slug resolution | Custom middleware or edge function | Query inside (main)/layout.tsx server component | Layout is already an async server component with supabase client |
| React context nesting | New context system | Existing innermost-wins ChatProvider pattern | Already proven in campus layout; no new abstraction needed |

**Key insight:** Both fixes are additive — they fill in stubbed-out logic without changing any existing contracts.

## Common Pitfalls

### Pitfall 1: handleProfileComplete is synchronous — can't call async updateUser without making it async
**What goes wrong:** `handleProfileComplete` is currently a plain sync function. Adding `await supabase.auth.updateUser(...)` requires making it `async`. The `loading` state also needs to be set during the updateUser call.
**Why it happens:** The original stub was written as a placeholder; async concerns were deferred.
**How to avoid:** Make `handleProfileComplete` an `async` function (or `useCallback` async variant), set `setLoading(true)` before the call, clear it and `setError` on failure.
**Warning signs:** If `router.push` executes before `updateUser` resolves, the profile page will show stale data because the session cookie won't have refreshed yet.

### Pitfall 2: ChatProvider campusSlug is captured in useCallback closure
**What goes wrong:** `sendMessage` is wrapped in `useCallback([campusSlug])`. If the campusSlug prop changes after mount (re-render), the closure updates correctly because campusSlug is in the dependency array. This is already correctly implemented.
**Why it happens:** Stale closure bugs are common with useCallback.
**How to avoid:** Confirm `campusSlug` remains in the `useCallback` dependency array — it already is at line 124 of ChatProvider.tsx.

### Pitfall 3: Existing test "sends empty campusSlug when no prop provided" will need to be updated or preserved
**What goes wrong:** `ChatProvider.test.tsx` line 101-120 has a test that explicitly asserts `campusSlug === ''` when no prop is provided. This test is correct for the ChatProvider component in isolation — ChatProvider still defaults to `''`. The test does not need to change.
**Why it happens:** The fix lives in `(main)/layout.tsx` (always pass a real slug), not in ChatProvider itself.
**How to avoid:** Do not modify the existing ChatProvider tests. Add new tests for the campusSlug derivation logic separately.

### Pitfall 4: Supabase updateUser does not refresh the server-side session cookie immediately
**What goes wrong:** After `updateUser`, the browser session has updated `user_metadata`. However, the server-side Supabase client used in `profile/page.tsx` reads from the cookie store. The session cookie is refreshed automatically by the auth state change, but only on the next request.
**Why it happens:** Supabase SSR auth reads from cookies; updateUser flushes to the browser session which then propagates via cookie on next navigation.
**How to avoid:** `router.push('/explore')` triggers a new request. The profile page is at `/profile`, which the user visits after exploring — by that time the cookie is fresh. No additional action needed.

### Pitfall 5: AuthForm.handleProfileComplete mock in existing tests
**What goes wrong:** `AuthForm.redirect.test.tsx` mocks `ProfileSetup` and tests only redirect behavior. If `handleProfileComplete` becomes async and calls `supabase.auth.updateUser`, the test mock for `@campusnest/supabase/client` must include `updateUser` or the test will throw.
**Why it happens:** The existing mock only provides `signInWithOtp` and `verifyOtp`.
**How to avoid:** Add `updateUser: vi.fn().mockResolvedValue({ error: null })` to the existing Supabase client mock in `AuthForm.redirect.test.tsx`.

## Code Examples

Verified patterns from existing codebase:

### campusSlug derivation in server component (matches campus layout pattern)
```typescript
// Source: apps/web/app/(campus)/[campusSlug]/layout.tsx lines 23-29 (existing pattern)
const cookieStore = await cookies();
const supabase = createServerComponentClient(cookieStore);
const { data: { user } } = await supabase.auth.getUser();

// user?.user_metadata is typed as Record<string, unknown>
const campusSlugFromMeta = user?.user_metadata?.campus_slug as string | undefined;
```

### (main)/layout.tsx ChatProvider wrapper (new, follows campus layout's innermost-wins pattern)
```typescript
// Source: apps/web/app/(campus)/[campusSlug]/layout.tsx line 117 (model)
// In (main)/layout.tsx, after deriving campusSlug:
return (
  <ChatProvider campusSlug={campusSlug}>
    <ConciergeShell>
      {/* existing nav and children */}
    </ConciergeShell>
  </ChatProvider>
);
```

### supabase.auth.updateUser — field names matched to profile/page.tsx reads
```typescript
// Source: apps/web/app/(main)/profile/page.tsx lines 26-42 (what the profile page reads)
// meta.full_name, meta.university, meta.graduation_year

// AuthForm handleProfileComplete (new):
const { error } = await supabase.auth.updateUser({
  data: {
    full_name: profile.firstName,     // read as meta.full_name in profile/page.tsx
    university: profile.university,   // read as meta.university in profile/page.tsx
    graduation_year: profile.graduationYear, // read as meta.graduation_year in profile/page.tsx
  },
});
```

### Existing mock extension pattern for AuthForm tests
```typescript
// Source: apps/web/components/auth/__tests__/AuthForm.redirect.test.tsx lines 93-100
// Extend this mock to add updateUser:
vi.mock('@campusnest/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithOtp: mockSignInWithOtp,
      verifyOtp: mockVerifyOtp,
      updateUser: vi.fn().mockResolvedValue({ error: null }), // ADD THIS
    },
  }),
}));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 18: campusSlug hardcoded to 'uw-madison' | Phase 22: campusSlug prop injected from campus layout | Phase 22 | Campus routes work; flat routes (explore, listing) still broken |
| ProfileSetup data silently discarded | Phase 23: updateUser persists to user_metadata | Phase 23 (this phase) | Profile page shows real name and university after onboarding |

**Deprecated/outdated:**
- Root layout `<ChatProvider>` with no campusSlug: valid as outer shell (innermost-wins) but broken when used as the only ChatProvider for flat routes — Phase 23 adds a `(main)/layout.tsx` inner provider.
- `handleProfileComplete` stub with `// Profile data could be saved...` comment: replaced with real implementation in Phase 23.

## Open Questions

1. **Does user_metadata.campus_slug get set anywhere during sign-up?**
   - What we know: `AuthForm.handleProfileComplete` does not currently set campus_slug; the profile page does not either.
   - What's unclear: Is campus_slug expected to come from the email domain detection (university → campus mapping)?
   - Recommendation: The `detectUniversity` function in ProfileSetup maps email domains to university names (not slugs). For Phase 23, use the DB fallback (first campus_config by created_at) when metadata has no campus_slug. Add campus_slug to the updateUser call as a stretch goal if the email→slug mapping is trivial, but it is not required for the 404 fix.

2. **Should the ProfileSetup form collect campus_slug?**
   - What we know: ProfileSetup collects university name (string), not campus slug.
   - What's unclear: Whether a user should be able to select their campus or if it's auto-derived.
   - Recommendation: Out of scope for Phase 23. The DB fallback covers the immediate 404 bug. Campus selection can be added in a future profile settings enhancement.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + @testing-library/react |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `pnpm --filter web test --run` |
| Full suite command | `pnpm --filter web test --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXPL-04 | ChatProvider sends valid campusSlug (not empty string) when mounted from (main) layout | unit | `pnpm --filter web test --run -- ChatProvider` | ✅ (needs new test case in ChatProvider.test.tsx) |
| DETAIL-05 | MobileBottomBar Chat button opens AIChatPanel (depends on ChatProvider fix) | unit | `pnpm --filter web test --run -- MobileBottomBar` | ✅ (existing MobileBottomBar.test.tsx) |
| AUTH-05 | handleProfileComplete calls updateUser with firstName→full_name, university, graduationYear→graduation_year | unit | `pnpm --filter web test --run -- AuthForm` | ❌ Wave 0: new test file needed |

### Sampling Rate
- **Per task commit:** `pnpm --filter web test --run`
- **Per wave merge:** `pnpm --filter web test --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/web/components/auth/__tests__/AuthForm.persist.test.tsx` — covers AUTH-05 (updateUser called with correct metadata fields)
- [ ] Update `apps/web/components/auth/__tests__/AuthForm.redirect.test.tsx` — add `updateUser` to the existing Supabase client mock (otherwise existing tests will throw when handleProfileComplete becomes async)
- [ ] Add campusSlug derivation test to `apps/web/components/chat/__tests__/ChatProvider.test.tsx` (or a new layout test file) — covers EXPL-04 / DETAIL-05 path

## Sources

### Primary (HIGH confidence)
- `apps/web/app/layout.tsx` — Root layout; confirms `<ChatProvider>` has no campusSlug prop
- `apps/web/app/(campus)/[campusSlug]/layout.tsx` — Campus layout; proves innermost-wins pattern and correct ChatProvider usage
- `apps/web/components/chat/ChatProvider.tsx` — ChatProvider; confirms `campusSlug = ''` default and its use in the POST body
- `apps/web/app/api/ai/cribai/route.ts` — API route; confirms `campus_configs.eq('slug', '')` returns null → 404
- `apps/web/components/auth/AuthForm.tsx` lines 129-137 — Confirms handleProfileComplete discards profile arg
- `apps/web/app/(main)/profile/page.tsx` lines 26-42 — Confirms field names the profile page reads from user_metadata
- `apps/web/app/(main)/layout.tsx` — (main) layout; confirms it is async server component with Supabase client access
- `packages/supabase/src/server.ts` — Confirms `createServerComponentClient` API
- `packages/supabase/src/client.ts` — Confirms browser `createClient` used in AuthForm

### Secondary (MEDIUM confidence)
- Supabase `auth.updateUser` API: standard method for updating user_metadata from the browser client; consistent with @supabase/supabase-js docs (pattern used throughout the v1.0 codebase)

### Tertiary (LOW confidence)
- Assumption that `user_metadata.campus_slug` is not currently set by any other flow — needs confirmation by inspecting sign-up flows, but no evidence found of campus_slug being written anywhere.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed, patterns directly readable in codebase
- Architecture: HIGH — innermost-wins ChatProvider pattern already proven in campus layout; updateUser field names verified against profile/page.tsx reads
- Pitfalls: HIGH — all pitfalls derived from direct code inspection, not speculation

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable — Next.js App Router + Supabase Auth API stable)
