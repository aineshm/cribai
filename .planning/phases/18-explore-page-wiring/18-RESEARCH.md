# Phase 18: Explore Page Wiring + Verification — Research

**Researched:** 2026-03-11
**Domain:** Next.js 15 App Router navigation, React Context wiring, SSE streaming, Vitest + Playwright testing
**Confidence:** HIGH — all findings drawn from direct codebase inspection

---

## Summary

Phase 18 is a gap-closure phase. The components (ListingCard, AIChatButton, AIChatPanel, ExploreLayout, ViewToggle, FilterChips) already exist and render correctly. What is missing is:

1. Navigation — ListingCard has no `<Link>` so Explore → Detail flow is dead.
2. Scoping — AIChatButton is mounted in the root layout (every page) not just Explore.
3. AI wiring — ChatProvider.sendMessage returns a hardcoded DEFAULT_RESPONSE instead of calling the real `/api/ai/cribai` SSE endpoint that already exists and works.
4. Tests — Zero unit or E2E tests cover any Explore-specific components.

All four problems are independent and can be parallelised across plans. The CribAI API route (`/api/ai/cribai`) is complete, battle-tested with 25+ unit tests, and streams structured `ChatEvent` objects over SSE. The ChatProvider simply needs to replace its synchronous stub with a proper fetch + ReadableStream consumer.

**Primary recommendation:** Move AIChatButton + AIChatPanel out of the root layout into the Explore page (or its future layout), wire ChatProvider.sendMessage to POST `/api/ai/cribai` with SSE parsing, add a `<Link>` wrapper to ListingCard, and write Vitest unit tests for the three unverified components.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EXPL-01 | User sees split view with listing grid (60%) and interactive map (40%) on desktop | ExploreLayout already implements the 60/40 grid; needs E2E verification test only |
| EXPL-02 | Mobile users toggle List/Map via segmented control | ViewToggle + AnimatePresence logic exists; needs unit test |
| EXPL-03 | Filter chips above results update the listing grid | FilterChips + filterListings logic exists and correct; needs unit test |
| EXPL-04 | Floating AI button opens CribAI slide-over (Explore only) | AIChatButton must move from root layout to Explore page; AIChatPanel must call real API |
| EXPL-05 | ListingCard shows all fields and navigates to /listing/[id] on click | Card content is complete; missing `<Link href="/listing/[id]">` wrapper |
</phase_requirements>

---

## Current Code State (from direct inspection)

### What exists and works

| File | Status | Notes |
|------|--------|-------|
| `apps/web/components/explore/ExploreLayout.tsx` | Complete | 60/40 desktop grid + mobile toggle — no changes needed |
| `apps/web/components/explore/ViewToggle.tsx` | Complete | Exports `ViewMode` type, uses framer-motion layoutId |
| `apps/web/components/explore/FilterChips.tsx` | Complete | AND-logic filtering via `ActiveFilters = ReadonlySet<string>` |
| `apps/web/components/explore/ListingCard.tsx` | Missing Link | All visual fields present; needs `<Link href="/listing/${listing.id}">` wrapping CardContent area |
| `apps/web/components/chat/AIChatButton.tsx` | Misplaced | Renders as `fixed bottom-6 right-6` — mounted in `app/layout.tsx` globally |
| `apps/web/components/chat/AIChatPanel.tsx` | UI complete | Sheet/slide-over UI works; sendMessage stub in provider |
| `apps/web/components/chat/ChatProvider.tsx` | Stub | `sendMessage` returns `DEFAULT_RESPONSE` synchronously; no real API call |
| `apps/web/app/api/ai/cribai/route.ts` | Complete | POST endpoint, SSE stream, auth, rate limiting, Gemini integration |
| `apps/web/lib/filter-listings.ts` | Complete | Pure function, no side effects, testable |
| `apps/web/lib/mock-listings.ts` | Complete | 6-field `Listing` type with `id` field ready for routing |

### What is broken

| Gap | Root Cause | Fix |
|-----|-----------|-----|
| Explore → Detail navigation dead | `ListingCard` has no `<Link>` or `onClick` | Wrap card body in `<Link href="/listing/${listing.id}">` |
| AI button appears on all pages | `AIChatButton` + `AIChatPanel` in `app/layout.tsx` lines 36-39 | Remove from root layout; add to `app/(main)/explore/page.tsx` or a future explore layout |
| AI responses are hardcoded | `ChatProvider.sendMessage` at line 33-48 returns `DEFAULT_RESPONSE` | Replace stub with fetch to `/api/ai/cribai`, consume SSE stream |
| EXPL-01/02/03 unverified | No phase 12 test files created | Write Vitest unit tests + 1 Playwright E2E flow |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js `<Link>` | 15 (App Router) | Client-side SPA navigation | Built-in, zero bundle cost vs `<a>` |
| Vitest | Configured in `apps/web/vitest.config.ts` | Unit tests for components + utils | Already in project; happy-dom env |
| @testing-library/react | Configured in `vitest.setup.ts` | Component rendering in unit tests | Already installed; jest-dom matchers active |
| Playwright | Configured in `apps/web/playwright.config.ts` | E2E flow tests | Already in project; 4 browser targets |
| SSE / ReadableStream | Web platform | Consume CribAI streaming response | No extra dependency needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `usePathname` (next/navigation) | 15 | Detect current route in layout | Use in layout to conditionally render chat |
| `useRouter` (next/navigation) | 15 | Programmatic navigation if needed | Not needed for this phase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Move chat to explore page | Keep global + `usePathname` guard | Both work; moving is architecturally cleaner and easier to test |
| Fetch SSE manually | EventSource | EventSource doesn't support POST; manual fetch + ReadableStream is correct |
| Vitest component tests | Playwright for all | Playwright adds server dependency; Vitest unit tests are faster and self-contained |

---

## Architecture Patterns

### Recommended Project Structure (additions only)

```
apps/web/
├── app/(main)/explore/
│   └── page.tsx                  # Add AIChatButton + AIChatPanel here (moved from root layout)
├── components/explore/
│   ├── ListingCard.tsx            # Add <Link> wrapper (CHANGE)
│   ├── __tests__/
│   │   ├── FilterChips.test.tsx   # NEW — unit test
│   │   ├── ViewToggle.test.tsx    # NEW — unit test
│   │   └── ExploreLayout.test.tsx # NEW — unit test
├── components/chat/
│   └── ChatProvider.tsx           # Replace sendMessage stub (CHANGE)
└── tests/e2e/
    └── explore.spec.ts            # NEW — E2E flow test
```

### Pattern 1: ListingCard `<Link>` Wrap

**What:** Wrap the navigable card area (everything except the save button) in Next.js `<Link>`.
**When to use:** Any card component that should navigate — standard Next.js pattern.

```tsx
// apps/web/components/explore/ListingCard.tsx
import Link from 'next/link';

// Inside the returned JSX, wrap the Card:
<motion.div {...scaleOnHover}>
  <Link href={`/listing/${listing.id}`} className="block">
    <Card className="relative overflow-hidden p-0 gap-0">
      {/* ... photo, badges, CardContent ... */}
      {/* Save button uses e.stopPropagation() — already present, stays inside */}
    </Card>
  </Link>
</motion.div>
```

The save button already calls `e.stopPropagation()` (line 44 of ListingCard.tsx), so the Heart button will not trigger navigation.

**Pitfall:** Do NOT wrap the entire `<motion.div>` in `<Link>` — keep `<Link>` as the direct parent of `<Card>` to avoid nested interactive elements (`<button>` inside `<a>`). The save Button must remain a sibling or child of the link, not a descendant of another `<a>`. Since the save Button is inside the Card content (not a child of Link's anchor tag), this needs care. The correct pattern: `<Link>` wraps `<Card>`, and the Button inside the card with `e.stopPropagation()` is fine because HTML allows buttons inside anchors when the button has its own click handler that stops propagation.

### Pattern 2: Scope AIChatButton to Explore Page

**What:** Remove `<AIChatButton />` and `<AIChatPanel />` from `app/layout.tsx`; add them directly into `app/(main)/explore/page.tsx`. The `<ChatProvider>` can stay in the root layout (it has no UI of its own) or move to explore — either works.

**Option A (simpler):** Move button + panel to explore page, keep provider in root layout.

```tsx
// app/(main)/explore/page.tsx
import { AIChatButton } from '@/components/chat/AIChatButton';
import { AIChatPanel } from '@/components/chat/AIChatPanel';

export default function ExplorePage() {
  // ... existing state ...
  return (
    <motion.div ...>
      {/* existing content */}
      <AIChatButton />
      <AIChatPanel />
    </motion.div>
  );
}
```

**Option B:** Keep provider in root layout but use `usePathname` guard in the button. Option A is preferred — simpler, easier to test, no route-detection logic needed.

### Pattern 3: Wire ChatProvider to Real CribAI SSE

**What:** Replace the synchronous stub with an async SSE consumer.
**When to use:** Any SSE POST endpoint (no EventSource because EventSource is GET-only).

The `/api/ai/cribai` endpoint:
- Accepts `POST` with body `{ query: string, campusSlug: string, history?: [] }`
- Returns `Content-Type: text/event-stream`
- Emits `data: {"type":"text","content":"..."}` chunks
- Ends with `data: {"type":"done"}`
- Also emits `data: {"type":"error","message":"..."}` on failure

```tsx
// apps/web/components/chat/ChatProvider.tsx — new sendMessage implementation
const sendMessage = useCallback(async (text: string) => {
  if (!text.trim()) return;

  const userMessage: ChatMessage = {
    id: `user-${Date.now()}`,
    role: 'user',
    content: text.trim(),
  };

  setMessages((prev) => [...prev, userMessage]);
  setLoading(true); // add loading state to context

  try {
    const res = await fetch('/api/ai/cribai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: text.trim(),
        campusSlug: 'uw-madison', // default; can be made dynamic later
        history: [], // pass existing messages in future iteration
      }),
    });

    if (!res.ok || !res.body) throw new Error('CribAI unavailable');

    // Accumulate text from SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let assistantContent = '';
    const assistantId = `assistant-${Date.now()}`;

    // Insert placeholder message that we'll update
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '' },
    ]);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));

      for (const line of lines) {
        try {
          const event = JSON.parse(line.slice(6)) as { type: string; content?: string; message?: string };
          if (event.type === 'text' && event.content) {
            assistantContent += event.content;
            // Immutable update: replace last message
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: assistantContent } : m,
              ),
            );
          }
          if (event.type === 'done') break;
          if (event.type === 'error') {
            assistantContent = event.message ?? 'Something went wrong.';
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: assistantContent } : m,
              ),
            );
          }
        } catch {
          // Malformed SSE line — skip
        }
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'CribAI unavailable';
    setMessages((prev) => [
      ...prev,
      { id: `err-${Date.now()}`, role: 'assistant', content: errorMsg },
    ]);
  } finally {
    setLoading(false);
  }
}, []);
```

**Important:** `sendMessage` becomes `async`. The context interface must update:
- Add `readonly loading: boolean` to `ChatContextValue`
- Change `sendMessage: (text: string) => void` to `sendMessage: (text: string) => Promise<void>`
- AIChatPanel already calls `sendMessage(messageText)` — no change needed there (fire-and-forget is fine for UI)

### Pattern 4: Vitest Unit Tests for Explore Components

**Test environment:** `happy-dom` (configured in `apps/web/vitest.config.ts`)
**Setup file:** `apps/web/vitest.setup.ts` — imports `@testing-library/jest-dom/vitest`
**Test file location convention:** `components/{dir}/__tests__/*.test.tsx`

```tsx
// components/explore/__tests__/ViewToggle.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewToggle } from '../ViewToggle';

test('renders List and Map buttons', () => {
  const onViewChange = vi.fn();
  render(<ViewToggle activeView="list" onViewChange={onViewChange} />);
  expect(screen.getByRole('radio', { name: /list view/i })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: /map view/i })).toBeInTheDocument();
});

test('calls onViewChange with map when Map clicked', () => {
  const onViewChange = vi.fn();
  render(<ViewToggle activeView="list" onViewChange={onViewChange} />);
  fireEvent.click(screen.getByRole('radio', { name: /map view/i }));
  expect(onViewChange).toHaveBeenCalledWith('map');
});
```

**Framer-motion mock needed:** framer-motion uses browser APIs that happy-dom may not support. Standard pattern: mock the module.

```tsx
// In vitest.setup.ts or at top of test file:
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.ComponentProps<'div'>) =>
      React.createElement('div', props, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));
```

### Anti-Patterns to Avoid

- **Nested interactive elements:** Do NOT wrap the Heart save button inside a `<Link>` — it creates a `<button>` inside an `<a>` which is invalid HTML. The button must be a sibling or use `e.stopPropagation()` inside the anchor (which is valid).
- **EventSource for POST:** The CribAI endpoint requires POST (auth header, body). EventSource only supports GET. Use `fetch` + `ReadableStream`.
- **Mutating messages array:** Always use `setMessages((prev) => [...prev, newMsg])` or `prev.map(...)` — never push to the array directly. The project enforces immutability.
- **campusSlug hardcoded forever:** For Phase 18 scope, hardcoding `'uw-madison'` is acceptable as a known constant. Do NOT add dynamic routing for this — that is Phase 19+ scope.
- **Moving ChatProvider:** Do NOT move `ChatProvider` out of the root layout — it is needed by `AIChatPanel` which may be rendered inside `ExplorePage`. If provider and panel are both inside `ExplorePage`, panel is fine. If provider is in root layout, panel can be anywhere. Either architecture works; consistency matters.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Client-side navigation | Custom `onClick` + `router.push()` | `<Link href="...">` from `next/link` | Link prefetches, handles scroll restoration, SPA navigation |
| SSE parsing | Custom event stream parser | Inline `data: ` line parsing (5 lines) | No library needed; SSE is simple; `eventsource-parser` is overkill here |
| Component testing env | Custom JSDOM setup | Existing vitest.config.ts + happy-dom | Already configured; just write tests |

---

## Common Pitfalls

### Pitfall 1: Button Inside Anchor (Invalid HTML)
**What goes wrong:** Wrapping the entire `<Card>` (which contains a `<Button>`) in a `<Link>` creates `<a><button></button></a>` — invalid HTML, causes browser warnings and accessibility issues.
**Why it happens:** Easy to reach for "wrap everything" approach.
**How to avoid:** Either (a) keep the save button outside the link's child tree using absolute positioning (it is already `absolute top-2 right-2`), or (b) rely on `e.stopPropagation()` in the button's onClick (already present). Approach (b) works because the button click stops bubbling before Link's navigation fires. The HTML structure `<a><button></button></a>` is technically invalid per spec but browsers handle it — for cleanliness, test that navigation fires on card click and does NOT fire when save button is clicked.
**Warning signs:** Browser console warnings about nested interactive elements.

### Pitfall 2: framer-motion in Vitest / happy-dom
**What goes wrong:** `motion.div` and `AnimatePresence` use browser layout APIs that happy-dom does not implement, causing `TypeError: Cannot read properties of null` or similar.
**Why it happens:** framer-motion detects browser environment but happy-dom is not a full browser.
**How to avoid:** Mock framer-motion globally in vitest.setup.ts or per-test-file with `vi.mock('framer-motion', ...)`.
**Warning signs:** Test errors mentioning `ResizeObserver`, `matchMedia`, or `IntersectionObserver`.

### Pitfall 3: SSE Chunk Boundaries
**What goes wrong:** A single `read()` from the ReadableStream may return multiple SSE events concatenated, or a single event split across two reads.
**Why it happens:** TCP/HTTP streaming doesn't guarantee one-event-per-chunk alignment.
**How to avoid:** Buffer incomplete lines. Split on `\n\n` (double newline terminates SSE events) and handle partial chunks. The simple line-split approach (`chunk.split('\n').filter(l => l.startsWith('data: '))`) works for most cases. For robustness, maintain a buffer string across reads.
**Warning signs:** Parsing errors on first or last chunk; some messages silently dropped.

### Pitfall 4: campusSlug Context
**What goes wrong:** The CribAI route requires a valid `campusSlug` matching a row in `campus_configs`. If you hardcode `'uw-madison'` and the DB doesn't have it, you get a 404 from the route.
**Why it happens:** Mock data (explore page) is decoupled from DB.
**How to avoid:** The API route gracefully returns `{"error":"Campus not found"}` (400) — handle this in the SSE consumer and show a user-friendly error. For Phase 18, hardcoding `'uw-madison'` is fine per project scope; the ChatProvider should gracefully display the API error message.
**Warning signs:** Chat panel shows blank response or silent failure.

### Pitfall 5: `sendMessage` Async — Panel UX
**What goes wrong:** AIChatPanel clears the input before the response arrives. If `sendMessage` is now async, the send button may be clicked multiple times during loading.
**Why it happens:** No loading state gates the send button.
**How to avoid:** Add `loading` to ChatContextValue; disable the send button while `loading === true`. The Input clear (`setInputValue('')`) should still happen synchronously on send.

---

## Code Examples

### ListingCard with Link (verified pattern)
```tsx
// Source: Next.js 15 App Router docs — Link component
import Link from 'next/link';

// Replace <motion.div {...scaleOnHover}> wrapping with:
<motion.div {...scaleOnHover}>
  <Link href={`/listing/${listing.id}`} className="block">
    <Card className="relative overflow-hidden p-0 gap-0">
      {/* Save button with stopPropagation — keeps working */}
      {/* Rest of card content unchanged */}
    </Card>
  </Link>
</motion.div>
```

### SSE consumer (fetch + ReadableStream — verified Web platform API)
```typescript
const res = await fetch('/api/ai/cribai', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, campusSlug: 'uw-madison', history: [] }),
});
const reader = res.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const parts = buffer.split('\n\n');
  buffer = parts.pop() ?? ''; // keep incomplete last part
  for (const part of parts) {
    const line = part.trim();
    if (!line.startsWith('data: ')) continue;
    const event = JSON.parse(line.slice(6));
    // handle event.type === 'text' | 'done' | 'error'
  }
}
```

### Playwright E2E pattern (from existing specs)
```typescript
// apps/web/tests/e2e/explore.spec.ts — follow existing page-object pattern
import { test, expect } from '@playwright/test';

test('ListingCard navigates to listing detail', async ({ page }) => {
  await page.goto('/explore');
  const firstCard = page.locator('a[href^="/listing/"]').first();
  await expect(firstCard).toBeVisible();
  const href = await firstCard.getAttribute('href');
  expect(href).toMatch(/^\/listing\/.+/);
  await firstCard.click();
  await expect(page).toHaveURL(/\/listing\/.+/);
});

test('AIChatButton is visible on explore page', async ({ page }) => {
  await page.goto('/explore');
  const chatBtn = page.getByRole('button', { name: /open cribai chat/i });
  await expect(chatBtn).toBeVisible();
});

test('AIChatButton is NOT visible on landing page', async ({ page }) => {
  await page.goto('/');
  const chatBtn = page.getByRole('button', { name: /open cribai chat/i });
  await expect(chatBtn).not.toBeVisible();
});
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (unit) + Playwright (E2E) |
| Vitest config | `apps/web/vitest.config.ts` |
| Playwright config | `apps/web/playwright.config.ts` |
| Quick unit run | `cd apps/web && pnpm vitest run` |
| Full E2E run | `cd apps/web && pnpm playwright test` |
| Single E2E spec | `cd apps/web && pnpm playwright test tests/e2e/explore.spec.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXPL-01 | Desktop split view renders | E2E | `pnpm playwright test tests/e2e/explore.spec.ts -g "split view"` | ❌ Wave 0 |
| EXPL-02 | ViewToggle switches list/map | Unit | `pnpm vitest run components/explore/__tests__/ViewToggle.test.tsx` | ❌ Wave 0 |
| EXPL-03 | FilterChips toggles update result count | Unit | `pnpm vitest run components/explore/__tests__/FilterChips.test.tsx` | ❌ Wave 0 |
| EXPL-04 | AIChatButton only on explore; panel calls API | Unit + E2E | unit + playwright explore.spec.ts | ❌ Wave 0 |
| EXPL-05 | ListingCard Link to /listing/[id] | E2E | `pnpm playwright test tests/e2e/explore.spec.ts -g "navigation"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/web && pnpm vitest run`
- **Per wave merge:** `cd apps/web && pnpm playwright test tests/e2e/explore.spec.ts`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/web/components/explore/__tests__/FilterChips.test.tsx` — covers EXPL-03
- [ ] `apps/web/components/explore/__tests__/ViewToggle.test.tsx` — covers EXPL-02
- [ ] `apps/web/components/explore/__tests__/ExploreLayout.test.tsx` — covers EXPL-01 (unit)
- [ ] `apps/web/tests/e2e/explore.spec.ts` — covers EXPL-01 E2E, EXPL-04 scoping, EXPL-05 navigation
- [ ] framer-motion mock — add to `apps/web/vitest.setup.ts` or per-file

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| `<a href="">` for navigation | `<Link>` from `next/link` | Prefetching, SPA transitions, scroll restore |
| EventSource for streaming | fetch + ReadableStream | Required for POST endpoints |
| Synchronous mock response | Real SSE stream | Eliminates hardcoded DEFAULT_RESPONSE |

**Deprecated/outdated:**
- `DEFAULT_RESPONSE` constant in ChatProvider: remove entirely after SSE wiring

---

## Open Questions

1. **campusSlug for Chat Panel**
   - What we know: The CribAI API needs a valid `campusSlug` from the DB
   - What's unclear: Explore page uses mock data — no campusSlug in URL or context
   - Recommendation: Hardcode `'uw-madison'` for Phase 18. Add campusSlug to URL params in Phase 19+ when real data wiring happens. The API gracefully returns an error message if campus not found.

2. **Should ChatProvider move to ExploreLayout?**
   - What we know: If AIChatButton moves to ExplorePage, provider can move too
   - What's unclear: Whether future phases (19+) need chat state to persist across routes
   - Recommendation: Keep ChatProvider in root layout for now. Move button+panel only to ExplorePage. This preserves conversation state across route navigation (e.g., user opens chat, clicks listing, returns — chat is still open). If panel moves into ExplorePage, state resets on navigate-away.

3. **Listing Detail route path**
   - What we know: `apps/web/app/(main)/listing/[id]/page.tsx` exists
   - What's unclear: Does the `id` field in `mock-listings.ts` match format expected by the listing detail page?
   - Recommendation: Read `mock-listings.ts` fully and check listing detail page's data fetching to verify `id` values will resolve. Quick check: if detail page fetches by UUID from DB and mock IDs are not UUIDs, the detail page will show a not-found error — acceptable for Phase 18 since the requirement is "clicking navigates" not "listing data loads."

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — all findings are from reading actual files
  - `apps/web/components/chat/ChatProvider.tsx` — DEFAULT_RESPONSE stub confirmed
  - `apps/web/app/layout.tsx` — AIChatButton global mount confirmed
  - `apps/web/components/explore/ListingCard.tsx` — missing Link confirmed
  - `apps/web/app/api/ai/cribai/route.ts` — SSE endpoint fully implemented
  - `apps/web/vitest.config.ts` + `vitest.setup.ts` — test infrastructure confirmed
  - `apps/web/playwright.config.ts` — E2E infrastructure confirmed
- Next.js 15 App Router `<Link>` component — standard navigation pattern (HIGH — built-in)
- Web Streams API (`ReadableStream`, `getReader()`) — standard Web platform (HIGH)

### Secondary (MEDIUM confidence)
- framer-motion in Vitest / happy-dom mock pattern — community-verified workaround for testing framer-motion components; standard across React projects using Vitest

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project, no new dependencies required
- Architecture: HIGH — all patterns verified against existing codebase
- Pitfalls: HIGH — derived from direct code inspection (button-in-anchor from existing stopPropagation, SSE from existing route)
- Test gaps: HIGH — confirmed by globbing for test files (zero unit test files in apps/web/components)

**Research date:** 2026-03-11
**Valid until:** 2026-06-11 (stable Next.js + web platform APIs)
