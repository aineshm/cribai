# Sub-project 3: Listing Creator Edit + Photo Upload

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow listing creators to edit their sublease details and upload photos directly on the listing page. Show "Posted by [name]" attribution for sublease listings.

**Architecture:** New PATCH endpoint for listing edits, photo upload using existing Supabase Storage infrastructure (`listing-photos` bucket + `uploadListingPhotos` helper). Creator detection via `creator_id` column (already exists). Admin bypass via ADMIN_EMAILS env var (already exists server-side).

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL + Storage), TypeScript, Tailwind, Zod

**Spec:** `docs/superpowers/specs/2026-03-18-cribai-redesign-design.md` (Section 3)

---

### Task 1: "Posted by" attribution on listing detail

**Files:**
- Modify: `apps/web/app/(main)/listing/[id]/page.tsx` (pass creator data)
- Modify: `apps/web/app/(main)/listing/[id]/ListingDetailClient.tsx` (render attribution)
- Create: `apps/web/components/listing/PostedByBadge.tsx`

- [ ] **Step 1: Write test for PostedByBadge**

```typescript
// apps/web/components/listing/__tests__/PostedByBadge.test.tsx
import { render, screen } from '@testing-library/react';
import { PostedByBadge } from '../PostedByBadge';

describe('PostedByBadge', () => {
  it('shows display name when available', () => {
    render(<PostedByBadge source="sublease" creatorName="Jane D." />);
    expect(screen.getByText(/Posted by Jane D\./)).toBeInTheDocument();
  });

  it('shows "verified student" when no name', () => {
    render(<PostedByBadge source="sublease" creatorName={null} />);
    expect(screen.getByText(/Posted by a verified student/)).toBeInTheDocument();
  });

  it('renders nothing for non-sublease listings', () => {
    const { container } = render(<PostedByBadge source="zillow" creatorName={null} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm -F @campusnest/web test -- --run PostedByBadge`
Expected: FAIL

- [ ] **Step 3: Implement PostedByBadge component**

```tsx
// apps/web/components/listing/PostedByBadge.tsx
'use client';

interface PostedByBadgeProps {
  readonly source: string;
  readonly creatorName: string | null;
}

export function PostedByBadge({ source, creatorName }: PostedByBadgeProps) {
  if (source !== 'sublease') return null;

  const displayName = creatorName || 'a verified student';

  return (
    <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full w-fit">
      <span className="font-medium">Posted by {displayName}</span>
    </div>
  );
}
```

- [ ] **Step 4: Fetch creator display name in server component**

In `page.tsx`, after fetching listing, if `source === 'sublease'` and `creator_id` exists, fetch the user's display name:

```typescript
let creatorName: string | null = null;
if (listing.source === 'sublease' && listing.creator_id) {
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('display_name')
    .eq('id', listing.creator_id)
    .single();
  creatorName = profile?.display_name ?? null;
}
```

Pass `creatorName` to `ListingDetailClient`.

- [ ] **Step 5: Render PostedByBadge in ListingDetailClient**

Add `<PostedByBadge source={listing.source} creatorName={creatorName} />` below the address.

- [ ] **Step 6: Run tests**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm -F @campusnest/web test -- --run`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/listing/PostedByBadge.tsx apps/web/app/\(main\)/listing/\[id\]/
git commit -m "feat: show 'Posted by' attribution on sublease listings"
```

---

### Task 2: PATCH /api/listings/[id] endpoint

**Files:**
- Create: `apps/web/app/api/listings/[id]/route.ts`
- Create: `apps/web/app/api/listings/[id]/__tests__/route.test.ts`

- [ ] **Step 1: Write test for PATCH endpoint**

```typescript
describe('PATCH /api/listings/[id]', () => {
  it('returns 401 without auth', async () => { ... });
  it('returns 403 if not creator or admin', async () => { ... });
  it('returns 200 and updates listing for creator', async () => { ... });
  it('returns 200 for admin user', async () => { ... });
  it('validates input with Zod schema', async () => { ... });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement PATCH endpoint**

```typescript
// apps/web/app/api/listings/[id]/route.ts
import { createServerClient } from '@campusnest/supabase/server';
import { createServiceClient } from '@campusnest/supabase/service';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean);

const updateSchema = z.object({
  address: z.string().min(5).max(200).optional(),
  rent_monthly: z.number().min(0).max(10000).optional(),
  bedrooms: z.number().min(0).max(10).optional(),
  bathrooms: z.number().min(0).max(10).optional(),
  sqft: z.number().positive().optional(),
  description: z.string().max(2000).optional(),
  amenities: z.array(z.string()).optional(),
  available_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  contact_email: z.string().email().optional(),
  photo_urls: z.array(z.string().url()).optional(),
}).strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = createServiceClient();

  // Fetch listing to check ownership
  const { data: listing } = await serviceClient
    .from('listings')
    .select('creator_id')
    .eq('id', id)
    .single();

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const isCreator = listing.creator_id === user.id;
  const isAdmin = ADMIN_EMAILS.includes(user.email ?? '');

  if (!isCreator && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const { error: updateError } = await serviceClient
    .from('listings')
    .update(parsed.data)
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm -F @campusnest/web test -- --run`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/listings/\[id\]/route.ts apps/web/app/api/listings/\[id\]/__tests__/
git commit -m "feat: PATCH /api/listings/[id] for creator/admin editing"
```

---

### Task 3: Creator edit controls on listing detail page

**Files:**
- Create: `apps/web/components/listing/EditableField.tsx`
- Create: `apps/web/components/listing/EditListingButton.tsx`
- Modify: `apps/web/app/(main)/listing/[id]/ListingDetailClient.tsx`
- Modify: `apps/web/app/(main)/listing/[id]/page.tsx`

- [ ] **Step 1: Create EditableField component**

Inline editable field — click to edit, save/cancel buttons. Used for each editable listing field.

- [ ] **Step 2: Create EditListingButton component**

Toggle button that switches listing detail into edit mode. Only visible when `isCreatorOrAdmin` is true.

- [ ] **Step 3: Wire edit mode into ListingDetailClient**

Add `isCreatorOrAdmin` prop (computed server-side). When edit mode is active, render EditableField wrappers around each field. On save, PATCH to `/api/listings/[id]`.

- [ ] **Step 4: Pass ownership info from server component**

In `page.tsx`, compute `isCreatorOrAdmin` and pass to client:

```typescript
const isCreatorOrAdmin = user && (
  listing.creator_id === user.id ||
  ADMIN_EMAILS.includes(user.email ?? '')
);
```

- [ ] **Step 5: Build check**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/listing/ apps/web/app/\(main\)/listing/
git commit -m "feat: inline edit controls for listing creators and admins"
```

---

### Task 4: Photo upload on listing page

**Files:**
- Create: `apps/web/components/listing/PhotoUploader.tsx`
- Modify: `apps/web/app/(main)/listing/[id]/ListingDetailClient.tsx`

- [ ] **Step 1: Create PhotoUploader component**

Reuses existing `uploadListingPhotos` from `lib/upload-photos.ts`. Features:
- "Add Photos" button (only shown to creator/admin)
- File input (accept images, max 10)
- Upload progress indicator
- After upload, PATCH listing with updated photo_urls array
- Max 10 photos per listing

- [ ] **Step 2: Wire into ListingDetailClient**

Show PhotoUploader when `isCreatorOrAdmin && editMode`. Display below existing photos or as empty state prompt.

- [ ] **Step 3: Build check**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/listing/PhotoUploader.tsx apps/web/app/\(main\)/listing/
git commit -m "feat: photo upload for listing creators on detail page"
```

---

### Task 5: Full build + test + E2E verification

- [ ] **Step 1: Run full build**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm run build`
Expected: PASS

- [ ] **Step 2: Run full test suite**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm test -- --run`
Expected: ALL PASS

- [ ] **Step 3: Run E2E tests**

Run: `cd /Users/aineshmohan/Developer/ai-real-estate-agent && pnpm -F @campusnest/web e2e`
Expected: ALL PASS
