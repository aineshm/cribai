# Dev Environment & Auth Bypass — Agent 1 Report

## Status: COMPLETE

## What Was Done

### 1. Auth Bypass System

Created a conditional auth bypass activated by `BYPASS_AUTH=true` in `.env.local`:

- **Middleware** (`apps/web/middleware.ts`): When `BYPASS_AUTH=true`, skips Supabase Auth entirely, resolves mock user from a cookie, redirects `/login` to CribAI, and disables rate limiting.
- **Unified auth resolver** (`apps/web/lib/get-current-user.ts`): Single function used by all server components. Returns real Supabase user in production, mock user in dev mode.
- **Dev auth config** (`apps/web/lib/dev-auth.ts`): Defines 4 switchable mock users with deterministic UUIDs matching the seed data.

### 2. Dev User Switcher

Created `apps/web/components/dev-user-switcher.tsx` — a floating orange pill in the bottom-right corner that:
- Shows the current dev user name and tier
- Expands into a picker with all 4 mock users
- Sets a cookie and reloads the page on switch
- Only renders when `BYPASS_AUTH=true`

### 3. Updated Pages & API Routes

Modified the following files to use the unified auth resolver:
- `apps/web/app/(campus)/[campusSlug]/layout.tsx` — uses `getCurrentUser()`, shows "Dev" badge, renders `DevUserSwitcher`
- `apps/web/app/(campus)/[campusSlug]/cribai/page.tsx` — uses `getCurrentUser()`
- `apps/web/app/(campus)/[campusSlug]/dashboard/page.tsx` — uses `getCurrentUser()`, service-role client for RLS bypass
- `apps/web/app/api/conversations/route.ts` — dev-aware auth resolution for GET and POST

### 4. Seed Data

Created `scripts/seed-dev-data.sql` with:
- 20 mock users (UUIDs match dev-auth.ts)
- 55 housing listings across 12+ Madison neighborhoods ($600-$3,200 rent)
- 16 landlord profiles with scorecard ratings
- 32 reviews with realistic text and timestamps
- 11 sublet posts
- 7 saved listings for primary dev users
- 3 tour requests

### 5. Documentation

- `docs/dev-environment.md` — Full setup guide, architecture, troubleshooting
- `docs/agent-outputs/dev-environment-report.md` — This report
- `.env.example` — Updated with `BYPASS_AUTH` documentation

## Verification

- TypeScript check passes (10 pre-existing errors in test files, 0 new errors introduced)
- Production auth flow is completely untouched when `BYPASS_AUTH` is not set
- All dev-mode code is guarded by `isDevAuthEnabled()` checks

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `apps/web/lib/dev-auth.ts` | ~95 | Mock user definitions and helpers |
| `apps/web/lib/get-current-user.ts` | ~65 | Unified server-side auth resolver |
| `apps/web/components/dev-user-switcher.tsx` | ~85 | Floating user picker component |
| `scripts/seed-dev-data.sql` | ~330 | SQL seed data script |
| `docs/dev-environment.md` | ~120 | Developer setup documentation |
| `docs/agent-outputs/dev-environment-report.md` | — | This report |

## Files Modified

| File | Change |
|------|--------|
| `apps/web/middleware.ts` | Added dev auth bypass path |
| `apps/web/app/(campus)/[campusSlug]/layout.tsx` | Uses getCurrentUser(), adds DevUserSwitcher, "Dev" badge |
| `apps/web/app/(campus)/[campusSlug]/cribai/page.tsx` | Uses getCurrentUser() |
| `apps/web/app/(campus)/[campusSlug]/dashboard/page.tsx` | Uses getCurrentUser(), service-role client |
| `apps/web/app/api/conversations/route.ts` | Dev-aware auth resolution |
| `.env.example` | Added BYPASS_AUTH documentation |

## How to Use

```bash
# 1. Add to .env.local
echo "BYPASS_AUTH=true" >> apps/web/.env.local

# 2. Seed the database
psql $DATABASE_URL < scripts/seed-dev-data.sql

# 3. Start dev server
pnpm dev

# 4. Visit http://localhost:3000/uw-madison/cribai
```
