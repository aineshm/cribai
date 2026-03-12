# CampusNest Agent Context — v1.1 Rebuild

## Tech Stack & Versions
- **Framework**: Next.js 15 (App Router, Turbopack dev)
- **React**: 19.0.0
- **Tailwind CSS**: v4 (via `@tailwindcss/postcss`, NO tailwind.config file — use `@theme inline` in globals.css)
- **UI Library**: shadcn/ui (base-nova style, components.json present)
- **State/Data**: Supabase (auth, DB, RLS), Zod validation
- **Animation**: Framer Motion (newly installed), CSS keyframes (existing)
- **Icons**: lucide-react (newly installed — replaces inline SVGs)
- **Maps**: mapbox-gl + react-map-gl (existing)
- **Toasts**: sonner
- **Monorepo**: pnpm 9 + Turborepo
- **Package manager**: pnpm (use `pnpm add` not `npm install`)
- **Build**: `pnpm run build` from web dir, or `pnpm build` from root

## Directory Structure (apps/web/)
```
app/
  globals.css                    # CSS variables + shadcn theme + animations
  layout.tsx                     # Root layout (DM Serif + Inter fonts, Toaster)
  page.tsx                       # Landing page (campus selector)
  error.tsx, not-found.tsx       # Error boundaries
  icon.tsx                       # Favicon
  (auth)/
    login/page.tsx               # OTP login flow (email → verify)
    verify-edu/page.tsx          # Email verification
  (campus)/[campusSlug]/
    layout.tsx                   # Campus layout with nav
    dashboard/page.tsx           # Dashboard
    listings/page.tsx            # Listings grid
    listings/[id]/page.tsx       # Listing detail
    saved/page.tsx               # Saved listings
    submit-listing/page.tsx      # Submit listing form
    cribai/page.tsx              # CribAI chat page
    notifications/page.tsx       # Notifications
  api/
    ai/cribai/route.ts           # AI chat API (SSE streaming)
    conversations/               # Conversation CRUD
    submit-listing/route.ts      # Listing submission
    notifications/               # Notification APIs
    webhooks/stripe/route.ts     # Stripe webhooks
  auth/confirm/route.ts          # Auth callback
  settings/profile/page.tsx      # Profile settings

components/
  ui/                            # shadcn/ui primitives (button, card, input, badge, dialog, sheet, tabs, avatar, separator, dropdown-menu, tooltip, skeleton, switch)
  chat/                          # CribAI chat block components (listing cards, comparison tables, tour confirmations, legal disclaimers, map blocks)
  listing-card.tsx               # Listing card component
  listing-grid.tsx               # Listing grid
  listing-filters.tsx            # Filter controls
  listing-photo-gallery.tsx      # Photo gallery
  listing-location-map.tsx       # Map component
  cribai-chat.tsx                # Main CribAI chat component
  mobile-nav.tsx                 # Mobile navigation
  auth-nav.tsx                   # Auth navigation
  heart-button.tsx               # Save/unsave button
  share-button.tsx               # Share button
  fairness-badge.tsx             # Price fairness indicator
  freshness-badge.tsx            # Listing freshness
  true-cost-calculator.tsx       # Cost breakdown
  submit-listing-form.tsx        # Listing submission form
  profile-form.tsx               # Profile editing
  profile-modal.tsx              # Profile modal
  scroll-reveal.tsx              # Scroll animation wrapper
  listing-skeleton.tsx           # Loading skeleton
  notification-bell.tsx          # Notification indicator
  saved-sort-select.tsx          # Sort dropdown for saved
  stale-section.tsx              # Stale listing warning
  dev-user-switcher.tsx          # Dev tool

lib/
  utils.ts                       # shadcn cn() utility
  campus-context.tsx             # Campus React context
  edu-validation.ts              # .edu email validation
  get-current-user.ts            # Auth helper
  dev-auth.ts                    # Dev auth helpers
  parse-wkb-point.ts             # PostGIS point parsing
  score-colors.ts                # Fairness score color mapping

middleware.ts                    # Auth middleware
```

## Existing CSS Variables (globals.css)
CampusNest custom tokens (keep these):
- `--primary-50` through `--primary-950` (Deep Teal palette)
- `--secondary-50` through `--secondary-600` (Warm Amber)
- `--accent-50`, `--accent-100`, `--accent-500` (Soft Coral)
- `--surface-50` through `--surface-900` (Warm Stone)
- `--fair-good`, `--fair-ok`, `--fair-bad` + bg variants (Fairness)
- `--font-display` (DM Serif Display), `--font-body` (Inter)
- `--shadow-card`, `--shadow-card-hover`

shadcn tokens (added by init, keep these):
- `--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`, `--sidebar-*`, `--chart-*`

## Existing Fonts
- **Display**: DM Serif Display (loaded via next/font/google, variable `--font-dm-serif`)
- **Body**: Inter (loaded via next/font/google, variable `--font-inter`)
- v1.1 ADDED: Space Grotesk (display) + DM Sans (body) — these REPLACE DM Serif Display + Inter

## Auth Flow
- Supabase OTP-based auth: email → signInWithOtp → verifyOtp
- .edu email validation required
- Auth middleware in middleware.ts
- Client: `@campusnest/supabase/client` (createClient)
- Server: `@campusnest/supabase/server` (createSecretClient)
- After auth, redirects to `/{campusSlug}/cribai`

## Route Structure
| Route | Description |
|-------|------------|
| `/` | Landing page (campus selector) |
| `/login` | Auth flow |
| `/verify-edu` | Email verification |
| `/{campusSlug}/dashboard` | Campus dashboard |
| `/{campusSlug}/listings` | Listing grid with filters |
| `/{campusSlug}/listings/[id]` | Listing detail |
| `/{campusSlug}/saved` | Saved listings |
| `/{campusSlug}/submit-listing` | Submit sublease |
| `/{campusSlug}/cribai` | AI chat |
| `/{campusSlug}/notifications` | Notifications |
| `/settings/profile` | Profile settings |

## Import Aliases
- `@/components/*` → `apps/web/components/*`
- `@/lib/*` → `apps/web/lib/*`
- `@/hooks/*` → `apps/web/hooks/*`
- `@campusnest/types` → `packages/types`
- `@campusnest/utils` → `packages/utils`
- `@campusnest/supabase/*` → `packages/supabase/*`

## Key Conventions
- All pages use `var(--css-variable)` syntax for theming
- Font references: `font-[family-name:var(--font-display)]` for headings
- CSS utility classes: `.glass`, `.hero-gradient`, `.skeleton`, `.card-image-zoom`, `.scroll-reveal`, `.stagger-item`
- Animations: CSS keyframes (fade-in, slide-up, bounce-in, etc.)
- No Tailwind config file — Tailwind v4 uses CSS-based config via `@theme inline` in globals.css
- PostCSS config: `postcss.config.mjs` with `@tailwindcss/postcss`
