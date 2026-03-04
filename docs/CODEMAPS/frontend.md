# Frontend Codemap

**Last Updated:** 2026-03-04
**Entry Points:** `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`
**Framework:** Next.js 15 App Router, Tailwind CSS v4, TypeScript

## Page Tree

```
app/
├── layout.tsx                          Root layout (HTML shell, globals.css)
├── page.tsx                            Home / landing page
│
├── (auth)/
│   ├── login/page.tsx                  Magic link / OAuth login form
│   ├── verify-edu/page.tsx             .edu email submission form
│   └── callback/route.ts               Supabase auth callback (redirect handler)
│
└── (campus)/
    └── [campusSlug]/
        ├── layout.tsx                  Campus shell — sets CampusContext
        ├── listings/
        │   ├── page.tsx                Listing search + grid (SSR, filterable)
        │   └── [id]/page.tsx           Listing detail — TrueCost + FairnessBadge
        └── cribai/
            └── page.tsx                CribAI chat UI (Phase 5 stub, auth-gated)

api/
├── ai/cribai/route.ts                  POST — CribAI query handler (stub)
└── webhooks/stripe/route.ts            POST — Stripe webhook handler (stub)
```

## Component Hierarchy

```
app/(campus)/[campusSlug]/
  layout.tsx
    └── CampusContext (lib/campus-context.tsx)
        ├── listings/page.tsx (SSR)
        │   ├── ListingFilters          URL-param driven filter bar (beds, price, sort)
        │   └── ListingGrid             Responsive grid of ListingCard
        │       └── ListingCard         Address, rent, beds/baths, FairnessBadge
        │           └── FairnessBadge   Score pill (1–10, color-coded)
        │
        └── listings/[id]/page.tsx (SSR)
            ├── FairnessBadge           Score + percentile tooltip
            └── TrueCostCalculator      Client component — interactive cost breakdown
                                        (calls calculateTrueCost from @campusnest/utils)
```

## Key Components

| Component | File | Type | Purpose |
|-----------|------|------|---------|
| `AuthNav` | `components/auth-nav.tsx` | Client | Login/logout nav item |
| `FairnessBadge` | `components/fairness-badge.tsx` | Server/Client | Score pill with fairness_data tooltip |
| `ListingCard` | `components/listing-card.tsx` | Server | Compact listing row/card |
| `ListingFilters` | `components/listing-filters.tsx` | Client | Beds, min/max price, sort controls |
| `ListingGrid` | `components/listing-grid.tsx` | Server | Maps listings → ListingCard |
| `TrueCostCalculator` | `components/true-cost-calculator.tsx` | Client | Live cost breakdown with toggles |

## Data Fetching Pattern

All listing data fetched in **Server Components** using `createSecretClient()` (service role — bypasses RLS for SSR safety). Pages use `await params` / `await searchParams` (Next.js 15 dynamic API).

Filtering is entirely URL-param driven (`?beds=2&minPrice=800&sort=fairness`), enabling shareable filter URLs and no client-side state for filters.

## Auth Context

`lib/campus-context.tsx` provides the current `campusSlug` to all campus-route components. Auth session is managed via `@supabase/ssr` cookies; no client-side auth state store is used.

## Related Codemaps
- [architecture.md](./architecture.md) — system boundaries
- [backend.md](./backend.md) — API routes the pages call
