# Phase 20: Concierge Mount + Design Cleanup - Research

**Researched:** 2026-03-11
**Domain:** Next.js 15 Route Group Layouts, React Context Provider mounting, Lucide icon migration
**Confidence:** HIGH

---

## Summary

Phase 20 has two entirely distinct jobs: (1) create a `(main)/layout.tsx` that wraps all v1.1 route group pages with `ConciergeShell` (which internally composes `ConciergeProvider` + `ConciergeSidebar`), adding a shared nav bar that includes `ConciergeNavButton`; and (2) replace the remaining 14 inline `<svg>` elements across 10 component files with named Lucide icon imports.

The core technical challenge is that the `(main)` route group currently has no `layout.tsx`. There is a fully working reference implementation in `apps/web/app/(campus)/[campusSlug]/layout.tsx` that mounts `ConciergeShell` and renders `ConciergeNavButton` in a sticky nav. The (main) layout must follow that same pattern but simplified — no Supabase auth queries, no campus context, since these are v1.1 mock-data pages.

The Lucide migration is mechanical. All 10 files contain recognisable Heroicon path data that maps directly to standard Lucide icons. `lucide-react@^0.577.0` is already installed and used widely throughout the project. No new packages are required for either task.

**Primary recommendation:** Create `(main)/layout.tsx` modelled on the campus layout's ConciergeShell + nav pattern. Then do the SVG swap file-by-file, verifying with `grep -rn "<svg" apps/web/components/` after each.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AGENT-01 | User sees AI Concierge sidebar with task-based mission cards showing status indicators; ConciergeNavButton visible in main nav | `ConciergeShell` already wraps `ConciergeProvider` + `ConciergeSidebar`; `ConciergeNavButton` already uses `useConcierge()`. Only missing piece: a `(main)/layout.tsx` that renders both. |
| DESIGN-03 | All pages use Lucide icons instead of inline Heroicon SVGs | 14 inline SVGs across 10 component files identified and mapped to Lucide equivalents. `lucide-react@^0.577.0` installed. |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lucide-react | ^0.577.0 | Icon component library | Already installed; all new components use it; replaces inline Heroicons |
| Next.js App Router | 15.x | Route group layouts | `layout.tsx` files in route groups are the canonical Next.js way to add shared UI |
| React Context | 18.x | ConciergeProvider state | Already implemented; just needs mounting higher up the tree |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @testing-library/react | ^16.3.2 | Unit tests for layout + icon verification | Tests for the new layout wrapper and updated components |
| vitest | ^2.1.9 | Test runner | Existing infrastructure; run with `pnpm --filter web vitest run` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `(main)/layout.tsx` | Mount in root `layout.tsx` | Root layout wraps everything including landing/auth — ConciergeProvider would exist on pages where it has no place. Route group layout is correct scoping. |
| `ConciergeShell` wrapper | `ConciergeProvider` + `ConciergeSidebar` separately | ConciergeShell already composes both; single import is cleaner and matches campus layout precedent. |

---

## Architecture Patterns

### Recommended Project Structure

The existing `(campus)/[campusSlug]/layout.tsx` is the reference. Phase 20 adds:

```
apps/web/app/
├── (main)/
│   ├── layout.tsx          ← NEW: ConciergeShell + shared nav
│   ├── explore/page.tsx    (no change)
│   ├── listing/[id]/       (no change)
│   ├── post/page.tsx       (no change)
│   └── profile/page.tsx    (no change)
```

### Pattern 1: Route Group Layout with ConciergeShell

**What:** A server component `layout.tsx` placed in `(main)/` that renders a sticky nav bar with `ConciergeNavButton` and wraps `{children}` in `ConciergeShell`.

**When to use:** Any time a subset of Next.js routes need shared UI without affecting routes outside the group.

**Exact reference (from `(campus)/[campusSlug]/layout.tsx`, lines 115-148):**

```tsx
// Source: apps/web/app/(campus)/[campusSlug]/layout.tsx (existing implementation)
return (
  <ConciergeShell>
    <div className="min-h-[100dvh]">
      <nav className="sticky top-0 z-50 border-b border-[var(--surface-200)] bg-white/80 backdrop-blur-sm px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]">
              CampusNest
            </Link>
          </div>
          <div className="hidden md:flex items-center gap-6">
            {/* nav links */}
            <ConciergeNavButton />
          </div>
        </div>
      </nav>
      {children}
    </div>
  </ConciergeShell>
);
```

**Key constraint:** `ConciergeShell` is a `'use client'` component (it uses `ConciergeProvider` which holds `useState`). The layout.tsx itself can be a server component — Next.js allows server components to render client component children.

**Key constraint:** `ConciergeNavButton` calls `useConcierge()`, which requires being inside `ConciergeProvider`. Because `ConciergeShell` renders `ConciergeProvider` above `{children}`, the nav must be rendered *inside* `ConciergeShell`, not as a sibling above it.

Correct nesting (matches campus layout):
```
ConciergeShell
  └── ConciergeProvider (inside Shell)
        ├── <nav>...</nav>     ← ConciergeNavButton here — CORRECT
        ├── {children}
        └── ConciergeSidebar
```

Incorrect nesting (ConciergeNavButton outside provider):
```
<nav>
  <ConciergeNavButton />   ← throws: "useConcierge must be used within ConciergeProvider"
</nav>
<ConciergeShell>
  {children}
</ConciergeShell>
```

### Pattern 2: Lucide Icon Swap

**What:** Replace `<svg>...</svg>` blocks with single `import { IconName } from 'lucide-react'` and render `<IconName className="..." />`.

**When to use:** Every inline SVG in a component file.

**Example (from `listing-filters.tsx` line 145 → after):**

```tsx
// Before:
<svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
</svg>

// After:
import { X } from 'lucide-react';
<X className="h-3.5 w-3.5" />
```

**Size class convention already used in the project:** `className="size-4"` (Tailwind v4 shorthand) or `className="h-N w-N"` — both work. Match the existing pattern in each file.

### Anti-Patterns to Avoid

- **Placing ConciergeNavButton outside ConciergeShell:** `useConcierge()` will throw. Always nest it inside `ConciergeShell` → `ConciergeProvider`.
- **Adding `'use client'` to the layout unnecessarily:** The layout can be a server component. Only `ConciergeShell` and `ConciergeNavButton` need to be client components, and they already are.
- **Leaving Heart fill/stroke dynamic logic when swapping to Lucide:** `heart-button.tsx` uses `fill` and `stroke` attributes dynamically on the SVG. Lucide's `Heart` icon accepts `className` but not arbitrary SVG attributes. The swap needs inline `style` or separate filled/outlined icons (`Heart` + a filled variant trick using `fill-current` CSS).
- **Forgetting to update lucide mock in concierge test:** `concierge.test.tsx` has a manual `vi.mock('lucide-react', ...)` that lists specific icon names. If the layout test imports new icons not in that mock, the mock does not need to be shared — new test files will have their own mocks.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Inline SVG bell icon (notification-bell.tsx) | Custom SVG | `Bell` from lucide-react | Exact icon; consistent size/stroke via className |
| Inline SVG chat bubble (conversation-sidebar.tsx) | Custom SVG | `MessageSquare` from lucide-react | Path matches Heroicon "chat-bubble-left-ellipsis" shape |
| Inline check mark (share-button.tsx) | Custom SVG | `Check` from lucide-react | Identical M5 13l4 4L19 7 path |
| Inline share icon (share-button.tsx) | Custom SVG | `Share2` from lucide-react | Heroicon "share" maps to Share2 |
| Inline close/X icons (listing-filters.tsx, listing-photo-gallery.tsx) | Custom SVG | `X` from lucide-react | Standard close icon |
| Inline prev/next arrows (listing-photo-gallery.tsx) | Custom SVG | `ChevronLeft`, `ChevronRight` from lucide-react | M15 19l-7-7 7-7 is ChevronLeft |
| Inline photo placeholder (listing-card.tsx, listing-detail) | Custom SVG | `ImageIcon` from lucide-react | Image placeholder icon |
| Inline AI sparkle (cribai-chat.tsx) | Custom SVG | `Sparkles` from lucide-react | Already used in ConciergeNavButton |
| Inline send arrow (cribai-chat.tsx) | Custom SVG | `Send` from lucide-react | Already used in SteeringBar |
| Inline location pin (listing-location-map.tsx) | Custom SVG | `MapPin` from lucide-react | fillRule="evenodd" pin = MapPin |
| Inline check mark (submit-listing-form.tsx) | Custom SVG | `Check` from lucide-react | Same M5 13l4 4L19 7 path |

---

## Common Pitfalls

### Pitfall 1: Heart Button Fill State

**What goes wrong:** `heart-button.tsx` sets `fill={saved ? '#ef4444' : 'none'}` and `stroke={saved ? '#ef4444' : ...}` directly on the SVG element. Lucide's `Heart` does not accept arbitrary SVG props.

**Why it happens:** Lucide components spread `className` and a fixed set of props (`size`, `strokeWidth`, `color`, `absoluteStrokeWidth`) — they do not forward `fill` as a DOM attribute.

**How to avoid:** Use the Lucide `Heart` icon with Tailwind class conditionals:
```tsx
import { Heart } from 'lucide-react';
<Heart
  className={cn(
    iconSize,
    saved ? 'fill-red-500 stroke-red-500' : 'fill-none',
    'transition-transform duration-200',
    animating ? 'animate-heart-pop' : ''
  )}
  strokeWidth={2}
/>
```
Tailwind `fill-red-500` applies `fill: #ef4444`. This preserves the animated heart pop behaviour.

**Warning signs:** TypeScript will warn "Property 'fill' does not exist on type IntrinsicAttributes" if you try to pass fill as a prop to a Lucide component.

### Pitfall 2: ConciergeNavButton Requires ConciergeProvider Ancestor

**What goes wrong:** If the nav bar is rendered as a sibling of `ConciergeShell` rather than a child, `useConcierge()` throws at runtime: "useConcierge must be used within a ConciergeProvider".

**Why it happens:** `ConciergeShell` renders `ConciergeProvider` internally — it does not hoist the provider above itself.

**How to avoid:** Always render the nav **inside** `ConciergeShell`'s children. The campus layout already does this correctly — replicate that pattern exactly.

**Warning signs:** React error boundary catches "useConcierge must be used within a ConciergeProvider" during development navigation.

### Pitfall 3: Server/Client Component Boundary in Layout

**What goes wrong:** Marking `(main)/layout.tsx` as `'use client'` causes the entire layout subtree to become client-rendered, losing server component benefits.

**Why it happens:** Developers copy the `'use client'` directive from child components.

**How to avoid:** `(main)/layout.tsx` does not need `'use client'`. Server components can import and render client components. Only add `'use client'` if the layout itself uses hooks or event handlers — it does not.

### Pitfall 4: Missed SVG Instances in Multi-SVG Files

**What goes wrong:** `listing-photo-gallery.tsx` has 3 SVGs, `share-button.tsx` has 2, `cribai-chat.tsx` has 2. Replacing only the first leaves residual inline SVGs that break the "no inline `<svg>`" grep check.

**Why it happens:** Quick search-and-replace misses non-adjacent occurrences.

**How to avoid:** After editing each file, run `grep -c "<svg" <file>` to confirm count reaches 0. Then run the full grep on the directory.

---

## Code Examples

Verified patterns from existing codebase:

### Minimal (main) Layout Structure

```tsx
// apps/web/app/(main)/layout.tsx
// Source: modelled on apps/web/app/(campus)/[campusSlug]/layout.tsx lines 115-200

import Link from 'next/link';
import { ConciergeShell } from '@/components/concierge/ConciergeShell';
import { ConciergeNavButton } from '@/components/concierge/ConciergeNavButton';

export default function MainLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <ConciergeShell>
      <div className="min-h-[100dvh]">
        <nav className="sticky top-0 z-50 border-b border-[var(--surface-200)] bg-white/80 backdrop-blur-sm px-6 py-4">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <Link
              href="/"
              className="font-[family-name:var(--font-display)] text-xl text-[var(--surface-900)]"
            >
              CampusNest
            </Link>
            <div className="flex items-center gap-6">
              <ConciergeNavButton />
            </div>
          </div>
        </nav>
        {children}
      </div>
    </ConciergeShell>
  );
}
```

### Lucide Icon Swap — Notification Bell

```tsx
// Before (notification-bell.tsx line 68):
<svg className="h-5 w-5 text-[var(--surface-500)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848..." />
</svg>

// After:
import { Bell } from 'lucide-react';
<Bell className="h-5 w-5 text-[var(--surface-500)]" strokeWidth={2} />
```

### Lucide Icon Swap — Gallery Navigation

```tsx
// Before (listing-photo-gallery.tsx lines 114-141):
// ChevronLeft (M15 19l-7-7 7-7)
// ChevronRight (M9 5l7 7-7 7)
// X close (M6 18L18 6M6 6l12 12)

// After:
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
<X className="h-6 w-6" />
<ChevronLeft className="h-5 w-5" />
<ChevronRight className="h-5 w-5" />
```

### Lucide Icon Swap — Heart Button (with fill state)

```tsx
// Source: Lucide className prop + Tailwind fill utilities pattern
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

<Heart
  className={cn(
    iconSize,
    'transition-transform duration-200',
    animating && 'animate-heart-pop',
    saved ? 'fill-red-500 stroke-red-500' : variant === 'overlay' ? 'stroke-white' : 'stroke-current'
  )}
  strokeWidth={2}
/>
```

### Verification Command

```bash
# Confirm zero inline SVGs remain in non-test component files
grep -rn "<svg" apps/web/components/ --include="*.tsx" | grep -v "__tests__" | grep -v ".test."
# Expected: empty output
```

---

## Complete SVG-to-Lucide Mapping

| File | SVG Count | SVG Path Hint | Lucide Icon |
|------|-----------|---------------|-------------|
| `notification-bell.tsx` | 1 | Bell/notification path (M14.857 17.082...) | `Bell` |
| `chat/conversation-sidebar.tsx` | 1 | Chat bubble with dots (M8 10h.01M12 10h.01M16 10h.01M9 16H5...) | `MessageSquare` |
| `share-button.tsx` | 2 | Check (M5 13l4 4L19 7), Share (M7.217 10.907...) | `Check`, `Share2` |
| `listing-photo-gallery.tsx` | 3 | X close (M6 18L18 6), ChevronLeft (M15 19l-7-7), ChevronRight (M9 5l7 7) | `X`, `ChevronLeft`, `ChevronRight` |
| `listing-card.tsx` | 1 | Image placeholder (m2.25 15.75 5.159...) | `ImageIcon` |
| `cribai-chat.tsx` | 2 | Sparkles (M9.813 15.904...), Send (M6 12L3.269...) | `Sparkles`, `Send` |
| `listing-filters.tsx` | 1 | X close (M6 18L18 6M6 6l12 12) | `X` |
| `heart-button.tsx` | 1 | Heart (M21 8.25c0-2.485...) | `Heart` (with fill class) |
| `listing-location-map.tsx` | 1 | Map pin filled (M5.05 4.05a7 7...) | `MapPin` (fill="currentColor" → `fill-current`) |
| `submit-listing-form.tsx` | 1 | Check (M5 13l4 4L19 7) | `Check` |

Total: 14 SVGs across 10 files. Phase description says "8" — this discrepancy is because the audit counted unique SVG blocks at the time of writing; the exact count visible now is 14 occurrences. The success criterion is "no inline `<svg>` elements remain" verified by grep, so the planner should target zero regardless of original count.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ConciergeShell only in (campus) layout | ConciergeShell in (main) layout too | Phase 20 | ConciergeNavButton visible on Explore, Listing, Post, Profile pages |
| Inline Heroicon SVG blobs | Named Lucide imports | Phase 10 (partial) → Phase 20 (complete) | Consistent icon system, tree-shakeable, type-safe |
| `LegacyMission` type (deprecated) | To be removed in Phase 20 per code comments | Phase 16 introduced alias | Phase 20 DOES NOT need to remove LegacyMission — that is backend reconciliation scope (v1.2); the comments say "will be removed in Phase 20" but the actual removal requires the DB-backed component migration which is v1.2 work |

**Deprecated/outdated:**
- `LegacyMission`, `ExecutionLog`, `ActionCard`, `ActionCardType` in `concierge-types.ts` are marked `@deprecated` with "Will be removed in Phase 20". However, removing them would require migrating `ConciergeProvider`, `MissionCard`, `MissionDetail`, etc. to use DB-backed `Mission` type — that is out of scope for this phase. The planner must NOT schedule removal of `LegacyMission` in Phase 20; leave that for the v1.2 backend phase.

---

## Open Questions

1. **Nav links in (main) layout: how many?**
   - What we know: (campus) layout has Listings, CribAI, Share a Listing, Dashboard, Saved, Notifications links — all campus-scoped.
   - What's unclear: (main) pages (Explore, Listing, Post, Profile) are the v1.1 equivalents. Should the (main) nav mirror the campus nav or be simpler?
   - Recommendation: Keep it minimal — just the CampusNest wordmark + ConciergeNavButton. The pages themselves have internal navigation. A full nav can be added in a follow-on phase. The success criterion only requires "ConciergeNavButton visible in main nav".

2. **listing-location-map.tsx uses `fill="currentColor"` on a filled SVG pin**
   - What we know: Lucide's `MapPin` uses `stroke` by default, not fill. The existing map marker is fully filled (no stroke).
   - What's unclear: Whether using MapPin with `fill-current` class visually matches.
   - Recommendation: Use `<MapPin className="h-4 w-4 text-white" fill="currentColor" />` — Lucide does forward standard SVG attributes when passed as props on the component. Alternatively, use `strokeWidth={0} className="h-4 w-4 fill-white"`. Verify visually in dev.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.9 + @testing-library/react + happy-dom |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `pnpm --filter web vitest run components/concierge` |
| Full suite command | `pnpm --filter web test` |
| Estimated runtime | ~3s |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGENT-01 | ConciergeNavButton renders within (main) layout wrapped by ConciergeProvider | unit | `pnpm --filter web vitest run components/concierge` | ✅ (existing concierge.test.tsx covers ConciergeNavButton) |
| AGENT-01 | (main)/layout.tsx renders ConciergeShell + ConciergeNavButton | unit | `pnpm --filter web vitest run app/__tests__` | ❌ Wave 0 — needs `apps/web/__tests__/main-layout.test.tsx` |
| DESIGN-03 | No inline `<svg>` elements in v1.1 component files | grep smoke test | `grep -rn "<svg" apps/web/components/ --include="*.tsx" \| grep -v "__tests__"` | N/A — manual grep |

### Sampling Rate

- **Per task commit:** `pnpm --filter web vitest run components/concierge`
- **Per wave merge:** `pnpm --filter web test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `apps/web/__tests__/main-layout.test.tsx` — covers AGENT-01 layout mounting; test that `ConciergeShell` and `ConciergeNavButton` render in layout
- [ ] `apps/web/vitest.config.ts` already includes `__tests__/**/*.test.{ts,tsx}` — no config change needed

---

## Sources

### Primary (HIGH confidence)

- Direct source code inspection: `apps/web/app/(campus)/[campusSlug]/layout.tsx` — ConciergeShell mount pattern
- Direct source code inspection: `apps/web/components/concierge/ConciergeShell.tsx` — component implementation
- Direct source code inspection: `apps/web/components/concierge/ConciergeProvider.tsx` — context and hook
- Direct source code inspection: `apps/web/components/concierge/ConciergeNavButton.tsx` — nav button implementation
- Direct source code inspection: 10 component files with inline SVGs — exact line numbers and paths identified
- `.planning/v1.1-MILESTONE-AUDIT.md` — authoritative gap documentation (evidence for AGENT-01 and DESIGN-03)
- `apps/web/package.json` — confirmed lucide-react@^0.577.0 installed

### Secondary (MEDIUM confidence)

- Next.js App Router docs pattern: server component layouts wrapping client component children is a well-established pattern with no version-specific risks at Next.js 15.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — lucide-react confirmed installed; Next.js layout pattern confirmed by existing reference implementation
- Architecture: HIGH — existing campus layout provides exact template; no architectural unknowns
- Pitfalls: HIGH — all identified from direct code inspection, not speculation
- SVG mapping: HIGH — paths inspected directly; Lucide equivalents confirmed by icon path recognition

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable libraries, no moving targets)
