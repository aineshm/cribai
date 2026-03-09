# Dev Environment Setup

## Quick Start

1. **Add `BYPASS_AUTH=true` to your `.env.local`**:
   ```
   BYPASS_AUTH=true
   ```

2. **Run the seed data script** against your Supabase project:
   ```bash
   psql $DATABASE_URL < scripts/seed-dev-data.sql
   ```
   Or paste the contents into Supabase Dashboard > SQL Editor.

3. **Start the dev server**:
   ```bash
   pnpm dev
   ```

4. **Navigate to** `http://localhost:3000/uw-madison/cribai` — you will be auto-authenticated as Emma Chen (undergrad, free tier).

## Auth Bypass

When `BYPASS_AUTH=true` is set:

- OTP verification is completely skipped
- Middleware auto-authenticates with a mock user (no redirect to `/login`)
- Navigating to `/login` redirects to CribAI
- API routes resolve the dev user from a cookie instead of Supabase Auth
- A floating orange "Dev User Switcher" pill appears in the bottom-right corner
- The nav bar shows a "Dev" badge next to the university name

### Switching Users

Click the orange pill in the bottom-right to expand the user picker. Selecting a different user sets a cookie and reloads the page. All server components and API routes will use the new user identity.

### Available Mock Users

| Name | Email | Role | Tier | Verified |
|------|-------|------|------|----------|
| Emma Chen | emma.chen@wisc.edu | Undergrad, CS | free | Yes |
| Raj Patel | raj.patel@wisc.edu | Grad, BME | pro | Yes |
| Maria Garcia | maria.garcia@wisc.edu | International, Econ | premium | Yes |
| New Student | unverified@wisc.edu | — | free | No |

## Seed Data

The seed script (`scripts/seed-dev-data.sql`) creates:

- **20 mock users** (undergrads, grad students, international students) with @wisc.edu emails
- **55 housing listings** across Madison neighborhoods (State St, Langdon, Eagle Heights, Regent, Monroe, Willy St, etc.) with rents from $600 to $3,200
- **16 landlord profiles** with varying reputation scorecards
- **32 landlord reviews** with ratings and text
- **11 active sublet/roommate posts**
- **7 saved listings** for the primary dev users
- **3 tour requests** (pending and confirmed)

### Neighborhoods Covered

State Street, Langdon Street, University Avenue, W Johnson / W Gorham, Eagle Heights, Regent / Monroe, Park Street, Williamson / Jenifer, W Dayton / W Mifflin, N Frances / N Carroll, Randall / Breeze Terrace, Spring / Mills

## Architecture

### Files

| Path | Purpose |
|------|---------|
| `apps/web/lib/dev-auth.ts` | Mock user definitions, cookie name, helper functions |
| `apps/web/lib/get-current-user.ts` | Unified auth resolver (production + dev mode) |
| `apps/web/middleware.ts` | Auth bypass in middleware (skips redirects, rate limits) |
| `apps/web/components/dev-user-switcher.tsx` | Floating user picker component |
| `scripts/seed-dev-data.sql` | SQL seed script with all mock data |
| `.env.example` | Documents `BYPASS_AUTH` variable |

### Safety

- The `isDevAuthEnabled()` guard is checked before any dev-mode code runs
- The `DevUserSwitcher` component is only rendered when `isDevMode` is true
- The middleware only activates bypass when `BYPASS_AUTH=true` is in env
- In production (no `BYPASS_AUTH` or `BYPASS_AUTH=false`), the auth flow is identical to the original implementation

### RLS Bypass

In dev mode, server components and API routes use the Supabase service-role client (`createSecretClient()`) to bypass Row Level Security. This is necessary because the mock users do not have real Supabase Auth sessions. The service-role client is only used when `BYPASS_AUTH=true`.

## Troubleshooting

**Q: I see "Authentication required" on API calls**
A: Ensure `BYPASS_AUTH=true` is in your `.env.local` and restart the dev server.

**Q: The user switcher does not appear**
A: Check that `BYPASS_AUTH=true` is set. The switcher only renders inside campus layouts.

**Q: Listings show empty**
A: Run the seed data script against your Supabase project. The listings use the UW-Madison campus_id.

**Q: Saved listings / dashboard is empty**
A: The seed data creates saved listings for the first 3 dev users. Make sure you ran the seed script and are using one of those users.
