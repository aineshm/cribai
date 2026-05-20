<!-- Updated: 2026-04-22 | Runtime rebuild frontend map -->
# Frontend (apps/web/)

## Page Tree

```
app/
├── layout.tsx            Root layout, font variables, global metadata
├── page.tsx              Landing page
├── globals.css           Tailwind v4 design tokens and app animations
├── (auth)/
│   ├── login/page.tsx    Magic link OTP login
│   ├── verify-edu/page.tsx  .edu email verification
│   └── callback/route.ts   Auth callback handler
├── (main)/
│   ├── layout.tsx        Main shell and mobile nav
│   ├── explore/page.tsx  Featured boot payload + viewport-driven map/listings
│   ├── listing/[id]/page.tsx  Public listing detail route
│   ├── chat/page.tsx     Main CribAI chat route
│   ├── messages/page.tsx Mission queue/past UI
│   ├── post/page.tsx     Sublease post wizard
│   └── profile/page.tsx  Profile, saved listings, user-owned listings
└── (campus)/[campusSlug]/
    ├── layout.tsx         Sticky frosted nav, campus context provider
    ├── dashboard/page.tsx Campus dashboard
    ├── listings/page.tsx  Legacy campus-scoped listing grid
    ├── saved/page.tsx     Saved listings
    ├── submit-listing/page.tsx Legacy submit listing form
    └── cribai/page.tsx    AI chat interface
```

## Component Hierarchy

```
RootLayout (fonts, globals)
├── Landing components
│   ├── Hero / Features / HowItWorks / SocialProof / FooterCTA
│   └── LandingMobileMenu / MobileStickyBar
├── MainLayoutClient
│   ├── MobileBottomNav
│   └── NotificationBell
├── ExploreLayout
│   ├── FilterChips
│   ├── ListingGrid → ListingCard
│   ├── MapPanel
│   └── ViewToggle
├── Listing detail
│   ├── PhotoGallery / Lightbox
│   ├── ListingContent / LeaseSummary / AmenitiesGrid
│   ├── TrueCostSection / CommuteSection / ReviewSection
│   ├── CTASidebar / MobileBottomBar
│   └── BookTourModal
├── Chat
│   ├── ChatProvider
│   ├── AIChatPanel / ConversationInbox / conversation-sidebar
│   ├── chat-block-renderer
│   ├── chat-listing-card / chat-comparison-table / chat-map-block
│   └── chat-tour-confirmation / MissionProposalCard
└── Messages / Missions
    ├── MessagesPageClient
    ├── MissionLauncher
    └── concierge MissionCard / MissionDetail / MissionResults
```

## State Management

- **Server**: Supabase queries in RSC (no client state for data fetching)
- **Chat runtime**: `conversation_state` is loaded and persisted server-side by `/api/ai/cribai`
- **Client**: React state for chat display, filters, map viewport, modals, optimistic mission status
- **Context**: CampusProvider (campus config including avgUtilities, avgParking)
- **Explore URL State**: filters/search params shape initial listing queries
- **Map State**: Explore viewport changes call `/api/explore/viewport`; AI/manual search calls `/api/search/listings`

## Runtime-Rebuild UI Contracts

- Queue view shows mission status instead of auto-running in an active tab:
  - red: queued
  - yellow: running/retrying
  - green: completed
- Completed or user-accepted missions move to past/history.
- Chat listing cards, comparison tables, maps, and tour confirmations render from typed `machineData`, not free-form model prose.
- Listing detail CTAs pass hidden listing context into chat without exposing raw IDs in the prompt.
- Explore boot payload is intentionally small; full map/listing data is viewport-driven.

## Design System (globals.css)

- Primary: deep teal (--primary-50 to --primary-950)
- Secondary: warm amber | Accent: soft coral
- Surface: warm stone neutrals (--surface-50 to --surface-900)
- Fairness: --fair-good (green), --fair-ok (amber), --fair-bad (red)
- Fonts: --font-display (DM Serif Display), --font-body (Inter)
- Shadows: --shadow-card, --shadow-card-hover
- Animations: fade-in (300ms), slide-up (400ms), stagger (50ms/item), pulse-dot
