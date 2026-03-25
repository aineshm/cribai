# CribAI Agent Context — v2.0

> Formerly CampusNest. Rebranded to CribAI on 2026-03-18.

## Tech Stack & Versions
- **Framework**: Next.js 16 (App Router, Turbopack, `proxy.ts` replaces `middleware.ts`)
- **React**: 19.0.0
- **Tailwind CSS**: v4 (via `@tailwindcss/postcss`, NO tailwind.config file — use `@theme inline` in globals.css)
- **UI Library**: shadcn/ui (base-nova style, components.json present)
- **State/Data**: Supabase (auth, DB, RLS, Realtime), Zod validation
- **AI**: Gemini 2.5 Flash via @google/genai, 13 function-calling tools
- **Animation**: Framer Motion + CSS keyframes
- **Icons**: lucide-react
- **Maps**: mapbox-gl + react-map-gl
- **Toasts**: sonner
- **Monorepo**: pnpm 9 + Turborepo
- **Package manager**: pnpm (use `pnpm add` not `npm install`)
- **Build**: `pnpm run build` from web dir, or `pnpm build` from root

## Directory Structure (apps/web/)
```
app/
  globals.css                    # CSS variables + shadcn theme + animations
  layout.tsx                     # Root layout (fonts, Toaster, ChatProvider)
  page.tsx                       # Landing page
  error.tsx, not-found.tsx       # Error boundaries
  icon.tsx                       # Favicon
  (auth)/
    login/page.tsx               # OTP login flow (email → verify)
    verify-edu/page.tsx          # Email verification
  (main)/                        # Primary user-facing routes
    explore/page.tsx             # Explore: inline CribAI chat + map split
    explore/ExploreClient.tsx    # Client component: chat panel + MapPanel + ListingGrid
    chat/page.tsx                # Chat inbox (conversation list → focused chat)
    listing/[id]/page.tsx        # Listing detail with CTAs, edit (creator), photos
    messages/page.tsx            # Mission task center (sidebar + detail panel)
    post/page.tsx                # PostWizard sublease submission (redirects to /chat)
    profile/page.tsx             # User profile
  (campus)/[campusSlug]/         # Legacy campus-scoped routes
    layout.tsx, dashboard/, listings/, saved/, cribai/, notifications/, submit-listing/
  api/
    ai/cribai/route.ts           # AI chat API (SSE streaming + server-side persistence)
    auth/validate-email/route.ts # Admin email whitelist validation
    conversations/               # Conversation CRUD (with ownership checks)
    listings/[id]/route.ts       # PATCH endpoint for listing edit (creator/admin auth)
    listings/[id]/stats/route.ts # Listing view stats
    missions/                    # Mission CRUD, steer, draft approve/reject
    submit-listing/route.ts      # Listing submission (source: 'sublease')
    events/route.ts              # Analytics event tracking
    tours/route.ts               # Tour request creation
    notifications/               # Notification APIs
    webhooks/stripe/route.ts     # Stripe webhooks (future)
  auth/confirm/route.ts          # Auth callback
  privacy/page.tsx               # Privacy policy
  terms/page.tsx                 # Terms of service
  sublease/page.tsx              # Sublease landing page
  settings/profile/page.tsx      # Profile settings

components/
  ui/                            # shadcn/ui primitives
  auth/                          # AuthForm
  chat/                          # AIChatButton, AIChatPanel, ChatProvider, ConversationInbox,
                                 #   conversation-sidebar, MissionProposalCard, chat-block-renderer,
                                 #   chat-listing-card, chat-comparison-table, chat-map-block,
                                 #   chat-map-popup, chat-tool-indicator, chat-tour-confirmation,
                                 #   chat-legal-disclaimer, chat-web-result
  concierge/                     # ConciergeProvider, ConciergeShell (mission UI)
  explore/                       # ExploreLayout, FilterChips, ListingCard, ListingGrid,
                                 #   MapPanel, ViewToggle
  landing/                       # Landing page components
  layout/                        # MainLayoutClient, MobileBottomNav, LandingMobileMenu
  listing/                       # CTASidebar, MobileBottomBar, EditListingForm, PhotoUploader,
                                 #   PhotoGallery, Lightbox, PostedByBadge, ListingViewStats,
                                 #   AmenitiesGrid, BookTourModal, CommuteSection, LandlordCard,
                                 #   LeaseSummary, ListingContent, ListingMap, ReviewSection
  messages/                      # MessagesPageClient, MissionLauncher
  post/                          # PostWizard, StepBasics, StepDetails, StepDescription,
                                 #   StepAmenities, StepPhotos, StepReview, StepSidebar,
                                 #   MobileProgressBar
  profile/                       # Profile components
  cribai-chat.tsx                # Main CribAI chat component (used in explore + chat pages)
  listing-card.tsx               # Listing card (shared)
  listing-grid.tsx               # Listing grid
  listing-filters.tsx            # Filter controls
  listing-photo-gallery.tsx      # Photo gallery
  listing-location-map.tsx       # Map component
  heart-button.tsx               # Save/unsave button
  share-button.tsx               # Share button
  fairness-badge.tsx             # Price fairness indicator
  freshness-badge.tsx            # Listing freshness
  true-cost-calculator.tsx       # Cost breakdown
  mobile-nav.tsx                 # Mobile navigation
  auth-nav.tsx                   # Auth navigation

lib/
  utils.ts                       # shadcn cn() utility
  campus-context.tsx             # Campus React context
  edu-validation.ts              # .edu email validation
  get-current-user.ts            # Auth helper
  listings-data.ts               # Listing data fetcher (limit: 3000)
  track-event.ts                 # Analytics event helper
  dev-auth.ts                    # Dev auth helpers
  parse-wkb-point.ts            # PostGIS point parsing
  score-colors.ts                # Fairness score color mapping

proxy.ts                         # Auth proxy (Next.js 16 — replaces middleware.ts)
```

## Design Tokens (globals.css)

### Fonts
- **Display**: CabinetGrotesk (via Fontshare CDN)
- **Body**: Satoshi (via Fontshare CDN)
- Legacy fonts (DM Serif Display, Inter, Space Grotesk, DM Sans) removed in mobile-first redesign

### Color Palette
- **Primary**: Deep Teal (`--primary-50` through `--primary-950`, hero: teal-800)
- **Secondary**: Warm Amber (`--secondary-50` through `--secondary-600`, accent: amber-400)
- **Accent**: Soft Coral (`--accent-50`, `--accent-100`, `--accent-500`)
- **Surface**: Warm Stone (`--surface-50` through `--surface-900`)
- **Fairness**: `--fair-good`, `--fair-ok`, `--fair-bad` + bg variants
- shadcn tokens: `--background`, `--foreground`, `--card`, `--primary`, `--secondary`, etc.

## Auth Flow
- Supabase OTP-based auth: email → signInWithOtp → verifyOtp
- .edu email validation required (admin whitelist via ADMIN_EMAILS env var for bypass)
- Proxy-based auth gating in `proxy.ts`
- Client: `@campusnest/supabase/client` (createClient)
- Server: `@campusnest/supabase/server` (createSecretClient)
- After auth: returning users with profile skip setup → redirect to `returnTo` param or `/explore`
- Guest (unauthenticated) users: restricted CribAI access (search, detail, compare, explain only)

## Route Structure

Primary user-facing routes are flat (`/explore`, `/chat`, etc.). Campus-scoped routes exist for legacy/multi-campus support.

| Route | Description |
|-------|------------|
| `/` | Landing page |
| `/login` | Auth flow (OTP) |
| `/verify-edu` | Email verification |
| `/explore` | Inline CribAI chat (left) + map/grid (right) |
| `/chat` | Chat inbox — conversation list, click to open focused chat |
| `/listing/[id]` | Listing detail with CTAs, creator edit/photos |
| `/messages` | Mission task center (sidebar + detail panel) |
| `/post` | Redirects to `/chat` (sublease posting via CribAI) |
| `/profile` | Profile page |
| `/sublease` | Sublease landing page (shareable, OG meta) |
| `/terms` | Terms of service |
| `/privacy` | Privacy policy |
| `/api/ai/cribai` | AI chat API (SSE streaming + server-side persistence) |
| `/api/submit-listing` | Listing submission (source: 'sublease') |
| `/api/listings/[id]` | PATCH for creator/admin listing edit |
| `/api/missions/*` | Mission CRUD, steer, draft approve/reject |
| `/api/tours` | Tour request creation |
| `/api/events` | Analytics event tracking |
| `/api/conversations/*` | Conversation CRUD with ownership verification |

## Import Aliases
- `@/components/*` → `apps/web/components/*`
- `@/lib/*` → `apps/web/lib/*`
- `@/hooks/*` → `apps/web/hooks/*`
- `@campusnest/types` → `packages/types`
- `@campusnest/utils` → `packages/utils`
- `@campusnest/supabase/*` → `packages/supabase/*`

## Key Conventions
- All pages use `var(--css-variable)` syntax for theming
- No Tailwind config file — Tailwind v4 uses CSS-based config via `@theme inline` in globals.css
- PostCSS config: `postcss.config.mjs` with `@tailwindcss/postcss`
- CSS utility classes: `.glass`, `.hero-gradient`, `.skeleton`, `.card-image-zoom`, `.scroll-reveal`, `.stagger-item`, `.hide-scrollbar`
- MobileBottomNav: 5-tab persistent bottom bar (Search, Agent, Post, Saved, Profile)
- AIChatPanel hidden on /explore, /messages, /chat (embedded UIs avoid double chat)
- Map popup z-index: `.mapboxgl-popup` at z-50
- CribAI is action-first: searches immediately on housing queries, never asks clarifying questions first
