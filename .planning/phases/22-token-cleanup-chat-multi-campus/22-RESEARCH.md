# Phase 22: Token Cleanup + Chat Multi-Campus - Research

**Researched:** 2026-03-11
**Domain:** Design token architecture (CSS vs TypeScript), React context campus-awareness
**Confidence:** HIGH

## Summary

This phase closes two gap items from the v1.1 milestone audit. The first is a file hygiene issue: `apps/web/lib/design-tokens.ts` is an orphaned TypeScript module — it exports color, radius, shadow, spacing, and typography constants but is imported by zero components. The file's own docstring states it is "mirrored" from `globals.css`, which is the actual runtime source. The second gap is a hardcoded `campusSlug: 'uw-madison'` in `ChatProvider.tsx`, which was deferred from Phase 18. The fix requires deriving the slug from the already-available `CampusProvider` context or from URL params.

Both items are self-contained. Neither requires new libraries, database schema changes, or API changes. The total blast radius is small: one context file modification and a decision about the token file.

**Primary recommendation:** Delete `design-tokens.ts` (CSS custom properties are the canonical source) OR wire it into at least one component that uses Framer Motion / chart colors programmatically. Make `ChatProvider` accept an optional `campusSlug` prop with a fallback, populated by the campus layout.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DESIGN-05 | Design tokens bridge existing CSS variables with shadcn/ui token system without breaking build | globals.css already IS the bridge via `@theme inline` block; design-tokens.ts is orphaned and duplicates some values with minor divergences |
| EXPL-04 | Floating AI button opens CribAI as slide-over chat panel (not a separate page) | ChatProvider is in root layout; panel mounts on explore page; campusSlug fix is the remaining gap |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| CSS Custom Properties (`globals.css`) | Native | Runtime design tokens for Tailwind/shadcn | Already the single runtime source; `@theme inline` block maps to Tailwind color utilities |
| React Context (`campus-context.tsx`) | — | `useCampus()` hook gives `CampusConfig` including `slug` | Already consumed by all campus-scoped components |
| Vitest + happy-dom | Existing config | Unit tests for ChatProvider changes | Already configured; `components/**/__tests__/` is on the include path |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TypeScript `as const` objects | — | Programmatic token access (Framer Motion, chart libs) | Only if a component genuinely needs a JS-land color constant |
| `usePathname` / `useParams` (Next.js) | 15 | Alternative source for campusSlug in client components | Fallback when ChatProvider is used outside CampusProvider tree |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Deleting design-tokens.ts | Integrating it into one component | Deletion is simpler and honest; integration only makes sense if Framer Motion or charts genuinely need JS-land colors (not currently the case) |
| Prop-drilling campusSlug into ChatProvider | Reading from `useCampus()` inside ChatProvider | `useCampus()` would throw outside the campus route tree; prop approach is safer for the root-layout mount point |

## Architecture Patterns

### Recommended Project Structure
No new folders are required. Changes are:
```
apps/web/
├── lib/
│   └── design-tokens.ts        # DELETE (or add one meaningful import)
├── components/chat/
│   └── ChatProvider.tsx         # MODIFY — accept campusSlug prop
├── app/
│   └── layout.tsx               # MODIFY — no longer passes ChatProvider here (or passes slug)
│   └── (campus)/[campusSlug]/layout.tsx  # MODIFY — mount ChatProvider here with slug
```

### Pattern 1: Prop-Injected campusSlug (Recommended)

**What:** ChatProvider accepts an optional `campusSlug` prop. The root `layout.tsx` does NOT mount ChatProvider directly (it moves down to the campus layout) — or it passes `campusSlug` as a prop. The campus layout, which already has the slug from params, passes it in.

**When to use:** ChatProvider is currently in root layout — moving it to campus layout would break any usage outside the campus route tree. The cleanest option is to accept the prop and default to a safe fallback.

**Example:**
```typescript
// ChatProvider.tsx — new interface
interface ChatProviderProps {
  readonly children: ReactNode;
  readonly campusSlug?: string;   // injected by layout; defaults to empty string
}

export function ChatProvider({ children, campusSlug = '' }: ChatProviderProps) {
  // campusSlug used in sendMessage body instead of hardcoded 'uw-madison'
}
```

```typescript
// app/(campus)/[campusSlug]/layout.tsx — campus layout wraps with slug
// ChatProvider is already in root layout; pass slug via a separate context
// OR: lift ChatProvider to campus layout and remove from root layout
```

**The cleanest architectural solution** given the current tree is:
- Remove `ChatProvider` from `app/layout.tsx`
- Add `ChatProvider campusSlug={campusSlug}` inside `app/(campus)/[campusSlug]/layout.tsx`
- This scopes chat correctly to campus routes where it's actually used

**Important constraint:** The explore page (`(main)/explore`) does NOT live under `(campus)/[campusSlug]` — it is under `(main)`. The AIChatButton and AIChatPanel are on the explore page. This means ChatProvider cannot be moved solely to the campus layout without also providing it under `(main)`. Verify which layout tree the explore page's chat belongs to before moving the provider.

### Pattern 2: Token Resolution Decision Tree

**What:** Decide definitively whether design-tokens.ts stays or goes.

**Decision logic:**
```
Does any component import from lib/design-tokens?
  NO (confirmed) →
    Does any component need JS-land color access (Framer Motion, Canvas, Chart.js)?
      NO → DELETE design-tokens.ts
      YES → Add import to that component, keep file
    Does globals.css already define the same values?
      YES (confirmed, with minor value divergences) → DELETE is safe
```

**Value divergence found (HIGH confidence — direct file inspection):**

| Token | design-tokens.ts | globals.css |
|-------|-----------------|-------------|
| `colors.primary[700]` | `#0D7377` | `#0f766e` |
| `colors.secondary[500]` | `#D4A017` | `#f59e0b` |
| `colors.secondary[600]` | `#d97706` | `#d97706` (same) |

The primary-700 value differs between the two files. The CSS custom property `--primary-700: #0f766e` in globals.css is the value actually rendered in the browser. The TS constant `#0D7377` is the "brand intent" value. If design-tokens.ts is kept, this divergence must be resolved. If deleted, globals.css wins — which is the correct single source.

### Anti-Patterns to Avoid

- **Keeping design-tokens.ts as a "reference" without importing it:** The file has zero consumers and will continue to drift from globals.css. Remove it or use it.
- **Reading campusSlug from `useCampus()` inside ChatProvider:** ChatProvider is currently mounted at the root layout, above the CampusProvider tree. `useCampus()` would throw outside campus routes.
- **Adding a `usePathname` hack to extract campusSlug from URL in ChatProvider:** Fragile — route structure can change. Prop injection is explicit and testable.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token single-source-of-truth | Custom sync scripts between TS and CSS | Just delete the TS file | CSS custom properties + shadcn `@theme inline` is already the authoritative layer |
| Campus slug access in client context | Manual URL parsing or cookie reads | Prop injection from server layout | Layout server components have params; prop down |

**Key insight:** The "token bridge" for DESIGN-05 is already implemented in `globals.css` via the `@theme inline` block (lines 361–400). That block maps every `--variable` to a Tailwind color utility, satisfying the shadcn/ui integration requirement. No additional TypeScript bridging is needed.

## Common Pitfalls

### Pitfall 1: Explore Page Chat Is Under (main), Not (campus)
**What goes wrong:** Moving ChatProvider to campus layout would make AIChatButton/AIChatPanel on the explore page lose their context (it would throw "useChatContext must be used within a ChatProvider").
**Why it happens:** The explore page is at `app/(main)/explore/page.tsx` — the `(main)` route group. ChatProvider in `app/layout.tsx` covers both route groups.
**How to avoid:** Either keep ChatProvider in root layout (passing campusSlug via prop), or provide ChatProvider in BOTH campus layout AND main layout. The prop approach on the root-level ChatProvider is simpler.
**Warning signs:** "useChatContext must be used within a ChatProvider" error on /explore.

### Pitfall 2: Test Expects Hardcoded 'uw-madison'
**What goes wrong:** The existing test `ChatProvider.test.tsx` at line 98 asserts `expect(callBody.campusSlug).toBe('uw-madison')`. After the fix, this test will fail.
**Why it happens:** The test was written against the hardcoded behavior.
**How to avoid:** Update the test to pass a campusSlug prop and assert against the passed value (empty string default or the prop value).
**Warning signs:** Vitest failure on the `sendMessage POSTs to /api/ai/cribai with correct body` test case.

### Pitfall 3: Token Value Divergence Causes Visual Regression
**What goes wrong:** The TS file uses `#0D7377` for primary-700; globals.css uses `#0f766e`. If a component was secretly using the TS constant (e.g., via a copy-paste), deleting the file would reveal the discrepancy.
**Why it happens:** The file was authored independently from globals.css.
**How to avoid:** Confirm zero imports before deleting. The grep result shows zero component imports — only `tsconfig.tsbuildinfo` and `PHASE_10_COMPLETE.md` reference the filename.
**Warning signs:** Build error after deletion (TypeScript can't find the module) would be the early indicator, though with zero importers this should not occur.

### Pitfall 4: campusSlug Defaults to Empty String on Non-Campus Routes
**What goes wrong:** If ChatProvider defaults `campusSlug` to `''`, and a user triggers a chat from a non-campus route, the API call sends `campusSlug: ''`, which the CribAI endpoint may not handle.
**Why it happens:** ChatProvider is in root layout, above campus context.
**How to avoid:** Either (a) only mount AIChatButton within campus pages (current design intent), or (b) have the API route handle empty slug gracefully.

## Code Examples

Verified patterns from direct codebase inspection:

### Accessing campusSlug in Campus Layout (Server Component)
```typescript
// Source: apps/web/app/(campus)/[campusSlug]/layout.tsx (line 21)
const { campusSlug } = await params;
// campusSlug is the validated route segment, e.g. 'uw-madison'
```

### Passing campusSlug to ChatProvider (Proposed)
```typescript
// In app/layout.tsx — root layout stays as ChatProvider home
// Change ChatProvider signature to accept optional prop

// In app/(campus)/[campusSlug]/layout.tsx
// Wrap ChatProvider with campus-specific slug via a sibling or lifting approach
// OR: just pass as prop to root ChatProvider through a different mechanism
```

**Architecture note:** Because Next.js App Router layouts are nested, `app/layout.tsx` is the parent of `(campus)/[campusSlug]/layout.tsx`. The root layout cannot receive campus route params — it is rendered for all routes. The cleanest solution without moving ChatProvider is to have the explore page (or a wrapper component on explore) itself hold its own ChatProvider with the correct slug, while the root-level ChatProvider serves as a shell for non-campus usage.

**Alternative that avoids layout restructuring:**
```typescript
// ChatProvider exposes a setCampusSlug setter via context
// The campus layout or explore page calls it on mount via useEffect
// This is the "mutable context" pattern — acceptable for a slug that won't change mid-session
```

### Existing useCampus Hook (Available for Client Components)
```typescript
// Source: apps/web/lib/campus-context.tsx
export function useCampus(): CampusConfig {
  const ctx = useContext(CampusContext);
  if (!ctx) throw new Error('useCampus must be used within a CampusProvider');
  return ctx;
}
// ctx.slug is the campusSlug string
```

### Token File Deletion Verification
```bash
# Verify zero real imports before deleting
grep -r "design-tokens" apps/web --include="*.ts" --include="*.tsx"
# Expected: zero hits (confirmed via research)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TS design token objects as source of truth | CSS custom properties + `@theme inline` as source | shadcn/ui v2 + Tailwind v4 era | TS constants are now redundant for color system; only needed for JS-land use (canvas, framer-motion) |
| Global hardcoded campus context | Per-campus provider from route params | Phase 12+ | ChatProvider is the last holdout with a hardcoded campus value |

**Deprecated/outdated:**
- `design-tokens.ts` as documented: The file header says it is mirrored from CSS; the truth is it has drifted and is unused. Treating it as authoritative would be incorrect.

## Open Questions

1. **Where should ChatProvider live after the fix?**
   - What we know: Currently in root layout; campus layout has `campusSlug`; explore page is under `(main)` not `(campus)`
   - What's unclear: Does chat on the explore page need campus context at all? The explore page currently has `AIChatButton` and `AIChatPanel` but no campus-specific content in the mock data.
   - Recommendation: Accept `campusSlug` as a prop on ChatProvider with `''` default. Mount ChatProvider in campus layout with the real slug. Remove from root layout if no non-campus pages use chat. If explore page keeps AIChatButton, it needs its own ChatProvider or a campus-agnostic session.

2. **Design-tokens.ts: delete or integrate?**
   - What we know: Zero component imports. Some values diverge from globals.css. Framer Motion animations in the codebase use CSS variable references, not TS constants.
   - What's unclear: Future roadmap — will charts or canvas elements ever need programmatic color access?
   - Recommendation: Delete. If a future chart component needs colors, it can read CSS variables via `getComputedStyle` or import from a purpose-built file at that time.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x + @testing-library/react + happy-dom |
| Config file | `apps/web/vitest.config.ts` |
| Quick run command | `pnpm --filter web test -- --run components/chat` |
| Full suite command | `pnpm --filter web test -- --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DESIGN-05 | design-tokens.ts deleted or imported by component; no duplicate token values | unit (build check) | `pnpm --filter web build` — tsc compile must pass with zero import errors | N/A — deletion verified by grep |
| EXPL-04 | ChatProvider sends correct campusSlug in API body | unit | `pnpm --filter web test -- --run components/chat/__tests__/ChatProvider.test.tsx` | ✅ exists, needs update |
| EXPL-04 | ChatProvider accepts campusSlug prop | unit | `pnpm --filter web test -- --run components/chat/__tests__/ChatProvider.test.tsx` | ✅ exists, needs update |

### Sampling Rate
- **Per task commit:** `pnpm --filter web test -- --run components/chat`
- **Per wave merge:** `pnpm --filter web test -- --run`
- **Phase gate:** Full suite green + `pnpm --filter web build` passes before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements. The `ChatProvider.test.tsx` file exists and covers the relevant behaviors. Tests need updating, not creation.

The one test case that will need updating: line 98 in `ChatProvider.test.tsx` asserts `campusSlug` equals `'uw-madison'`. It must be updated to assert against the new prop value.

## Sources

### Primary (HIGH confidence)
- Direct file inspection: `apps/web/lib/design-tokens.ts` — full content read
- Direct file inspection: `apps/web/app/globals.css` — full content read, confirmed `@theme inline` block and `--primary-700` value
- Direct file inspection: `apps/web/components/chat/ChatProvider.tsx` — confirmed hardcoded `'uw-madison'` at line 58
- Direct file inspection: `apps/web/components/chat/__tests__/ChatProvider.test.tsx` — confirmed test at line 98 asserts `'uw-madison'`
- Direct file inspection: `apps/web/lib/campus-context.tsx` — confirmed `useCampus()` hook and `CampusConfig.slug` field
- Direct file inspection: `apps/web/app/(campus)/[campusSlug]/layout.tsx` — confirmed campusSlug availability from params (line 21)
- Grep search: zero imports of `design-tokens` in `.ts`/`.tsx` files within `apps/web/`

### Secondary (MEDIUM confidence)
- Route structure analysis: explore page at `(main)/explore` is NOT under `(campus)/[campusSlug]` — verified by directory listing
- STATE.md decision record: "[Phase 18]: campusSlug hardcoded to uw-madison in ChatProvider for Phase 18 scope" — confirms this was intentional deferral

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — direct codebase inspection, no external dependencies needed
- Architecture: HIGH — all facts derived from existing code; the open question is a design choice, not a technical uncertainty
- Pitfalls: HIGH — all pitfalls identified from direct code reading (test assertion at line 98 is concrete, not speculative)

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable codebase; no fast-moving external dependencies)
