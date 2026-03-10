# Phase 9: V1 Integration Polish + Documentation Cleanup - Research

**Researched:** 2026-03-10
**Domain:** Next.js API routes, Next.js middleware, Supabase migration, Zod schema updates, documentation cleanup
**Confidence:** HIGH

## Summary

Phase 9 closes three non-critical integration gaps (INT-01, INT-02, INT-03) identified in the v1.0 milestone audit, plus a documentation inconsistency in ROADMAP.md. All affected requirements (DATA-03, CHAT-01, AUTH-02) are already marked satisfied — this phase removes silent failure modes and defence-in-depth weaknesses, not broken features.

Each gap is a targeted, low-risk change. INT-01 (contact_email) requires a decision: add a DB migration to persist the field, or remove it from the form. INT-02 (GET /api/conversations/[id] missing dev auth) requires adding the same dev-auth bypass already present in the sibling POST handler and in conversations/route.ts. INT-03 (middleware route coverage) requires adding regex patterns for four additional campus routes to the existing middleware auth check. The documentation task is a pure text edit to ROADMAP.md.

**Primary recommendation:** Resolve INT-01 by adding a `contact_email` column to the `listings` table via a new migration and wiring it through the API route. This preserves the submitted data and is consistent with the form's existing Zod validation. Removing the field is also acceptable but loses user intent data.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js (App Router) | 15 | API route handlers and middleware | Already in use throughout |
| Supabase | existing | PostgreSQL DB, service-role client | Already in use throughout |
| Zod | 3.x | Schema validation (`listingSubmissionSchema`) | Already in use in form + API route |
| `@campusnest/supabase` | workspace | Server-side Supabase client helpers | Already in use in all API routes |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lib/dev-auth` | internal | Dev bypass auth helpers | For all API routes needing dev mode support |
| `next/navigation` `redirect` | 15 | Page-level auth redirect | Already used by all campus pages |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New DB migration for contact_email | Store in raw_data JSONB | Migration is cleaner, queryable, schema-explicit — preferred |
| New DB migration for contact_email | Remove field from form | Simpler but loses submitted contact data |

**Installation:** No new packages needed.

## Architecture Patterns

### INT-01: contact_email Gap

**Root cause:** `listingSubmissionSchema` includes `contact_email: z.string().email()`. The form collects it and sends it in the payload. The API route in `apps/web/app/api/submit-listing/route.ts` destructures `parsed.data` but does NOT include `contact_email` in the fields extracted (lines 55-65). It is silently dropped from the INSERT.

**Fix path A — Add DB column + wire through API (recommended):**

1. Create migration `011_add_contact_email_to_listings.sql`:
   ```sql
   ALTER TABLE listings ADD COLUMN IF NOT EXISTS contact_email text;
   ```
2. In `apps/web/app/api/submit-listing/route.ts`, destructure `contact_email` from `parsed.data` and include it in the INSERT object.

**Fix path B — Remove field entirely:**

1. Remove `contact_email` field from `listingSubmissionSchema` in `packages/types/src/listing.ts`
2. Remove the field from `INITIAL_FORM`, the JSX input block, and the payload construction in `apps/web/components/submit-listing-form.tsx`
3. No migration needed.

**Decision criteria:** If contact_email data has value (future PM outreach, spam detection), go with path A. If it was premature, go with path B. Path A preserves optionality.

### INT-02: GET /api/conversations/[id] Missing Dev Auth

**Root cause:** `apps/web/app/api/conversations/[id]/route.ts` calls `supabase.auth.getUser()` directly and returns 401 if no user. The sibling POST handler (`messages/route.ts`) and the listing endpoint (`conversations/route.ts`) both handle `isDevAuthEnabled()` with a service-role client.

**Pattern to replicate** (from `apps/web/app/api/conversations/[id]/messages/route.ts`):

```typescript
// At the top of the GET handler in route.ts:
import { isDevAuthEnabled, getDevUserById, DEFAULT_DEV_USER, DEV_USER_COOKIE } from '../../../../lib/dev-auth';
import { createSecretClient } from '@campusnest/supabase/server';

// Inside GET handler, replace the direct getUser() block:
let userId: string;
const cookieStore = await cookies();

if (isDevAuthEnabled()) {
  const selectedId = cookieStore.get(DEV_USER_COOKIE)?.value;
  const devUser = selectedId ? getDevUserById(selectedId) : DEFAULT_DEV_USER;
  userId = devUser?.id ?? DEFAULT_DEV_USER.id;
} else {
  const supabase = createServerComponentClient(cookieStore);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  userId = user.id;
}

// Use service-role client in dev mode to bypass RLS:
const queryClient = isDevAuthEnabled() ? createSecretClient() : createServerComponentClient(cookieStore);
```

Note: The import path depth from `apps/web/app/api/conversations/[id]/route.ts` to `lib/dev-auth` is 4 levels (`../../../../lib/dev-auth`). The messages/route.ts used 5 levels (`../../../../../lib/dev-auth`) because it lives one deeper.

The RLS ownership check for conversations uses `.eq('id', id)` which in dev mode requires the service-role client because the dev user UUID is not a real auth.users row.

### INT-03: Middleware Route Coverage

**Root cause:** `apps/web/middleware.ts` only matches and redirects `/*/cribai` routes (line 107). Routes `/*/dashboard`, `/*/saved`, `/*/notifications`, `/*/submit-listing` use page-level `redirect('/login')` guards only.

**Current check** (line 97-112 in middleware.ts):
```typescript
const campusMatch = pathname.match(/^\/([^/]+)\/cribai/);
// ...
if (campusMatch && !user) {
  // redirect to login
}
```

**Fix:** Add a broader protected-routes match alongside the existing cribai-specific one:

```typescript
// Protected campus routes — redirect to login if not authenticated
const protectedRouteMatch = pathname.match(
  /^\/([^/]+)\/(cribai|dashboard|saved|notifications|submit-listing)/
);
if (protectedRouteMatch && !user) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}
```

This replaces the current narrow `campusMatch` check for redirect purposes while keeping the `campusMatch` regex for cookie-setting (only cribai pages need last_campus cookie).

The dev auth path already returns early before any route protection checks, so dev mode is unaffected.

**Severity note:** INT-03 is rated "info" — the page-level guards are already working. Middleware protection is defence-in-depth (avoids a server-side render before redirect) and is the correct Next.js pattern. The risk of adding it wrong is a redirect loop, so test the regex carefully.

### INT-04: ROADMAP.md Stale Checkmarks

**Root cause:** The audit noted Phase 5 plan checkmarks for 05-04 and 05-05 are unchecked despite being executed. This is a pure documentation edit.

**Current state in ROADMAP.md** (lines ~104-107):
```markdown
- [x] 05-01-PLAN.md — ...
- [x] 05-02-PLAN.md — ...
- [x] 05-03-PLAN.md — ...
- [x] 05-04-PLAN.md — ...  ← check if these are actually unchecked
- [x] 05-05-PLAN.md — ...
```

**Fix:** Read the current ROADMAP.md checkmark state for 05-04, 05-05 and change `[ ]` to `[x]` if they are unchecked. Confirm the Phase 9 entry is also updated to reflect progress as plans complete.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dev auth resolution in API route | Custom cookie parsing | `isDevAuthEnabled()`, `getDevUserById()`, `DEFAULT_DEV_USER` from `lib/dev-auth` | Already established pattern — used in messages/route.ts, conversations/route.ts, all other dev-aware API routes |
| Bypassing RLS for dev user | Custom service client | `createSecretClient()` from `@campusnest/supabase/server` | Service-role client already used everywhere RLS bypass is needed in dev mode |
| DB schema change | JSONB raw_data storage | Proper `ALTER TABLE ... ADD COLUMN` migration | Schema-explicit, queryable, consistent with rest of codebase |

**Key insight:** Every pattern needed for Phase 9 already exists in the codebase. This phase is about applying established patterns to the two remaining API routes that don't yet have them, expanding a regex in middleware, and editing markdown.

## Common Pitfalls

### Pitfall 1: Import Path Depth for dev-auth

**What goes wrong:** The relative import path to `lib/dev-auth` varies by file depth. Getting it wrong causes a module-not-found error at runtime.

**Why it happens:** Next.js API routes live at varying depths under `app/api/`. The `lib/` directory is at `apps/web/lib/`.

**How to avoid:** Count directory levels from the route file's location to `apps/web/`:
- `apps/web/app/api/conversations/[id]/route.ts` → 4 levels up = `../../../../lib/dev-auth`
- `apps/web/app/api/conversations/[id]/messages/route.ts` → 5 levels up (confirmed in STATE.md decision log)

**Warning signs:** TypeScript will fail to resolve the module if the path is wrong — caught at build time.

### Pitfall 2: Middleware Regex Redirect Loop

**What goes wrong:** An overly broad middleware redirect pattern catches the `/login` page itself, causing an infinite redirect loop.

**Why it happens:** Middleware runs on every request matching the `config.matcher`. If the regex accidentally matches `/login` and redirects to `/login`, the browser loops.

**How to avoid:** The protected routes regex `^\/([^/]+)\/(cribai|dashboard|saved|notifications|submit-listing)` only matches paths with a campus slug prefix. `/login` does not match because it has no slug segment. Verify with a quick mental test: does `/login` match `^\/([^/]+)\/...`? No, because `/login` has only one path segment.

**Warning signs:** Browser shows "Too many redirects" error after deploying middleware change.

### Pitfall 3: RLS Failure for Dev User in Conversation Query

**What goes wrong:** When using `createServerComponentClient` in dev mode, a `.eq('id', conversationId)` query on `conversations` returns nothing (RLS filters by `user_id` = authenticated user, but dev user UUID is not a real auth row).

**Why it happens:** Supabase RLS policies on `conversations` require the authenticated user to own the row. The dev user's UUID exists in seed data but not in `auth.users`.

**How to avoid:** Use `createSecretClient()` (service role) for all DB queries in dev mode, exactly as the messages POST handler does.

**Warning signs:** 404 "Conversation not found" in dev mode even when the conversation exists in the DB.

### Pitfall 4: contact_email Migration Idempotency

**What goes wrong:** Running a migration that uses `ADD COLUMN` without `IF NOT EXISTS` will fail if the column already exists (e.g., re-running migrations in a fresh environment).

**Why it happens:** Supabase migration runner may re-apply in some CI scenarios.

**How to avoid:** Always use `ALTER TABLE listings ADD COLUMN IF NOT EXISTS contact_email text;`

### Pitfall 5: listingSubmissionSchema Zod Validation Already Requires contact_email

**What goes wrong:** If the fix path is to remove `contact_email`, removing it only from the API route INSERT but leaving it in the Zod schema causes the client to still validate and require it, while the API silently ignores it.

**Why it happens:** The schema and the API route are in different packages — `packages/types/src/listing.ts` vs `apps/web/app/api/submit-listing/route.ts`.

**How to avoid:** If removing the field, remove it from both the Zod schema AND the form component AND the API route together in the same plan step. The schema also drives client-side validation in `submit-listing-form.tsx`.

## Code Examples

Verified patterns from existing codebase:

### Dev Auth in API Route (from messages/route.ts)
```typescript
// Source: apps/web/app/api/conversations/[id]/messages/route.ts
import { isDevAuthEnabled, getDevUserById, DEFAULT_DEV_USER, DEV_USER_COOKIE } from '../../../../../lib/dev-auth';

let userId: string | null = null;
if (isDevAuthEnabled()) {
  const selectedId = cookieStore.get(DEV_USER_COOKIE)?.value;
  const devUser = selectedId ? getDevUserById(selectedId) : DEFAULT_DEV_USER;
  userId = devUser?.id ?? DEFAULT_DEV_USER.id;
} else {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  userId = user.id;
}

// Use service-role client for DB writes in dev mode (bypasses RLS for fake dev user)
const writeClient = isDevAuthEnabled() ? createSecretClient() : supabase;
```

### Protected Route Middleware (current cribai pattern)
```typescript
// Source: apps/web/middleware.ts lines 97-112
const campusMatch = pathname.match(/^\/([^/]+)\/cribai/);
if (campusMatch?.[1]) {
  response.cookies.set('last_campus', campusMatch[1], { ... });
}
if (campusMatch && !user) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}
```

### Supabase Migration Column Addition (consistent pattern)
```sql
-- Source: supabase/migrations/ conventions
ALTER TABLE listings ADD COLUMN IF NOT EXISTS contact_email text;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Page-only auth guards | Page guards + middleware protection | Phase 9 | Defence-in-depth, avoids server render before redirect |
| contact_email silently dropped | contact_email persisted to DB | Phase 9 | No silent data loss on form submission |
| GET conversations/[id] broken in dev | Full dev auth support on GET | Phase 9 | Conversation sidebar reload works in dev mode |

## Open Questions

1. **contact_email: persist or remove?**
   - What we know: Field is currently collected, validated, but dropped. No DB column exists. No migration references contact_email in any of migrations 001-010.
   - What's unclear: Whether contact_email will be used in any v2 feature (PM outreach, spam detection).
   - Recommendation: Add the column (path A). Cost is one small migration. If the field is never used in v2, the column is harmless. If it is needed, the data is there.

2. **Does middleware change need integration testing?**
   - What we know: No unit tests exist for middleware.ts. E2E tests cover auth flows.
   - What's unclear: Whether the existing E2E auth.spec.ts covers redirect behavior for the newly protected routes.
   - Recommendation: Manual smoke test in dev mode after middleware change. The regex is simple enough to verify by inspection.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (apps/web vitest.config.ts) |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `pnpm --filter @campusnest/web test` |
| Full suite command | `pnpm test` (all packages via Turborepo) |

### Phase Requirements → Test Map

Phase 9 has no formal requirement IDs. The four success criteria map to:

| Success Criteria | Behavior | Test Type | Automated Command | File Exists? |
|------------------|----------|-----------|-------------------|-------------|
| contact_email persisted or removed | No silent data loss on submit-listing | Manual smoke test (API route has no unit tests) | n/a — manual | N/A |
| GET /api/conversations/[id] works in dev | Dev auth bypass returns 200 | Manual smoke (API route has no unit tests) | n/a — manual | N/A |
| Middleware protects campus routes | Unauthenticated redirect works | Manual smoke + existing E2E | `npx playwright test --project=chromium auth.spec.ts` | ✅ |
| ROADMAP.md no stale checkmarks | Documentation accuracy | Visual inspection | n/a — manual | N/A |

### Sampling Rate
- **Per task commit:** `pnpm --filter @campusnest/web test` (unit tests in apps/web)
- **Per wave merge:** `pnpm test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

No new test files are required — Phase 9 fixes are in API routes and middleware where the project has no unit test coverage (documented gap in TESTING.md). The changes are verified by manual smoke testing and the existing Playwright E2E suite for auth redirects.

None — existing test infrastructure covers the testable surface of this phase.

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `apps/web/app/api/conversations/[id]/route.ts` — confirmed missing dev auth
- Direct code inspection: `apps/web/app/api/conversations/[id]/messages/route.ts` — confirmed dev auth pattern to replicate
- Direct code inspection: `apps/web/app/api/conversations/route.ts` — confirmed dev auth pattern (GET + POST both handle it)
- Direct code inspection: `apps/web/middleware.ts` — confirmed only `/*/cribai` protected, not other campus routes
- Direct code inspection: `apps/web/app/api/submit-listing/route.ts` — confirmed contact_email not in INSERT
- Direct code inspection: `apps/web/components/submit-listing-form.tsx` — confirmed contact_email in form, validated, sent in payload
- Direct code inspection: `packages/types/src/listing.ts` — confirmed `contact_email: z.string().email()` in `listingSubmissionSchema`
- Direct code inspection: `supabase/migrations/` (001-010) — confirmed no `contact_email` column exists
- Direct code inspection: `.planning/v1.0-MILESTONE-AUDIT.md` — INT-01, INT-02, INT-03 descriptions
- Direct code inspection: `.planning/ROADMAP.md` — Phase 9 success criteria, plan checkmark status
- Direct code inspection: `apps/web/lib/dev-auth.ts` — confirmed `isDevAuthEnabled`, `getDevUserById`, `DEFAULT_DEV_USER`, `DEV_USER_COOKIE`, `createSecretClient` pattern
- Direct code inspection: `.planning/STATE.md` — confirmed import path depth decision: "Import path for dev-auth from messages/route.ts is 5 levels"

### Secondary (MEDIUM confidence)
- `.planning/codebase/TESTING.md` — test infrastructure overview, confirmed no unit tests for API routes or middleware

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new dependencies
- Architecture: HIGH — all patterns verified by direct code inspection in existing API routes
- Pitfalls: HIGH — import path depth confirmed by STATE.md decision log, RLS behavior verified by pattern in messages/route.ts

**Research date:** 2026-03-10
**Valid until:** Stable (no moving dependencies — all internal code changes)
