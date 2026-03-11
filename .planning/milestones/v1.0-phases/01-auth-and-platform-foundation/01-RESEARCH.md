# Phase 1: Auth and Platform Foundation - Research

**Researched:** 2026-03-05
**Domain:** Supabase Auth (magic link OTP) + Next.js 15 App Router + Profile management + Responsive design
**Confidence:** HIGH

## Summary

Phase 1 is primarily a fix-and-extend phase on existing code rather than greenfield development. The magic link auth flow exists but has a known redirect bug in the callback route, there are duplicate callback routes that need consolidation, and .edu email validation is missing from the login form. The profile system has a database table with auto-creation trigger but lacks student-specific fields (avatar, graduation_year, major) and has no settings page for editing.

The existing codebase uses `@supabase/ssr@0.5.2` with `@supabase/supabase-js@2.98.0` and Next.js 15 (installed as 15.5.12). The auth patterns are established -- cookie-based session handling in middleware, server components, and client components -- so this phase should follow those patterns rather than introduce new ones.

**Primary recommendation:** Fix the callback redirect bug by consolidating to a single `/auth/callback` route using `new URL()` construction, add client-side .edu validation to the login form, create a profile migration for student fields, and build a `/settings/profile` page. Keep changes minimal and surgical.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Block non-.edu emails immediately with inline validation error before sending magic link ("CampusNest requires a .edu email")
- Expired/used magic links: redirect to login page with toast notification explaining the issue + prompt to request a new link
- Fix the existing broken redirect in the callback route (currently redirects incorrectly after clicking magic link)
- After first successful auth: show a modal overlay on the campus page with "Complete your profile" and a visible skip button
- A persistent settings/profile page must exist at `/settings/profile` (or similar) for later editing
- Profile fields (student context): display name, avatar (upload or initials), university, graduation year, major
- Profile creation is optional -- skip button dismisses modal, user can complete later from settings
- Chat-first: CribAI chat is the primary interface on the campus page -- "What are you looking for?"
- Separate dashboard page exists with: personal appointments, recently viewed listings, saved items
- UW Madison is the default/primary campus
- UI must be usable on mobile browsers
- Chat-first layout needs to work well on small screens

### Claude's Discretion
- Exact toast notification library/approach
- Mobile layout breakpoints and responsive patterns
- Auth middleware implementation details
- Session refresh strategy

### Deferred Ideas (OUT OF SCOPE)
- Dashboard with appointments/recently viewed/saved items -- partially Phase 1 (page structure) but saved listings functionality is Phase 4
- AI answering questions about dashboard data -- depends on chat persistence (Phase 6) and saved listings (Phase 4)
- Facebook Marketplace sublease scraping -- noted for future milestone
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | User can sign in via magic link email and land on authenticated experience without redirect errors | Callback route bug identified -- duplicate routes at `(auth)/callback` and `auth/callback`, the `(auth)` version uses unsafe string concatenation for redirect URL. Consolidation plan documented. |
| AUTH-02 | User session persists across browser refresh and tab close/reopen | Already works via `@supabase/ssr` cookie handling + middleware session refresh. Verify middleware calls `getUser()` on every request (it does). |
| AUTH-03 | System validates that user email is a .edu address at signup (client-side check) | Login page has no validation currently. Add regex check before `signInWithOtp()` call. Pattern: `/\.edu$/i` on email domain. |
| AUTH-04 | User can optionally create a profile with skip button at signup | Profile auto-created by DB trigger on signup (empty fields). Need: modal component, profile form, skip logic via localStorage/cookie flag, student fields migration. |
| AUTH-05 | User can edit profile from a settings/profile page at any time | No settings page exists. Build at `/settings/profile` with same form as modal, reading/writing to `profiles` table via RLS. |
| PLAT-01 | Platform launches with UW Madison as the primary campus | `campus_configs` table exists. Need seed data for UW Madison (slug: `uw-madison`, edu_domains: `['wisc.edu']`). Root page should redirect to `/uw-madison/cribai`. |
| PLAT-02 | Platform architecture supports 3-5 campuses | Multi-tenancy already works via `[campusSlug]` routing + campus context + RLS policies. No changes needed -- verify existing patterns. |
| PLAT-03 | Responsive design works on mobile browsers | Existing layout uses fixed max-width container. Nav needs hamburger menu on mobile. Chat UI needs mobile-friendly height/scroll. |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/ssr` | 0.5.2 | Cookie-based auth for SSR | Official Supabase package for Next.js App Router |
| `@supabase/supabase-js` | 2.98.0 | Supabase client (auth, DB, storage) | Core platform SDK |
| `next` | 15.5.12 | App Router framework | Already in use, Turbopack dev |
| `tailwindcss` | 4.x | Styling with CSS variables | Already in use with design tokens |
| `zod` | (in packages/types) | Schema validation | Already used for profile types |

### Supporting (To Add)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sonner` | latest | Toast notifications | Expired magic link errors, profile save confirmations |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `sonner` | `react-hot-toast` | Sonner has better defaults, animation, and App Router support; smaller bundle |
| `sonner` | Custom toast | Unnecessary complexity for a solved problem |

**Installation:**
```bash
pnpm add sonner --filter @campusnest/web
```

## Architecture Patterns

### Current Project Structure (Relevant Files)
```
apps/web/
├── app/
│   ├── (auth)/
│   │   ├── callback/route.ts    # BROKEN -- redirect bug, to be removed
│   │   └── login/page.tsx       # Needs .edu validation
│   ├── auth/
│   │   ├── callback/route.ts    # Working version -- consolidate here
│   │   └── confirm/route.ts     # Token hash only route -- may merge
│   ├── (campus)/
│   │   └── [campusSlug]/
│   │       ├── layout.tsx       # Campus layout with nav
│   │       ├── cribai/page.tsx  # Chat page -- becomes landing focus
│   │       └── listings/        # Existing listings pages
│   ├── settings/
│   │   └── profile/
│   │       └── page.tsx         # NEW -- profile edit page
│   └── layout.tsx               # Root layout
├── components/
│   ├── auth-nav.tsx             # Existing -- extend with profile link
│   ├── profile-modal.tsx        # NEW -- first-login profile prompt
│   └── profile-form.tsx         # NEW -- shared form for modal + settings
├── middleware.ts                 # Auth guard + session refresh
└── lib/
    └── campus-context.tsx       # Existing campus provider
```

### Pattern 1: Supabase Auth Callback (PKCE Flow)
**What:** Magic link emails contain a `code` parameter. The callback route exchanges this code for a session and sets cookies.
**When to use:** All magic link auth flows in Next.js App Router.
**Critical detail:** The response object with cookies MUST be created before the Supabase client, because `setAll` writes cookies to that response. Creating the redirect response first, then passing it to the cookie handler, is the correct pattern.
**Example:**
```typescript
// Source: Existing auth/callback/route.ts (the working version)
const redirectTo = new URL(next, origin);  // Safe URL construction
const response = NextResponse.redirect(redirectTo);

const supabase = createServerClient(url, key, {
  cookies: {
    getAll() { return request.cookies.getAll(); },
    setAll(cookiesToSet) {
      for (const { name, value, options } of cookiesToSet) {
        response.cookies.set(name, value, options);  // Writes to redirect response
      }
    },
  },
});

// Exchange code for session -- cookies get set on the response
const { error } = await supabase.auth.exchangeCodeForSession(code);
```

### Pattern 2: Middleware Session Refresh
**What:** Middleware creates a Supabase client on every request to refresh the session token via `getUser()`. This keeps the session alive across tabs/refreshes.
**When to use:** Already implemented in `middleware.ts`. No changes needed for AUTH-02.
**Key detail:** The middleware matcher excludes static assets. The `getUser()` call refreshes the JWT if expired, and the new tokens are written to the response cookies via `setAll`.

### Pattern 3: Client-Side Validation Before Server Call
**What:** Validate inputs on the client before making Supabase API calls to provide instant feedback.
**When to use:** .edu email validation on login form.
**Example:**
```typescript
function isEduEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return domain.endsWith('.edu');
}

// In form submit handler, BEFORE signInWithOtp:
if (!isEduEmail(email)) {
  setError('CampusNest requires a .edu email address');
  return;
}
```

### Pattern 4: Profile Completion Detection
**What:** After auth callback, check if the user's profile is incomplete. Use a flag to show a one-time modal.
**When to use:** First login experience (AUTH-04).
**Example:**
```typescript
// In campus layout (server component):
const { data: profile } = await supabase
  .from('profiles')
  .select('display_name, avatar_url, graduation_year')
  .eq('id', user.id)
  .single();

const isProfileIncomplete = !profile?.display_name;
// Pass to client component that renders modal
```

### Anti-Patterns to Avoid
- **String concatenation for redirect URLs:** Use `new URL(path, origin)` instead of template literals. The `(auth)/callback` route has this bug.
- **Multiple callback routes:** Consolidate to a single route. Having both `(auth)/callback` and `auth/callback` causes confusion about which handles the redirect.
- **Checking `getSession()` instead of `getUser()`:** `getSession()` only reads the local JWT without server verification. Always use `getUser()` for security-sensitive checks (already correct in middleware).
- **Avatar file uploads without size limits:** If implementing avatar uploads to Supabase Storage, enforce max file size (2MB) and allowed types (image/jpeg, image/png, image/webp) on both client and storage policy.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Toast notifications | Custom toast system | `sonner` | Accessible, animated, stacking, auto-dismiss -- complex to get right |
| Session management | Custom cookie/JWT handling | `@supabase/ssr` cookie adapter | Already handles chunking large JWTs, refresh tokens, PKCE |
| Email validation regex | Complex RFC 5322 regex | Simple `.edu` domain suffix check | Only need to verify domain ends with `.edu`, not full email validity (browser handles that via `type="email"`) |
| Avatar storage | Custom file upload server | Supabase Storage with signed URLs | Built-in CDN, RLS policies, image transforms |
| Form state management | Custom form reducer | React `useState` + Zod validation | Profile form is simple (5 fields), no need for form libraries |

**Key insight:** This phase is about fixing existing code and adding small features. Resist the urge to add complex libraries for simple problems.

## Common Pitfalls

### Pitfall 1: Redirect URL Mismatch in Supabase Dashboard
**What goes wrong:** Magic link emails point to a URL not listed in Supabase Auth redirect allow list. User clicks link, gets an error.
**Why it happens:** Supabase validates the `emailRedirectTo` URL against the configured redirect URLs in the dashboard.
**How to avoid:** Ensure `http://localhost:3000/auth/callback` and the production URL are in Supabase Dashboard > Authentication > URL Configuration > Redirect URLs.
**Warning signs:** Auth works locally but fails in preview/production deployments.

### Pitfall 2: Cookie Not Set on Redirect Response
**What goes wrong:** User clicks magic link, gets redirected, but is not logged in. Session cookie was not persisted.
**Why it happens:** Creating the Supabase client with a response object, then creating a different response for the redirect. Cookies written to the first response are lost.
**How to avoid:** Create the redirect response FIRST, then pass it to the Supabase client's `setAll` handler. The existing `auth/callback/route.ts` does this correctly.
**Warning signs:** Callback redirects to the right page, but user appears logged out.

### Pitfall 3: Two Callback Routes Causing Confusion
**What goes wrong:** The login page sends users to `/callback` (maps to `(auth)/callback`), but `auth/callback` is a separate route. They handle the flow differently.
**Why it happens:** Next.js route groups `(auth)` strip the group prefix from the URL. So `(auth)/callback/route.ts` serves `/callback`. Meanwhile `auth/callback/route.ts` serves `/auth/callback`.
**How to avoid:** Delete `(auth)/callback/route.ts` entirely. Update `emailRedirectTo` in the login page to point to `/auth/callback`. Consolidate all callback logic into `auth/callback/route.ts`.
**Warning signs:** Inconsistent auth behavior depending on which URL the email template uses.

### Pitfall 4: Profile Modal Showing on Every Page Load
**What goes wrong:** The "complete your profile" modal appears every time the user navigates, not just on first login.
**Why it happens:** Checking `!profile.display_name` on every server render without dismissal tracking.
**How to avoid:** After user skips or completes the modal, set a `profile_prompted` flag -- either as a column on the profiles table (server-persisted) or a localStorage key (client-side). Check this flag before showing the modal.
**Warning signs:** Users report seeing the profile prompt repeatedly after dismissing it.

### Pitfall 5: Mobile Nav Overlapping Chat Input
**What goes wrong:** On mobile, the sticky nav and chat input area compete for screen real estate, making the chat unusable.
**Why it happens:** Sticky header + fixed bottom input + dynamic viewport height on mobile browsers (URL bar showing/hiding).
**How to avoid:** Use `dvh` (dynamic viewport height) units for the chat container. Make the nav collapsible on mobile. Test on actual mobile devices or Chrome DevTools with "Pixel 5" device emulation.
**Warning signs:** Chat input is hidden behind the keyboard or beneath the nav on small screens.

## Code Examples

### Consolidating the Auth Callback Route
```typescript
// Source: Based on existing auth/callback/route.ts (the working pattern)
// Location: apps/web/app/auth/callback/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as 'magiclink' | 'email' | null;
  const error_code = searchParams.get('error_code');

  // Handle expired/invalid links
  if (error_code) {
    const errorUrl = new URL('/login', origin);
    errorUrl.searchParams.set('error', error_code);
    return NextResponse.redirect(errorUrl);
  }

  if (!code && !tokenHash) {
    const errorUrl = new URL('/login', origin);
    errorUrl.searchParams.set('error', 'missing_code');
    return NextResponse.redirect(errorUrl);
  }

  const lastCampus = request.cookies.get('last_campus')?.value;
  const next = searchParams.get('next')
    ?? (lastCampus ? `/${lastCampus}/cribai` : '/uw-madison/cribai');

  // ... standard Supabase cookie setup + exchangeCodeForSession
}
```

### .edu Email Validation
```typescript
// Source: Project-specific implementation
// Location: apps/web/app/(auth)/login/page.tsx (add to existing)
function isEduEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return domain.endsWith('.edu');
}

// In handleSubmit, before signInWithOtp:
if (!isEduEmail(email)) {
  setError('CampusNest requires a .edu email address');
  setLoading(false);
  return;
}
```

### Profile Schema Migration (student context fields)
```sql
-- Source: Extension of existing 001_initial_schema.sql profiles table
-- Location: supabase/migrations/003_profile_student_fields.sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS graduation_year smallint
    CHECK (graduation_year BETWEEN 2020 AND 2035),
  ADD COLUMN IF NOT EXISTS major text,
  ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz;
```

### Updated Zod Profile Schema
```typescript
// Source: Extending existing packages/types/src/profile.ts
export const profileSchema = z.object({
  id: z.string().uuid(),
  campusId: z.string().uuid().nullable(),
  displayName: z.string().min(1).max(100).nullable(),
  avatarUrl: z.string().url().nullable().default(null),
  eduEmail: z.string().email().nullable(),
  isEduVerified: z.boolean().default(false),
  verificationStatus: verificationStatusSchema.default('unverified'),
  graduationYear: z.number().int().min(2020).max(2035).nullable().default(null),
  major: z.string().max(200).nullable().default(null),
  subscriptionTier: subscriptionTierSchema.default('free'),
  profileCompletedAt: z.string().datetime().nullable().default(null),
  createdAt: z.string().datetime().optional(),
});
```

### Toast Setup with Sonner
```typescript
// Source: sonner docs
// In root layout.tsx:
import { Toaster } from 'sonner';

// Inside <body>:
<Toaster position="top-center" richColors />

// Usage in login page for error params:
import { toast } from 'sonner';

useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  if (error === 'auth_failed') {
    toast.error('Your magic link has expired or was already used. Please request a new one.');
  }
}, []);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `getSession()` for auth checks | `getUser()` for server-side verification | Supabase SSR 0.4+ | `getUser()` verifies JWT with Supabase server, preventing spoofed tokens |
| `createMiddlewareClient` | `createServerClient` with cookie adapter | `@supabase/ssr` 0.5+ | Unified API for all server contexts |
| `100vh` for mobile layouts | `100dvh` (dynamic viewport height) | 2023+ browser support | Handles mobile browser URL bar correctly |

**Deprecated/outdated:**
- `@supabase/auth-helpers-nextjs`: Replaced by `@supabase/ssr`. This project already uses the correct package.
- `getSession()` for security checks: Returns unverified JWT. Use `getUser()` which makes a server call.

## Open Questions

1. **Avatar upload: Supabase Storage or initials-only for Phase 1?**
   - What we know: CONTEXT.md says "upload or initials". Storage bucket setup and RLS policies add complexity.
   - What's unclear: Whether avatar upload is truly needed for Phase 1 or if initials-based avatars suffice.
   - Recommendation: Implement initials-based avatars as default, add upload as a stretch goal within this phase. Keep the `avatar_url` column ready either way.

2. **UW Madison seed data -- where to create it?**
   - What we know: `campus_configs` table exists, needs a row for UW Madison.
   - What's unclear: Whether to use a SQL migration or a Supabase seed file.
   - Recommendation: Use a migration (`003_...` or combined with profile fields migration) to insert the seed data. This ensures it exists in all environments.

3. **Dashboard page structure for Phase 1**
   - What we know: CONTEXT.md says dashboard exists with appointments/recently viewed/saved. But saved items is Phase 4.
   - Recommendation: Create a dashboard page shell at `/{campusSlug}/dashboard` with placeholder sections. Actual data population deferred to later phases.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (packages) + Playwright (e2e) |
| Config file | `packages/utils/vitest.config.ts` (exists), `apps/web/playwright.config.ts` (exists) |
| Quick run command | `pnpm --filter @campusnest/web test` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Magic link callback sets session and redirects without error | e2e | `pnpm --filter @campusnest/web exec playwright test tests/e2e/auth-callback.spec.ts` | No -- Wave 0 |
| AUTH-02 | Session persists across browser refresh | e2e | `pnpm --filter @campusnest/web exec playwright test tests/e2e/session-persistence.spec.ts` | No -- Wave 0 |
| AUTH-03 | Non-.edu email shows validation error | unit + e2e | `pnpm --filter @campusnest/web exec vitest run src/lib/__tests__/edu-validation.test.ts` | No -- Wave 0 |
| AUTH-04 | Profile modal appears on first login, skip works | e2e | `pnpm --filter @campusnest/web exec playwright test tests/e2e/profile-modal.spec.ts` | No -- Wave 0 |
| AUTH-05 | Profile can be edited from settings page | e2e | `pnpm --filter @campusnest/web exec playwright test tests/e2e/profile-settings.spec.ts` | No -- Wave 0 |
| PLAT-01 | UW Madison is default campus | e2e | `pnpm --filter @campusnest/web exec playwright test tests/e2e/campus-default.spec.ts` | No -- Wave 0 |
| PLAT-02 | Multi-campus architecture works | unit | Existing campus context tests (verify) | Verify |
| PLAT-03 | Responsive design on mobile | e2e | `pnpm --filter @campusnest/web exec playwright test tests/e2e/responsive.spec.ts` (uses mobile-chrome project) | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @campusnest/web typecheck && pnpm --filter @campusnest/web build`
- **Per wave merge:** `pnpm test && pnpm --filter @campusnest/web exec playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/web/vitest.config.ts` -- needed for unit testing web app code (edu validation utility)
- [ ] `apps/web/src/lib/__tests__/edu-validation.test.ts` -- unit test for .edu check
- [ ] `apps/web/tests/e2e/auth-callback.spec.ts` -- e2e for magic link flow
- [ ] `apps/web/tests/e2e/profile-modal.spec.ts` -- e2e for profile completion flow
- [ ] `apps/web/tests/e2e/profile-settings.spec.ts` -- e2e for settings page
- [ ] `apps/web/tests/e2e/responsive.spec.ts` -- e2e using mobile-chrome project
- [ ] Playwright may need `@playwright/test` added to devDependencies

## Sources

### Primary (HIGH confidence)
- Existing codebase analysis -- all code files read directly from repository
- `@supabase/ssr@0.5.2` -- installed version verified via pnpm store
- `@supabase/supabase-js@2.98.0` -- installed version verified
- Next.js 15.5.12 -- installed version verified
- Supabase Auth PKCE flow -- verified from existing working callback route implementation

### Secondary (MEDIUM confidence)
- Sonner toast library recommendation -- widely used with Next.js App Router, verified as actively maintained
- `dvh` viewport units for mobile -- standard CSS unit with broad browser support since 2023

### Tertiary (LOW confidence)
- None -- all findings based on direct codebase analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and verified
- Architecture: HIGH - patterns derived from existing working code
- Pitfalls: HIGH - bugs identified by direct code reading (duplicate routes, string concatenation redirect)
- Validation: MEDIUM - Playwright config exists but no auth-specific tests yet

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable stack, no fast-moving dependencies)
