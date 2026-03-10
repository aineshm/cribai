# Phase 4: Saved Listings and Alerts - Research

**Researched:** 2026-03-06
**Domain:** Supabase favorites/notifications, Next.js dynamic routes, price change detection pipeline
**Confidence:** HIGH

## Summary

Phase 4 adds three interconnected features: saved/favorite listings with a heart toggle, in-app notifications for price changes, and an enhanced listing detail page. The codebase already has strong foundations -- `ListingCard`, `ListingPhotoGallery`, `FreshnessBadge`, `ChatMapBlock`, and the CribAI tool system are all well-structured and ready for extension. The scraper pipeline (`run.ts`) uses Supabase upsert on `(external_id, source)` but does NOT currently track price changes; a new step must be added after the scrape to compare current prices against previous values and generate notification records.

The database schema follows clear conventions: `uuid` PKs with `gen_random_uuid()`, `auth.uid()` RLS policies, `timestamptz DEFAULT now()` timestamps, and campus-scoping via `campus_id` foreign keys. Two new tables (`saved_listings`, `notifications`) follow these exact patterns. The existing `listing_history` table archives stale listings but does NOT store price snapshots for active listings -- price change detection must compare the new scraped `rent_monthly` against the current DB value during the upsert flow.

**Primary recommendation:** Add a price change detection step to `services/scraper/run.ts` that fetches current prices before upsert, diffs them, and bulk-inserts notification records for affected users via a `saved_listings` join. Use Supabase Realtime subscriptions on the `notifications` table for live bell icon updates.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Heart icon on listing cards (overlay on hero photo area, Airbnb-style) and listing detail page
- Heart fills with animation (outline to filled, scale animation) + brief toast "Saved to favorites"
- Unauthenticated users see the heart icon; clicking prompts login redirect with return URL
- CribAI gets a new `get_saved_listings` tool so it can reference saves
- In-app notification center: bell icon in nav with unread count, notification page shows price changes
- No email alerts for v1 -- in-app only
- Price change detection runs after each nightly scrape (piggyback on GitHub Actions pipeline, no pg_cron needed)
- Any price change triggers an alert -- no minimum threshold
- Display: color-coded arrows (green down for decreases, red up for increases) with old price -> new price and listing name
- Saved listings route: `/[campusSlug]/saved` (campus-scoped)
- Grid layout using existing ListingCard component, sorted by date saved (most recent first)
- Persistent "Saved" nav item in campus sidebar/top nav with badge showing count of price-changed saves
- Empty state: friendly message "No saved listings yet" + CTA button linking to CribAI chat
- Listing detail route: `/[campusSlug]/listings/[id]`
- Top: ListingPhotoGallery + prominent save button
- Key info section: rent, beds/baths/sqft, fairness score badge, true cost breakdown, freshness badge
- Amenities list section
- Interactive Mapbox map showing listing location (reuse MapBlock from Phase 3)
- "Ask CribAI about this place" CTA button
- "Similar nearby" section: 3 similar listings by price/location using ListingCard

### Claude's Discretion
- Database schema for saved_listings table (user_id + listing_id, timestamps, unique constraint)
- Notification storage schema (notifications table with type, read/unread, payload)
- Heart icon animation implementation details
- Similar listings algorithm (vector similarity vs SQL proximity)
- Bell icon notification dropdown vs full page
- "Ask CribAI" pre-fill mechanism (query params, localStorage, or React context)
- Notification badge count implementation

### Deferred Ideas (OUT OF SCOPE)
- Email notifications for price changes
- Price history chart on detail page
- Notes/tags on saved listings
- Compare selected saved listings (multi-select checkbox)
- Popularity-based empty state suggestions
- Re-ranking search results based on user saves/clicks
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LIST-01 | User can save/favorite listings and view them from a saved listings page | saved_listings table schema, heart toggle component, optimistic UI pattern, saved page route, RLS policies |
| LIST-02 | User receives alerts when a saved listing's price changes | notifications table schema, price change detection in scraper pipeline, bell icon component, Supabase Realtime |
| LIST-03 | Listing detail pages display photos scraped from source | Existing ListingPhotoGallery reuse, detail page enhancement with map/similar/CTA |
| LIST-04 | Listings show freshness indicators | Existing FreshnessBadge component already handles this; add first_seen_at display for "posted X days ago" |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase JS | ^2.x (already installed) | DB queries, RLS, Realtime subscriptions | Project standard, all data access uses this |
| Next.js 15 | App Router | Dynamic routes, server components | Project standard |
| Tailwind v4 | CSS | Styling, animations | Project standard |
| Zod | ^3.x (already installed) | Schema validation | Project standard for all types |
| Sonner | (already installed) | Toast notifications | Already used in Phase 1 for toasts |
| Lucide React | (already installed, check) | Heart, Bell, ArrowUp, ArrowDown icons | Standard icon library for React |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-map-gl/mapbox | (already installed) | Map on detail page | Reuse ChatMapBlock pattern |
| mapbox-gl | (already installed) | Map rendering | Already a dependency |
| framer-motion | 11.x (install if needed) | Heart scale animation | Only for the heart toggle micro-interaction |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| framer-motion | CSS keyframes | CSS keyframes are simpler (no dependency), sufficient for a heart scale+fill. Recommend CSS keyframes to avoid adding framer-motion dependency |
| Supabase Realtime | Polling | Realtime gives instant bell updates without polling; already included in Supabase JS client |
| Vector similarity for "similar" | SQL price+distance | SQL proximity is simpler, faster, no embedding dependency; vector similarity is better quality but adds latency. Recommend SQL proximity for v1 |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
# If Lucide isn't installed:
pnpm --filter @campusnest/web add lucide-react
```

## Architecture Patterns

### Recommended Project Structure
```
supabase/migrations/
  007_saved_listings_notifications.sql    # New tables + RLS

apps/web/
  app/(campus)/[campusSlug]/
    saved/page.tsx                        # Saved listings page (LIST-01)
    listings/[id]/page.tsx                # Enhanced detail page (LIST-03, LIST-04)
    notifications/page.tsx                # Notification list page (LIST-02)
  components/
    heart-button.tsx                      # Reusable heart toggle (client component)
    notification-bell.tsx                 # Bell icon with unread count (client component)
    notification-item.tsx                 # Single notification row
    listing-detail-map.tsx                # Single-listing map (wraps react-map-gl)
    similar-listings.tsx                  # "Similar nearby" section
  lib/
    saved-listings.ts                     # Client-side save/unsave helpers
    notifications.ts                      # Notification fetch/mark-read helpers

packages/ai/src/tools/
  schemas.ts                              # Add get_saved_listings declaration
  handlers/get-saved-listings.ts          # New handler
  executor.ts                             # Register new handler

services/scraper/
  price-change-detector.ts                # Compare prices, generate notifications
  run.ts                                  # Add price detection step after upsert
```

### Pattern 1: Saved Listings Table Schema
**What:** Junction table for user-listing favorites
**When to use:** Any many-to-many user-content relationship with per-user scoping

```sql
-- Migration 007
CREATE TABLE saved_listings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  listing_id uuid REFERENCES listings(id) ON DELETE CASCADE NOT NULL,
  campus_id  uuid REFERENCES campus_configs(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, listing_id)
);

CREATE INDEX idx_saved_listings_user ON saved_listings (user_id, created_at DESC);
CREATE INDEX idx_saved_listings_listing ON saved_listings (listing_id);

ALTER TABLE saved_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_saves_select" ON saved_listings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "own_saves_insert" ON saved_listings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own_saves_delete" ON saved_listings
  FOR DELETE USING (auth.uid() = user_id);
```

**Key decisions:**
- `ON DELETE CASCADE` on both FKs: if a listing is deleted/archived or user is deleted, saves clean up automatically
- `UNIQUE(user_id, listing_id)`: prevents duplicate saves, enables upsert-based toggle
- `campus_id` included for efficient campus-scoped queries (badge count for nav)
- No `updated_at` needed -- saves are immutable (created or deleted)

### Pattern 2: Notifications Table Schema
**What:** Generic notifications table with JSONB payload for extensibility
**When to use:** In-app notification system with multiple notification types

```sql
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type       text NOT NULL CHECK (type IN ('price_decrease', 'price_increase', 'listing_removed')),
  payload    jsonb NOT NULL DEFAULT '{}',
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON notifications (user_id, created_at DESC)
  WHERE is_read = false;
CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_notifications_select" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "own_notifications_update" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);
```

**Payload shape for price changes:**
```json
{
  "listing_id": "uuid",
  "listing_address": "123 Main St",
  "campus_slug": "uw-madison",
  "old_price": 1200,
  "new_price": 1100,
  "change_pct": -8.3
}
```

**Key decisions:**
- `type` column as CHECK constraint (not enum) for easy extension
- Partial index on `is_read = false` for fast unread count queries
- JSONB payload keeps the schema flexible for future notification types
- No `listing_removed` type for v1 but schema supports it
- Service role key used by scraper to insert notifications (bypasses RLS)

### Pattern 3: Price Change Detection in Scraper
**What:** Compare scraped prices against current DB values and generate notifications
**When to use:** After the upsert step in `run.ts`

```typescript
// services/scraper/price-change-detector.ts
interface PriceChange {
  readonly listingId: string;
  readonly address: string;
  readonly campusSlug: string;
  readonly oldPrice: number;
  readonly newPrice: number;
}

export async function detectPriceChanges(
  supabase: SupabaseClient,
  campusId: string,
  campusSlug: string,
  normalizedListings: NormalizedListing[],
): Promise<readonly PriceChange[]> {
  // 1. Fetch current prices for listings that will be upserted
  const externalIds = normalizedListings.map(l => l.externalId);
  const { data: currentListings } = await supabase
    .from('listings')
    .select('id, external_id, source, rent_monthly, address')
    .eq('campus_id', campusId)
    .in('external_id', externalIds);

  if (!currentListings) return [];

  // 2. Build lookup: external_id+source -> current price
  const currentPriceMap = new Map(
    currentListings.map(l => [`${l.external_id}:${l.source}`, l])
  );

  // 3. Compare and collect changes
  const changes: PriceChange[] = [];
  for (const listing of normalizedListings) {
    const current = currentPriceMap.get(`${listing.externalId}:${listing.source}`);
    if (!current || current.rent_monthly == null || listing.rentMonthly == null) continue;
    if (current.rent_monthly !== listing.rentMonthly) {
      changes.push({
        listingId: current.id,
        address: current.address,
        campusSlug,
        oldPrice: current.rent_monthly,
        newPrice: listing.rentMonthly,
      });
    }
  }
  return changes;
}

export async function createPriceNotifications(
  supabase: SupabaseClient,
  changes: readonly PriceChange[],
): Promise<number> {
  if (changes.length === 0) return 0;

  // Get all users who have saved any of the changed listings
  const listingIds = changes.map(c => c.listingId);
  const { data: saves } = await supabase
    .from('saved_listings')
    .select('user_id, listing_id')
    .in('listing_id', listingIds);

  if (!saves || saves.length === 0) return 0;

  // Build notification rows
  const notifications = saves.map(save => {
    const change = changes.find(c => c.listingId === save.listing_id)!;
    return {
      user_id: save.user_id,
      type: change.newPrice < change.oldPrice ? 'price_decrease' : 'price_increase',
      payload: {
        listing_id: change.listingId,
        listing_address: change.address,
        campus_slug: change.campusSlug,
        old_price: change.oldPrice,
        new_price: change.newPrice,
        change_pct: Math.round(((change.newPrice - change.oldPrice) / change.oldPrice) * 1000) / 10,
      },
    };
  });

  const { error } = await supabase.from('notifications').insert(notifications);
  if (error) {
    console.error('Notification insert error:', error.message);
    return 0;
  }
  return notifications.length;
}
```

**Integration point in `run.ts`:** Call `detectPriceChanges()` BEFORE the upsert (so you compare against the old DB values), then upsert, then call `createPriceNotifications()`.

### Pattern 4: Heart Button with Optimistic UI
**What:** Client-side save/unsave with instant feedback, server sync
**When to use:** Any toggle action that should feel instant

```typescript
// apps/web/components/heart-button.tsx
'use client';

import { useState, useTransition } from 'react';
import { createClient } from '@campusnest/supabase/client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface HeartButtonProps {
  readonly listingId: string;
  readonly campusId: string;
  readonly initialSaved: boolean;
  readonly isAuthenticated: boolean;
  readonly campusSlug: string;
}

export function HeartButton({
  listingId, campusId, initialSaved, isAuthenticated, campusSlug,
}: HeartButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function handleToggle(e: React.MouseEvent) {
    e.preventDefault(); // Prevent card link navigation
    e.stopPropagation();

    if (!isAuthenticated) {
      router.push(`/login?returnTo=/${campusSlug}/listings`);
      return;
    }

    const newState = !saved;
    setSaved(newState); // Optimistic update

    const supabase = createClient();

    if (newState) {
      const { error } = await supabase
        .from('saved_listings')
        .insert({ listing_id: listingId, user_id: (await supabase.auth.getUser()).data.user!.id, campus_id: campusId });
      if (error) {
        setSaved(false); // Revert
        toast.error('Could not save listing');
        return;
      }
      toast.success('Saved to favorites');
    } else {
      const { error } = await supabase
        .from('saved_listings')
        .delete()
        .eq('listing_id', listingId)
        .eq('user_id', (await supabase.auth.getUser()).data.user!.id);
      if (error) {
        setSaved(true); // Revert
        toast.error('Could not remove from favorites');
        return;
      }
      toast.success('Removed from favorites');
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/20 backdrop-blur-sm hover:bg-black/30 transition-colors"
      aria-label={saved ? 'Remove from favorites' : 'Save to favorites'}
    >
      <svg
        className={`h-5 w-5 transition-transform duration-200 ${saved ? 'scale-110' : 'scale-100'}`}
        fill={saved ? '#ef4444' : 'none'}
        stroke={saved ? '#ef4444' : 'white'}
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
        />
      </svg>
    </button>
  );
}
```

**Heart animation:** Use CSS `transition-transform duration-200` with `scale-110` on save. No framer-motion needed -- the fill + scale transition with CSS is smooth and matches Airbnb's feel. Add a CSS keyframe for the initial save "pop":

```css
@keyframes heart-pop {
  0% { transform: scale(1); }
  50% { transform: scale(1.3); }
  100% { transform: scale(1.1); }
}
```

### Pattern 5: Notification Bell with Realtime
**What:** Bell icon in nav with live unread count via Supabase Realtime
**When to use:** Any live-updating count badge

```typescript
// apps/web/components/notification-bell.tsx
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@campusnest/supabase/client';
import Link from 'next/link';

interface NotificationBellProps {
  readonly campusSlug: string;
  readonly initialCount: number;
}

export function NotificationBell({ campusSlug, initialCount }: NotificationBellProps) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => {
          setCount(prev => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications' },
        (payload) => {
          if (payload.new.is_read && !payload.old.is_read) {
            setCount(prev => Math.max(0, prev - 1));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <Link href={`/${campusSlug}/notifications`} className="relative">
      {/* Bell SVG icon */}
      {count > 0 && (
        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}
```

**Important Supabase Realtime note:** Realtime postgres_changes requires the table to have Realtime enabled in Supabase dashboard (or via `ALTER PUBLICATION supabase_realtime ADD TABLE notifications`). The RLS policies automatically filter so each user only receives their own notifications.

### Pattern 6: Similar Listings Algorithm (SQL proximity)
**What:** Find listings similar by price and location without vector embeddings
**When to use:** "Similar nearby" section on detail page

```sql
-- Can be an RPC or inline query
SELECT id, address, rent_monthly, bedrooms, bathrooms, sqft,
       fairness_score, true_cost_total, amenities, photo_urls,
       last_seen_at, is_active,
       ST_Distance(location, target_location) as distance_m
FROM listings
WHERE campus_id = $campus_id
  AND id != $listing_id
  AND is_active = true
  AND rent_monthly BETWEEN ($rent * 0.7) AND ($rent * 1.3)
ORDER BY ST_Distance(location, target_location)
LIMIT 3;
```

This is simpler and faster than vector similarity. It finds listings within 30% of the same price, sorted by geographic proximity. No embedding lookup needed.

### Pattern 7: CribAI get_saved_listings Tool
**What:** New tool following existing handler pattern
**When to use:** When user says "show my saved listings", "compare my saves", etc.

```typescript
// packages/ai/src/tools/handlers/get-saved-listings.ts
import { z } from 'zod';
import type { ToolContext, ToolResult } from '../types';
import type { ListingSummary } from '@campusnest/types';

const inputSchema = z.object({
  sort: z.enum(['date_saved', 'price_asc', 'price_desc']).optional(),
  limit: z.number().int().min(1).max(10).optional(),
});

export async function getSavedListings(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  if (!context.userId) {
    return {
      modelContext: 'User is not logged in. Suggest they log in to see saved listings.',
      clientBlock: { type: 'text', content: 'Please log in to view your saved listings.' },
    };
  }

  const parsed = inputSchema.parse(args);
  const limit = parsed.limit ?? 5;

  const { data, error } = await context.supabase
    .from('saved_listings')
    .select(`
      listing_id,
      created_at,
      listings!inner (
        id, address, rent_monthly, bedrooms, bathrooms, sqft,
        fairness_score, true_cost_total, amenities
      )
    `)
    .eq('user_id', context.userId)
    .eq('campus_id', context.campusId)
    .order('created_at', { ascending: false })
    .limit(limit);

  // Map to ListingSummary and return as listing_card block
  // ... (follows same pattern as search-listings.ts)
}
```

### Anti-Patterns to Avoid
- **Polling for notification count:** Use Supabase Realtime subscriptions, not `setInterval` polling
- **Deleting + reinserting for toggle:** Use upsert with `onConflict` or conditional insert/delete based on current state
- **Storing notification text in DB:** Store structured payload (JSONB), render text in UI -- this allows rerendering in different locales or formats
- **Running price detection as a separate cron:** Piggyback on the existing nightly scrape pipeline to avoid coordination issues
- **Fetching all user saves in the heart button:** Pass `initialSaved` as a prop from the server component that already has the user's saves

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Heart icon SVG | Custom SVG path | Inline SVG or Lucide `Heart` icon | Standard path, accessible |
| Toast notifications | Custom toast system | Sonner (already installed) | Already the project standard |
| Real-time count updates | WebSocket wrapper | Supabase Realtime `channel.on('postgres_changes')` | Built into supabase-js, handles reconnection |
| Map component | New map setup | Reuse react-map-gl pattern from `ChatMapBlock` | Already configured with Mapbox token |
| Animation library | framer-motion install | CSS transitions + keyframes | Sufficient for heart pop, no new dependency |

**Key insight:** Every UI component needed (gallery, map, badges, toasts) already exists in the codebase. The work is wiring them together with new data (saves, notifications) and new routes.

## Common Pitfalls

### Pitfall 1: Heart Click Propagates to Card Link
**What goes wrong:** Clicking the heart navigates to the listing detail page because the heart is inside a `<Link>` wrapper
**Why it happens:** `ListingCard` is wrapped in a `<Link>` component
**How to avoid:** Use `e.preventDefault()` AND `e.stopPropagation()` on the heart button click handler
**Warning signs:** Heart saves work but also navigate away

### Pitfall 2: RLS Blocks Service Role Notification Inserts
**What goes wrong:** Scraper (service role) tries to insert notifications but RLS has no INSERT policy for service role
**Why it happens:** Service role bypasses RLS by default, but only if using `createClient` with service role key and `auth: { autoRefreshToken: false, persistSession: false }`
**How to avoid:** The scraper already uses service role client (`SUPABASE_SECRET_KEY`). Verify the Supabase client is created with service role, which bypasses RLS. Do NOT add INSERT policies that require `auth.uid()` since the scraper has no user context.
**Warning signs:** Notifications table stays empty after scrape despite price changes

### Pitfall 3: Upsert Overwrites Price Before Detection
**What goes wrong:** Price change detection runs AFTER upsert, so old price is already overwritten
**Why it happens:** Wrong ordering in `run.ts`
**How to avoid:** Call `detectPriceChanges()` BEFORE `supabase.from('listings').upsert()` in the scraper loop
**Warning signs:** Price changes detected as 0 or no changes found

### Pitfall 4: Supabase Realtime Not Enabled for Table
**What goes wrong:** Bell icon never updates in real-time
**Why it happens:** Supabase Realtime requires explicit table enablement
**How to avoid:** Add `ALTER PUBLICATION supabase_realtime ADD TABLE notifications;` to the migration
**Warning signs:** Initial count loads correctly but never increments

### Pitfall 5: N+1 Queries on Saved Listings Page
**What goes wrong:** Fetching saves then fetching each listing individually
**Why it happens:** Not using Supabase's relational query syntax
**How to avoid:** Use `saved_listings.select('*, listings!inner(*)')` to join in one query
**Warning signs:** Slow page load proportional to number of saves

### Pitfall 6: Cascade Delete Creates Orphaned Notifications
**What goes wrong:** When a listing is deleted (archived after 30 days), notifications referencing it still exist but the listing_id in payload leads to 404
**Why it happens:** Notifications store listing_id in JSONB payload, not as a FK
**How to avoid:** Include `listing_address` and `campus_slug` in notification payload so the notification is self-contained and still useful even if the listing is gone. Add null handling in notification UI.
**Warning signs:** Clicking a notification for a deleted listing shows 404

## Code Examples

### Existing ListingCard Integration Point
The `ListingCard` component (line 54-64) has a `div.relative.aspect-video` wrapper around the hero photo. The heart button should be positioned inside this div as an absolute-positioned overlay:

```tsx
// In listing-card.tsx, modify the photo div:
<div className="relative aspect-video">
  <Image ... />
  <HeartButton
    listingId={listing.id}
    campusId={campusId}
    initialSaved={savedListingIds.has(listing.id)}
    isAuthenticated={!!userId}
    campusSlug={campusSlug}
  />
</div>
```

This requires `ListingCard` to accept new props: `campusId`, `userId`, and `savedListingIds` (a `Set<string>`). The parent page (listings, saved, detail) fetches the user's saves once and passes down the Set.

### Existing Tool System Integration
Add to `schemas.ts`:
```typescript
const getSavedListings: FunctionDeclaration = {
  name: 'get_saved_listings',
  description: 'Get the user\'s saved/favorited listings. Use when the user asks about their saved listings, favorites, or wants to compare their saves.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      sort: {
        type: Type.STRING,
        enum: ['date_saved', 'price_asc', 'price_desc'],
        description: 'Sort order for results',
      },
      limit: {
        type: Type.INTEGER,
        description: 'Maximum number of results (default 5, max 10)',
      },
    },
  },
};
```

Add to `CRIBAI_TOOLS` array and register in `executor.ts` HANDLERS map.

### Notification Page Data Fetch
```typescript
// apps/web/app/(campus)/[campusSlug]/notifications/page.tsx
const { data: notifications } = await supabase
  .from('notifications')
  .select('*')
  .eq('user_id', user.id)
  .order('created_at', { ascending: false })
  .limit(50);
```

### Mark Notifications as Read
```typescript
// Client-side: mark all as read when page loads or bell dropdown opens
await supabase
  .from('notifications')
  .update({ is_read: true })
  .eq('user_id', userId)
  .eq('is_read', false);
```

### "Ask CribAI" Pre-fill via Query Params
**Recommended approach:** Use query params. This is stateless, works with SSR, and survives page refreshes.

```tsx
// On detail page:
<Link href={`/${campusSlug}/cribai?about=${listing.id}`}>
  Ask CribAI about this place
</Link>

// In CribAI page, read searchParams and pre-populate input:
const aboutListingId = searchParams?.about;
if (aboutListingId) {
  // Fetch listing name and set initial message:
  // "Tell me about the listing at [address]"
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom WebSocket | Supabase Realtime postgres_changes | Supabase 2.x | No custom WS server needed |
| SWR/React Query polling | Server Components + Realtime | Next.js 15 App Router | Initial data from server, live updates from Realtime |
| Custom toggle animation | CSS transitions | Always | No animation library needed for simple toggles |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + happy-dom |
| Config file | `apps/web/vitest.config.ts`, `packages/ai/vitest.config.ts`, `services/scraper/vitest.config.ts` |
| Quick run command | `pnpm --filter @campusnest/web test -- --run` |
| Full suite command | `pnpm -r test` |

### Phase Requirements Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LIST-01 | Save/unsave toggle creates/deletes DB row | unit | `pnpm --filter @campusnest/web test -- --run lib/__tests__/saved-listings.test.ts` | Wave 0 |
| LIST-01 | Saved listings page fetches user's saves | integration | Manual Playwright test | Wave 0 |
| LIST-02 | Price change detector identifies changes | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/price-change-detector.test.ts` | Wave 0 |
| LIST-02 | Notification creation for saved listing users | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/price-change-detector.test.ts` | Wave 0 |
| LIST-02 | Bell badge shows unread count | unit | `pnpm --filter @campusnest/web test -- --run components/__tests__/notification-bell.test.tsx` | Wave 0 |
| LIST-03 | Detail page renders photo gallery, map, amenities | unit | `pnpm --filter @campusnest/web test -- --run __tests__/listing-detail.test.tsx` | Wave 0 |
| LIST-04 | Freshness badge displays correctly | unit | Existing FreshnessBadge already tested implicitly | Existing |
| AI-TOOL | get_saved_listings returns user's saves | unit | `pnpm --filter @campusnest/ai test -- --run tools/__tests__/get-saved-listings.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm --filter @campusnest/web test -- --run`
- **Per wave merge:** `pnpm -r test`
- **Phase gate:** Full suite green before verify

### Wave 0 Gaps
- [ ] `services/scraper/__tests__/price-change-detector.test.ts` -- covers LIST-02 detection logic
- [ ] `packages/ai/src/tools/__tests__/get-saved-listings.test.ts` -- covers AI tool
- [ ] `apps/web/lib/__tests__/saved-listings.test.ts` -- covers save/unsave helper logic
- [ ] Migration `007_saved_listings_notifications.sql` -- schema must exist before any tests

## Open Questions

1. **Supabase Realtime table enablement**
   - What we know: Realtime requires `ALTER PUBLICATION supabase_realtime ADD TABLE notifications`
   - What's unclear: Whether this is already handled by Supabase's auto-configuration or needs explicit migration
   - Recommendation: Include it in the migration SQL explicitly -- it's idempotent

2. **Saved listing count for nav badge**
   - What we know: Badge should show count of saved listings that have had price changes (not total saves)
   - What's unclear: Best query pattern -- join saved_listings with notifications, or maintain a separate counter
   - Recommendation: Query `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false AND type IN ('price_decrease', 'price_increase')` for the badge. Simple, accurate, uses the partial index.

3. **ListingCard prop expansion**
   - What we know: Adding the heart button requires new props (campusId, userId, savedListingIds)
   - What's unclear: Whether to thread these through as props or use React Context
   - Recommendation: Use props. The parent page already has all this data. Context adds indirection for no benefit here since there's only one level of nesting.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: All migration files (001-006), `run.ts`, `lifecycle.ts`, `listing-card.tsx`, `listing-photo-gallery.tsx`, `chat-map-block.tsx`, `auth-nav.tsx`, `mobile-nav.tsx`, `freshness-badge.tsx`, tool system files
- Supabase JS documentation: Realtime postgres_changes, RLS policies, relational queries

### Secondary (MEDIUM confidence)
- Supabase Realtime publication enablement pattern (standard Supabase practice)

### Tertiary (LOW confidence)
- None -- all findings verified against codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in the project, verified by reading package dependencies and existing components
- Architecture: HIGH - schema patterns copied from existing migrations (tour_requests, profiles), tool pattern from existing handlers
- Pitfalls: HIGH - identified from reading actual code (Link wrapping, upsert ordering, service role behavior)
- Price detection pipeline: HIGH - read full scraper run.ts and lifecycle.ts, clear integration point identified

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable stack, no fast-moving dependencies)

