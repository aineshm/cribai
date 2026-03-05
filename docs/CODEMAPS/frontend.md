<!-- Generated: 2026-03-04 | Files scanned: ~20 | Token estimate: ~500 -->
# Frontend (apps/web/)

## Page Tree

```
app/
├── layout.tsx            Root layout — DM Serif Display + Inter fonts
├── page.tsx              Homepage — campus selector cards (force-dynamic)
├── globals.css           Design tokens: teal primary, stone neutrals, animations
├── (auth)/
│   ├── login/page.tsx    Magic link OTP login
│   ├── verify-edu/page.tsx  .edu email verification
│   └── callback/route.ts   Auth callback handler
└── (campus)/[campusSlug]/
    ├── layout.tsx         Sticky frosted nav, campus context provider
    ├── listings/
    │   ├── page.tsx       Filtered listing grid (beds, price, sort)
    │   └── [id]/page.tsx  Detail: address, amenities, TrueCost, Fairness
    └── cribai/page.tsx    AI chat interface
```

## Component Hierarchy

```
RootLayout (fonts, globals)
├── HomePage → campus cards
├── LoginPage / VerifyEduPage → auth forms
└── CampusLayout (CampusProvider context)
    ├── AuthNav (sign in/out, verify .edu link)
    ├── ListingsPage
    │   ├── ListingFilters (beds, price range, sort)
    │   └── ListingGrid (stagger animation)
    │       └── ListingCard (shadow, hover lift, fairness badge)
    ├── ListingDetailPage
    │   ├── FairnessBadge (score bar, popover, semantic colors)
    │   └── TrueCostCalculator (CSS toggles, alternating rows)
    └── CribAIPage
        └── CribAIChat (bubble shapes, pulse-dot streaming, SSE)
```

## State Management

- **Server**: Supabase queries in RSC (no client state for data fetching)
- **Client**: React useState for UI state (chat messages, filters, toggles)
- **Context**: CampusProvider (campus config including avgUtilities, avgParking)
- **URL State**: ListingFilters sync to searchParams (beds, minPrice, maxPrice, sort)

## Design System (globals.css)

- Primary: deep teal (--primary-50 to --primary-950)
- Secondary: warm amber | Accent: soft coral
- Surface: warm stone neutrals (--surface-50 to --surface-900)
- Fairness: --fair-good (green), --fair-ok (amber), --fair-bad (red)
- Fonts: --font-display (DM Serif Display), --font-body (Inter)
- Shadows: --shadow-card, --shadow-card-hover
- Animations: fade-in (300ms), slide-up (400ms), stagger (50ms/item), pulse-dot
