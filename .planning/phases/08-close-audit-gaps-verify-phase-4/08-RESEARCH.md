# Phase 8: Close Audit Gaps + Verify Phase 4 — Research

**Researched:** 2026-03-10
**Domain:** Verification, gap closure, dev auth wiring, GitHub Actions pipeline, dead code removal
**Confidence:** HIGH

## Summary

Phase 8 is a gap-closure and verification phase with four tightly scoped work items identified by the v1.0 milestone audit. Three of the four items are code changes (PageIndex pipeline wiring, messages API dev auth, dead route removal); the fourth is a documentation artifact (Phase 4 VERIFICATION.md). No new libraries are introduced. No architectural decisions need to be made.

All four gaps are well-understood: the audit document specifies exact file locations, the dev auth pattern is implemented in at least three other API routes (conversations/route.ts, notifications/mark-read/route.ts, and the CribAI route), the nightly pipeline pattern is already established with `recalculate-fairness` as a reference, and the dead route is a single 63-line file with no callers.

The primary deliverable that unlocks the v1.0 milestone closure is the Phase 4 VERIFICATION.md. Code from all four Phase 4 plans is confirmed present by UAT and the integration checker — the VERIFICATION.md only needs to document and formally verify the already-shipped code.

**Primary recommendation:** Write the VERIFICATION.md first (it de-risks the milestone closure), then apply the three mechanical code changes, each in its own atomic commit.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LIST-01 | User can save/favorite listings and view them from a saved listings page | HeartButton, saved_listings table, /saved page confirmed present in UAT (9 of 12 tests passed). 04-01 and 04-04 SUMMARYs both claim LIST-01. Code verified by integration checker. |
| LIST-02 | User receives alerts when a saved listing's price changes | detectPriceChanges + createPriceChangeNotifications in scraper, notifications table, NotificationBell confirmed present. 04-03 SUMMARY claims LIST-02. |
| LIST-03 | Listing detail pages display photos scraped from source | ListingPhotoGallery on listings/[id]/page.tsx confirmed by UAT test 3. 04-02 SUMMARY claims LIST-03. |
| LIST-04 | Listings show freshness indicators (when last verified/updated, days since posted) | FreshnessBadge on detail page confirmed by UAT test 6. 04-02 SUMMARY claims LIST-04. |
</phase_requirements>

## Standard Stack

### Core (no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| GitHub Actions YAML | - | Nightly pipeline step addition | Established CI/CD platform for this project |
| Next.js Route Handlers | 15 | messages API dev auth pattern | Existing pattern in conversations/route.ts, notifications/mark-read/route.ts |
| Vitest | existing | Test framework for Phase 4 verification | Project standard; packages/ai and apps/web both use it |

### Supporting

No new libraries are needed for any of the four Phase 8 work items.

**Installation:** None required.

## Architecture Patterns

### Pattern 1: Dev Auth Bypass in Next.js Route Handlers

**What:** Three API routes already implement the standard dev auth bypass pattern. The messages route (`/api/conversations/[id]/messages`) is the only route in the conversations subtree missing it.

**When to use:** Any route that uses `supabase.auth.getUser()` and needs to work in `BYPASS_AUTH=true` dev mode.

**Reference implementation** (from `apps/web/app/api/conversations/route.ts`):

```typescript
// Source: apps/web/app/api/conversations/route.ts
import { isDevAuthEnabled, getDevUserById, DEFAULT_DEV_USER, DEV_USER_COOKIE } from '../../../lib/dev-auth';

async function resolveUserId(): Promise<{ userId: string | null; supabase: ReturnType<typeof createServerComponentClient> }> {
  const cookieStore = await cookies();
  const supabase = createServerComponentClient(cookieStore);

  if (isDevAuthEnabled()) {
    const selectedId = cookieStore.get(DEV_USER_COOKIE)?.value;
    const devUser = selectedId ? getDevUserById(selectedId) : DEFAULT_DEV_USER;
    return { userId: devUser?.id ?? DEFAULT_DEV_USER.id, supabase };
  }

  const { data: { user }, error } = await supabase.auth.getUser();
  return { userId: (!error && user) ? user.id : null, supabase };
}
```

**Critical additional requirement:** When dev auth is active, RLS will reject queries for the fake dev user ID (it is not in `auth.users`). The service-role client must be used for the actual DB writes:

```typescript
// Source: apps/web/app/api/conversations/route.ts
const writeClient = isDevAuthEnabled() ? createSecretClient() : supabase;
```

**For the messages route specifically:** The route inserts a message and then updates the conversation's `updated_at` and `last_message_preview`. Both writes need to use the service-role client in dev mode because:
1. The `messages` table RLS requires a valid `auth.uid()` that matches `conversation.user_id`
2. The `conversations` update similarly requires ownership

The relative import path from `apps/web/app/api/conversations/[id]/messages/route.ts` to dev-auth is `../../../../lib/dev-auth`.

### Pattern 2: Nightly Pipeline Step Addition (GitHub Actions)

**What:** The `nightly-scrape.yml` already calls `recalculate-fairness` and `embed.ts` as post-scrape steps. `rebuild-pageindex` follows the exact same pattern as `recalculate-fairness` — a curl POST to a Supabase Edge Function with Bearer auth.

**Reference implementation** (from `.github/workflows/nightly-scrape.yml`, the `Trigger fairness recalculation` step):

```yaml
# Source: .github/workflows/nightly-scrape.yml
- name: Trigger fairness recalculation
  if: success()
  env:
    SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}
  run: |
    curl -s -X POST \
      "${SUPABASE_URL}/functions/v1/recalculate-fairness" \
      -H "Authorization: Bearer ${SUPABASE_KEY}" \
      -H "Content-Type: application/json"
```

**For PageIndex rebuild:** Place a new step **after** the `Generate embeddings for changed listings` step (id: `embed`). It should be gated on `if: success() && steps.embed.outcome == 'success'` to avoid rebuilding when embedding failed. The Edge Function URL is `${SUPABASE_URL}/functions/v1/rebuild-pageindex`. The Edge Function already exists at `supabase/functions/rebuild-pageindex/index.ts` and accepts the same Authorization Bearer pattern.

**Ordering matters:** The PageIndex tree is built from active listings with rent data. Rebuilding before embedding would include embeddings from the *previous* run's data. The correct order is: scrape → fairness → embeddings → PageIndex rebuild.

### Pattern 3: Dead Route Removal

**What:** `/api/save-web-listing/route.ts` (63 lines) is unreferenced. The file imports `persistWebListing` from `@campusnest/ai` and calls it — but that same call is made directly inside the `web-search.ts` tool handler, making this route bypassed.

**Verification before removal:**
- Grep for `save-web-listing` across the codebase to confirm no callers
- Grep for `persistWebListing` to confirm the direct call in `web-search.ts` is the only live path
- Remove the file and verify `pnpm run build` still passes

**Risk:** LOW — the route has no frontend callers. The audit confirms it is dead code.

### Pattern 4: VERIFICATION.md Structure

**What:** Phase 4 VERIFICATION.md must follow the format established by Phase 3's `03-VERIFICATION.md`. It is a static documentation artifact — it does NOT need to re-run tests or re-execute code. It needs to verify that code ships the stated requirements by checking file existence, substantive implementation, and wiring.

**Structure to replicate from 03-VERIFICATION.md:**
- Frontmatter: `phase`, `verified`, `status`, `score`
- Observable Truths table (maps Phase 4 success criteria to evidence)
- Required Artifacts table (lists all key files created by Phase 4 plans)
- Key Link Verification table (confirms imports and wiring between components)
- Requirements Coverage table (LIST-01 through LIST-04)
- Anti-Patterns Found section
- Human Verification Required section (for things not automatable)
- Gaps Summary

**Evidence base for Phase 4 VERIFICATION.md:**
- 04-01-SUMMARY.md: saved_listings table, notifications table, HeartButton, ListingCard integration — claims LIST-01
- 04-02-SUMMARY.md: photo gallery, /saved page, FreshnessBadge on detail page, Saved nav links — claims LIST-01, LIST-03, LIST-04
- 04-03-SUMMARY.md: price-change-detector, NotificationBell, notifications page — claims LIST-02
- 04-04-SUMMARY.md: get_saved_listings CribAI tool, nav badge — claims LIST-01
- UAT (04-UAT.md): 9/12 tests passed, 0 issues, 3 skipped (similar listings data gap, badge timing — both are data/env issues, not code bugs)
- Integration checker: all Phase 4 wiring confirmed present

**Requirements coverage per plan:**

| Req | Evidence Plan(s) | Code Evidence |
|-----|-----------------|---------------|
| LIST-01 | 04-01, 04-02, 04-04 | saved_listings table (007 migration), HeartButton, /saved page, get_saved_listings tool |
| LIST-02 | 04-03 | services/scraper/price-change-detector.ts, notifications table, NotificationBell |
| LIST-03 | 04-02 | apps/web/app/(campus)/[campusSlug]/listings/[id]/page.tsx (photo gallery section) |
| LIST-04 | 04-02 | FreshnessBadge component on listing detail page, first_seen_at date display |

### Recommended Project Structure (for new work)

```
.planning/phases/04-saved-listings-and-alerts/
└── 04-VERIFICATION.md           # New: formal verification doc

apps/web/app/api/conversations/[id]/messages/
└── route.ts                     # Modify: add dev auth bypass

.github/workflows/
└── nightly-scrape.yml           # Modify: add rebuild-pageindex step

apps/web/app/api/save-web-listing/
└── route.ts                     # Delete: dead code
```

### Anti-Patterns to Avoid

- **Writing VERIFICATION.md as aspirational:** The doc must reflect what code currently does. All four LIST requirements are confirmed implemented — write it as verified, not as "should be."
- **Using `supabase` client for DB writes in dev mode:** RLS will reject writes for fake dev user IDs. Always use `createSecretClient()` when `isDevAuthEnabled()` is true.
- **Placing PageIndex rebuild before embed step:** Would rebuild stale index. Must run after `steps.embed` succeeds.
- **Using `if: steps.embed.outcome != 'skipped'` logic incorrectly:** The embed step is gated on `if: success()` from the scrape. If scrape fails, embed is skipped, and PageIndex should also be skipped. Gate PageIndex rebuild on `if: success() && steps.embed.outcome == 'success'` or simply `if: success()` (which will automatically be false if embed failed via the job failure propagation).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dev auth resolution | Custom logic per-route | `isDevAuthEnabled()` + `getDevUserById()` + `DEV_USER_COOKIE` from `lib/dev-auth.ts` | Pattern already established, must stay consistent |
| Edge Function call in CI | Custom HTTP client | Standard `curl` POST (matches existing fairness recalculation pattern) | Zero new dependencies, existing secrets already available |

## Common Pitfalls

### Pitfall 1: Missing service-role client switch in messages route

**What goes wrong:** Adding the `isDevAuthEnabled()` guard but still using `supabase` (session client) for DB operations. The dev user ID `a0000000-0000-4000-8000-000000000001` is not in Supabase `auth.users`. RLS policies on `messages` and `conversations` call `auth.uid()` which returns null for the service-role client but the insert will still work because service-role bypasses RLS entirely.
**Why it happens:** The dev auth fix looks complete after adding the auth bypass, but the DB client for the write is still the session client which fails RLS for fake user IDs.
**How to avoid:** Look at how `conversations/route.ts` does it — both auth resolution AND the `writeClient = isDevAuthEnabled() ? createSecretClient() : supabase` switch.

### Pitfall 2: Ownership verification in messages route

**What goes wrong:** In the messages route, inserting a message with a service-role client skips RLS ownership check. In dev mode this is fine. But the `updated_at` update on the conversations table also needs the service-role client — if it uses the session client, the update silently fails (no conversation owned by the dev user in auth.users).
**How to avoid:** Use the same `writeClient` for both the message insert and the conversation update.

### Pitfall 3: VERIFICATION.md scope confusion

**What goes wrong:** Writing Phase 4 verification as if it needs to re-test UAT steps or re-run tests. The purpose is code verification, not UAT replay.
**How to avoid:** VERIFICATION.md verifies that code artifacts exist, are substantive (not stubs), and are wired together correctly. It explicitly notes which items require human verification (photo rendering in browser, price change notification end-to-end with real data).

### Pitfall 4: Forgetting to update the nightly-scrape.yml summary step

**What goes wrong:** Adding the PageIndex rebuild step but not adding any output to the GitHub Actions job summary. Silent success/failure.
**How to avoid:** Add a summary step (like the `Write embedding summary` step already present) that appends the rebuild outcome to `$GITHUB_STEP_SUMMARY`. Low priority compared to the actual rebuild step, but good practice to include.

## Code Examples

### Dev Auth in messages/route.ts (what it should look like after fix)

```typescript
// Source: pattern from apps/web/app/api/conversations/route.ts
import { isDevAuthEnabled, getDevUserById, DEFAULT_DEV_USER, DEV_USER_COOKIE } from '../../../../lib/dev-auth';
import { createServerComponentClient, createSecretClient } from '@campusnest/supabase/server';

// Resolve user: dev cookie in dev mode, Supabase auth otherwise
const cookieStore = await cookies();
const supabase = createServerComponentClient(cookieStore);

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

// Use service-role client in dev to bypass RLS for fake user IDs
const writeClient = isDevAuthEnabled() ? createSecretClient() : supabase;
```

### rebuild-pageindex step in nightly-scrape.yml

```yaml
# Source: pattern from .github/workflows/nightly-scrape.yml (Trigger fairness recalculation step)
- name: Rebuild PageIndex for CribAI context
  if: success()
  env:
    SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_KEY: ${{ secrets.SUPABASE_SECRET_KEY }}
  run: |
    curl -s -X POST \
      "${SUPABASE_URL}/functions/v1/rebuild-pageindex" \
      -H "Authorization: Bearer ${SUPABASE_KEY}" \
      -H "Content-Type: application/json"
```

**Note:** `if: success()` at this point in the workflow means both scrape AND embed steps succeeded (since they are in the same job and failures propagate).

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|-----------------|-------|
| No VERIFICATION.md for Phase 4 | Create 04-VERIFICATION.md | Direct gap from audit |
| PageIndex rebuilt manually only | Add to nightly pipeline after embed step | `rebuild-pageindex` edge function already exists |
| Messages route has no dev auth | Apply conversations/route.ts pattern | Pattern established in Phase 7 |
| /api/save-web-listing active | Remove file entirely | `persistWebListing` called directly in web-search.ts handler |

## Open Questions

1. **Should the nightly summary step for PageIndex rebuild be included?**
   - What we know: The `Write embedding summary` step pattern exists and adds to GITHUB_STEP_SUMMARY
   - What's unclear: Whether the planner wants this as a separate task or bundled with the pipeline step
   - Recommendation: Include it as part of the same task (pipeline step + summary step), matches existing pattern

2. **Is the `if: success()` guard correct for the PageIndex step?**
   - What we know: In GitHub Actions, `success()` returns true if all prior steps succeeded. Since embed runs with `if: success()` (gated on scrape success), if embed fails, the job does not fail (due to `exit ${EXIT_CODE:-0}` in the embed step script) — the step `outcome` would be `failure` but the job continues
   - What's unclear: Whether embed failure should block PageIndex rebuild
   - Recommendation: Use `if: success() && steps.embed.outcome == 'success'` to ensure PageIndex only rebuilds when fresh embeddings were just generated. This is more precise.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (packages/ai and apps/web) |
| Config file | `apps/web/vitest.config.ts`, `packages/ai/vitest.config.ts` |
| Quick run command | `pnpm --filter @campusnest/ai test --run` |
| Full suite command | `pnpm run test --recursive` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIST-01 | Save/favorite listing toggle | unit | `pnpm --filter web test --run lib/__tests__/heart-button.test.tsx` | ✅ apps/web/lib/__tests__/heart-button.test.tsx |
| LIST-01 | get_saved_listings CribAI tool | unit | `pnpm --filter @campusnest/ai test --run src/tools/__tests__/get-saved-listings.test.ts` | ✅ packages/ai/src/tools/__tests__/get-saved-listings.test.ts |
| LIST-02 | Price change detection | unit | `pnpm --filter @campusnest/scraper test --run __tests__/price-change-detector.test.ts` | ✅ services/scraper/__tests__/price-change-detector.test.ts |
| LIST-03 | Photo gallery rendering | manual | Visual inspection of /uw-madison/listings/[id] | N/A — manual only |
| LIST-04 | Freshness badge display | manual | Visual inspection of /uw-madison/listings/[id] | N/A — manual only |

**Note:** LIST-03 and LIST-04 are UI rendering concerns that require browser verification. The code existence can be verified statically in VERIFICATION.md.

### Sampling Rate

- **Per task commit:** `pnpm --filter @campusnest/ai test --run && pnpm --filter web test --run`
- **Per wave merge:** `pnpm run build` (full typecheck + build)
- **Phase gate:** Full suite green before verification

### Wave 0 Gaps

None — existing test infrastructure covers all automated test requirements for this phase. The phase is verification + gap-closure, not new feature development. No new test files are required.

## Sources

### Primary (HIGH confidence)

- `.planning/v1.0-MILESTONE-AUDIT.md` — Definitive source for all 4 gaps and their exact locations
- `apps/web/app/api/conversations/route.ts` — Reference implementation of dev auth pattern
- `apps/web/app/api/notifications/mark-read/route.ts` — Second reference implementation of dev auth pattern
- `.github/workflows/nightly-scrape.yml` — Current pipeline; reference for `recalculate-fairness` step pattern
- `supabase/functions/rebuild-pageindex/index.ts` — Confirmed edge function exists, accepts Bearer auth
- `apps/web/app/api/save-web-listing/route.ts` — Confirmed dead code, 63 lines, no callers
- `apps/web/lib/dev-auth.ts` — `isDevAuthEnabled()`, `DEV_USER_COOKIE`, `DEFAULT_DEV_USER`, `getDevUserById()`
- `.planning/phases/03-semantic-search/03-VERIFICATION.md` — Format template for Phase 4 VERIFICATION.md
- `.planning/phases/04-saved-listings-and-alerts/04-UAT.md` — Evidence of Phase 4 UAT passing

### Secondary (MEDIUM confidence)

- Phase 4 SUMMARY files (04-01 through 04-04) — Cross-reference for `requirements-completed` fields and key file lists

### Tertiary (LOW confidence)

None — all claims are backed by direct file inspection.

## Metadata

**Confidence breakdown:**
- VERIFICATION.md structure: HIGH — direct template from Phase 3, all source evidence inspected
- Messages route dev auth: HIGH — pattern copied from existing routes in same codebase
- PageIndex pipeline step: HIGH — curl call pattern identical to existing fairness step
- Dead route removal: HIGH — audit confirmed, grep to verify before deletion

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable codebase, no dependency churn expected)
