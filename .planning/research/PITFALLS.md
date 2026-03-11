# Pitfalls Research

**Domain:** Design system migration + AI Concierge features added to existing Next.js 15 + Supabase app (CampusNest v1.1)
**Researched:** 2026-03-10
**Confidence:** HIGH (verified against official docs, GitHub issues, and community post-mortems)

---

## Critical Pitfalls

### Pitfall 1: Big-Bang Design System Migration Breaks Working Features

**What goes wrong:**
You attempt to migrate the entire frontend to shadcn/ui + Tailwind v4 tokens in one pass — touching every component file at once. Halfway through, the app is half-styled, tests break because class names changed, and it is unclear which pages are "done." The existing working features (CribAI chat, map blocks, tour scheduling) regress in the process.

**Why it happens:**
Tailwind v4 changes the CSS architecture fundamentally (JavaScript config eliminated, `@theme` CSS directive replaces `tailwind.config.js`, `@import "tailwindcss"` replaces `@tailwind` directives, utility class renames like `flex-shrink-0` → `shrink-0`). Shadcn/ui also shifts from the v3 HSL token format to v4 OKLCH. Trying to do this atomically across 20+ component files is a code freeze in practice. A single bad merge leaves the app in a broken state.

**How to avoid:**
Dedicate the first phase entirely to design system foundations: install Tailwind v4, install shadcn/ui with v4 support, configure `@theme` with the full CampusNest token set (Space Grotesk, DM Sans, brand colours), set up `next/font/google` for both fonts, install Lucide, install framer-motion. Validate with a single throwaway test page that exercises the full token system. Only after this foundation phase is solid do subsequent phases replace component-by-component. Use feature flags or parallel routes to keep the existing pages live while redesigned pages are built alongside them.

**Warning signs:**
- PR titles like "redesign everything" or "full migration"
- Tailwind config and `globals.css` both defining the same token names
- `tailwind.config.js` still present after the migration (the codemod may not have cleaned it up)
- Build succeeds locally but Vercel Preview fails because `@tailwindcss/postcss` is not in `devDependencies`

**Phase to address:**
Phase 1 (Design System Foundation) — must be a standalone phase that all subsequent UI phases depend on.

---

### Pitfall 2: Shadcn/ui CSS Variable Names Collide With Existing Custom Properties

**What goes wrong:**
CampusNest v1.0 already defines CSS custom properties in `globals.css` (e.g. `--primary`, `--foreground`, `--background`, `--border`). Shadcn/ui uses the identical names for its own token system. When you install shadcn/ui, its CLI overwrites or appends conflicting `:root` declarations. Existing components that relied on the old token values break visually; dark mode may silently regress because shadcn writes a `.dark` block using different OKLCH values than the existing HSL setup.

**Why it happens:**
Shadcn's default token names (`--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--background`, `--foreground`) are intentionally generic. Projects commonly pre-use these names. The Tailwind v4 migration further complicates this: variables must now also be mapped inside `@theme inline { --color-primary: var(--primary); }` or they produce no utility classes, and the HSL values in v3 become OKLCH in v4. If the project's existing colours are in HSL and shadcn's installed palette is in OKLCH, the two systems diverge silently.

**How to avoid:**
Before running `npx shadcn@latest init`, audit `globals.css` and list every existing `--variable` name. Treat the shadcn init as a controlled operation: run it on a branch, review the diff to the CSS file, then manually merge the token values. Map existing brand colours (CampusNest palette from Figma) into the shadcn token names rather than running both systems in parallel. The final `globals.css` should have one authoritative `:root` block — shadcn's structure, populated with CampusNest's brand values converted to OKLCH.

**Warning signs:**
- Two `:root` blocks in `globals.css`
- `--primary` resolving to different colours in different components
- Dark mode works on some pages but not others
- Tailwind's `bg-primary` utility renders a different colour than `style={{ backgroundColor: "var(--primary)" }}`

**Phase to address:**
Phase 1 (Design System Foundation) — the token merge is the most important task in this phase.

---

### Pitfall 3: framer-motion Forces Every Animated Page Into a Client Component

**What goes wrong:**
You add `motion.div` to a page component that was a Server Component (no `"use client"` directive). Next.js 15 App Router throws a hard error or silently falls back to CSR. Worse, you add `"use client"` to the page component itself — which propagates client-side rendering to all its children, including data-fetching components that were intentionally server-side. Performance regresses: data fetching moves to the browser, initial HTML is empty, and Lighthouse scores drop.

**Why it happens:**
framer-motion is a purely client-side library (it accesses `window`, DOM nodes, and `requestAnimationFrame`). In Next.js App Router, the default is server rendering. Adding `motion.*` components without `"use client"` boundary management causes the entire subtree to execute on the client. Developers who are used to Next.js pages router (where all components were client-rendered by default) do not think about this boundary.

**How to avoid:**
Create thin `"use client"` wrapper components that own the animation concern only. Example: `MotionWrapper.tsx` exports `motion` components with `"use client"` at the top; page-level Server Components import these wrappers, not `framer-motion` directly. The rule: pages remain Server Components; animated elements are extracted into small Client Component wrappers. Use `initial={false}` on AnimatePresence to suppress the first-render animation (prevents SSR hydration mismatch where the server renders no `data-projection-id` but the client expects one).

**Warning signs:**
- `"use client"` added to `page.tsx` or `layout.tsx` files directly
- Network tab shows no server-rendered HTML (page source is just `<div id="__next"></div>`)
- Hydration warnings in console mentioning `data-projection-id` mismatch
- Exit animations not playing (AnimatePresence not wrapping the correct level, or missing `key` props)

**Phase to address:**
Phase 2 (Marketing Landing Page) — this is the first phase that introduces framer-motion. Establish the wrapper pattern here; all subsequent phases inherit it.

---

### Pitfall 4: Space Grotesk and DM Sans Are Not on Google Fonts — Self-Hosting Is Mandatory

**What goes wrong:**
A developer tries to load Space Grotesk or DM Sans via `next/font/google` (the convenient zero-config path). It fails silently or throws because these fonts are not in Google Fonts. The fallback is a browser default serif font (Times New Roman), which destroys the brand feel and shifts layout due to different metrics. CLS (Cumulative Layout Shift) spikes because the fallback font has completely different glyph dimensions than the intended typefaces.

**Why it happens:**
Space Grotesk is distributed by Fontshare (Indian Type Foundry); DM Sans is from Fontshare as well. Neither is on Google Fonts. Developers assume the `next/font/google` import covers all modern design system fonts. Next.js does not validate font names at import time — it fails at build time or runtime, which is a late-stage discovery.

**How to avoid:**
Download WOFF2 files for both fonts from Fontshare (Space Grotesk: ExtraLight through ExtraBold + Italic variants; DM Sans: Light through Black + Italic variants). Place them in `apps/web/public/fonts/`. Use `next/font/google` with the full weight array. Set `display: "swap"` and `adjustFontFallback: true` — Next.js will auto-generate a `size-adjust`-calibrated fallback to prevent CLS. Apply the font as a CSS variable on `<html>` and consume it via `font-family: var(--font-space-grotesk)` in the Tailwind `@theme` block. Test with a throttled connection to verify no FOUT (Flash of Unstyled Text).

**Warning signs:**
- `import { SpaceGrotesk } from "next/font/google"` in any file
- Times New Roman or system-ui visible during page load in slow-network tests
- CLS score above 0.05 in Lighthouse
- Font files not present in `public/fonts/` directory

**Phase to address:**
Phase 1 (Design System Foundation) — font setup is prerequisite to all visual work.

---

### Pitfall 5: Lucide Icon Barrel Imports Inflate Bundle Size 30-50x

**What goes wrong:**
Developers write `import { Home, Search, Bell, Star, Map, Settings, User, ChevronDown } from "lucide-react"`. This looks tree-shakeable but in practice — depending on Next.js version and bundler config — can import the entire Lucide library (1,300+ icons, ~500KB unminified). Dev server becomes sluggish. Production bundle includes icons that are never rendered.

**Why it happens:**
Lucide uses barrel exports (one `index.js` that re-exports all icons). Barrel exports defeat tree-shaking in certain bundler configurations because the static analysis cannot prove the re-exports are side-effect-free. This is documented in Next.js's own blog post on `optimizePackageImports`. In development mode specifically, Next.js resolves barrel files without tree-shaking, causing the dev server to load all icons on every page that imports any icon.

**How to avoid:**
Add `lucide-react` to `optimizePackageImports` in `next.config.ts`:

```ts
experimental: {
  optimizePackageImports: ["lucide-react"],
}
```

This is the correct fix — it converts barrel imports to precise imports automatically during build, giving clean code without bundle overhead. Do not switch to path-specific imports (`import Home from "lucide-react/dist/esm/icons/home"`) — the `optimizePackageImports` approach is cleaner and maintained. Verify the fix is working by checking bundle analysis (`ANALYZE=true pnpm build`).

**Warning signs:**
- Dev server noticeably slower after adding icons to more components
- Bundle analyzer shows `lucide-react` as a large chunk
- First page load in production is >200KB JS for a simple page that imports a few icons

**Phase to address:**
Phase 1 (Design System Foundation) — add `optimizePackageImports` config before any pages use icons.

---

### Pitfall 6: Agent Mission State Becomes Inconsistent Between Polling and Optimistic Updates

**What goes wrong:**
The AI Concierge shows a mission as `running` with an animated spinner. The user steers the mission via the steering bar. The optimistic update immediately shows `steering` in the UI. Meanwhile the poll interval fires, fetches the old `running` state from the DB, and overwrites the optimistic state. The spinner flickers between states, or worse: the steering command is visually acknowledged but the UI reverts to `running`, leaving the user unsure if their input was received.

**Why it happens:**
Polling and optimistic updates operate on the same state slice without coordination. A `setInterval`-based poll runs at a fixed cadence and overwrites whatever is in local state with the server response. The optimistic update writes to local state but does not pause the poller. This is the classic stale-server-response-overwrites-fresh-optimistic-state race condition.

**How to avoid:**
Use TanStack Query (`@tanstack/react-query`) as the mission state layer. TanStack Query's `useMutation` + `onMutate` for optimistic updates integrates directly with `useQuery` polling: mutations can temporarily disable refetch or set a flag that `onSuccess` uses to decide whether to overwrite. The pattern: (1) fire steering command, (2) optimistically set local mission state to `steering`, (3) pause the refetch interval for 3 seconds, (4) resume polling. This gives the server time to acknowledge the steering before the poller overwrites the state. Never use raw `setInterval` for mission status polling — use TanStack Query's `refetchInterval` option which respects mutation lifecycle.

**Warning signs:**
- Mission status spinner flickering between two states
- Console logs showing a poll response with an older `updated_at` than the local state
- Steering bar button stays visually active but mission status resets to previous state
- useEffect with setInterval in the same component as useState for mission status

**Phase to address:**
Phase N (AI Concierge — Mission Board) — must be designed with TanStack Query from the start.

---

### Pitfall 7: HITL Draft Approval Has Three Failure Modes That Cause Silent Data Loss

**What goes wrong:**

1. **Stale draft approved:** User receives a draft from the AI agent (e.g. a tour request email). The user leaves the page and returns 20 minutes later. Meanwhile the agent produced a revised draft. The user approves the stale first draft. The system executes based on stale parameters (wrong time slot, wrong listing).

2. **Double submit:** User clicks "Approve" — the server is slow — user clicks again. Two approval events fire. The action (e.g. tour scheduling) executes twice, creating duplicate DB records.

3. **Ignored draft blocks the mission:** The agent is waiting for HITL approval. The user never responds. The mission sits at `awaiting_approval` forever, consuming a slot in the mission board without any visible timeout or expiry.

**Why it happens:**
HITL draft approval is a multi-step async workflow in a mostly-synchronous UI paradigm. Draft versioning is rarely implemented because it adds DB schema complexity. Submit buttons are not disabled after the first click because the developer forgot to track the submission-in-flight state. Mission timeouts are not designed upfront because "we'll add that later."

**How to avoid:**

- **Stale draft:** Store `draft_version` (auto-incrementing integer) on the draft record. The approval payload must include the `draft_version` it was approved against. The server rejects approvals where `draft_version` does not match the current record — return a 409 with "A newer draft is available; please review it." Show the draft's `created_at` in the UI ("Draft generated 3 minutes ago").

- **Double submit:** Disable the Approve button immediately on first click (set `isSubmitting: true`). Use `useTransition` (React 19) or a `submitting` boolean tracked in component state — not just a network request flag. Add idempotency key to the approval API call (UUID stored in component state, generated once per draft render).

- **Stuck mission:** Add `expires_at` to draft records: 24 hours for tour requests, 4 hours for time-sensitive actions. Run a Supabase Edge Function or Postgres cron job (`pg_cron`) that transitions `awaiting_approval` missions past their `expires_at` to `expired`. Show a countdown timer in the HITL card: "Auto-expires in 22 hours."

**Warning signs:**
- Draft approval DB table has no `version` column
- Approve button does not visually change state after click
- Mission board shows missions in `awaiting_approval` with `created_at` days ago
- No `expires_at` column in the drafts/missions table

**Phase to address:**
Phase N (AI Concierge — HITL Draft Approval) — schema design must include versioning and expiry before any UI is built.

---

### Pitfall 8: Steering Bar Intent Parsing Returns No-Op on Ambiguous Commands

**What goes wrong:**
User types "actually, make it cheaper" into the steering bar. The Gemini call returns an intent it cannot classify — is this "refine search criteria" or "restart mission with lower budget"? The system either: (a) silently does nothing (worst), (b) throws an unhandled error, or (c) picks an arbitrary interpretation. The user sees no feedback and repeats the command, triggering duplicate mission restarts.

**Why it happens:**
Natural language commands to a steering bar have infinite surface area. Developers build the happy path (clear intent, successful classification) and do not design the error path. Ambiguous commands are treated as unexpected inputs rather than first-class cases requiring feedback.

**How to avoid:**

- Define a fixed intent taxonomy for the steering bar: `{ refine_criteria, change_budget, restart_mission, cancel_mission, clarify_question }`. Any classification outside this taxonomy is `unknown_intent`.
- For `unknown_intent`: do not silently no-op. Return a clarification prompt inline: "I'm not sure what you'd like me to do — did you mean [option A] or [option B]?" Display this in the steering bar context, not as a toast.
- For ambiguous commands that could map to multiple intents: show a quick-select ("Did you mean: Refine price range / Start over with new criteria?").
- Log all steering commands with their classified intents. Review the `unknown_intent` logs weekly during early usage to extend the taxonomy.
- Cap steering actions per mission at a reasonable limit (e.g. 5 steers) to prevent infinite refinement loops.

**Warning signs:**
- Steering bar has no visual feedback state (no loading indicator, no response display)
- No `unknown_intent` handler in the intent classification logic
- Mission restarts accumulate in the DB (same user, same mission type, started within seconds of each other)

**Phase to address:**
Phase N (AI Concierge — Steering Bar) — intent taxonomy must be defined before the steering bar UI is built.

---

### Pitfall 9: Replacing Full-Page Chat With Floating Panel Loses Context Restoration

**What goes wrong:**
The current CribAI chat is a full-page route (`/chat`). The redesign moves it to a floating panel overlaid on the Explore page. Users navigate from the Explore page to a Listing Detail page. The floating panel either: (a) disappears because the panel state is not preserved across route navigations, or (b) resets its conversation because the session reference is lost. Users who were mid-conversation with CribAI lose their context when they click a listing.

**Why it happens:**
Floating panels that persist across route navigations require state to live above the router — in a layout component or a global state store. React state local to a page component is destroyed on route change. The existing chat already uses DB-backed persistence (`conversations` table) for logged-in users and sessionStorage for guests. But floating panels need to additionally track which conversation is "active" in the panel, the scroll position, and whether the panel is open/minimised — state that is UI-level, not DB-level.

**How to avoid:**

- Move the floating chat panel into `apps/web/app/layout.tsx` or a persistent shell layout component that is never unmounted during navigation. The panel renders at the layout level, not the page level.
- Use Zustand (or React Context at the layout level) to store: `{ isOpen, conversationId, panelState: 'full' | 'minimised' }`. This state persists across route changes.
- When a user navigates to a listing detail from within a CribAI conversation, pass the `listing_id` as context to the active conversation rather than opening a new one.
- Keep the full-page `/chat` route for mobile (small viewports where a floating panel is unusable) and redirect to it when viewport < `lg`.
- Test the panel with router navigation explicitly in E2E: open panel, start chat, navigate to another page, verify panel is still open with conversation intact.

**Warning signs:**
- Floating panel component is defined inside a page file rather than a layout file
- No global state store for panel open/closed state
- Panel component is unmounted and remounted on route change (visible as animation playing again on every navigation)

**Phase to address:**
Phase N (Explore Page — Split View + Floating AI Panel) — layout architecture must be decided before panel component is built.

---

### Pitfall 10: Tailwind v4 Removes `tailwind.config.js` — Existing Build Tooling May Assume It Exists

**What goes wrong:**
After migrating to Tailwind v4's CSS-first configuration, several things break silently:
- `tailwindcss-animate` (used by shadcn v3 components) is removed — components using it produce broken animations until `tw-animate-css` is installed as replacement.
- Storybook, Vitest with CSS processing, or any tool that reads `tailwind.config.js` for configuration breaks because the file no longer exists.
- Arbitrary value syntax changed: some v3 arbitrary classes (`bg-[var(--my-color)]`) may need adjustment for v4 compatibility.
- The `@tailwind base; @tailwind components; @tailwind utilities;` directives in `globals.css` must be replaced with `@import "tailwindcss"` — the old directives produce no output in v4.

**Why it happens:**
Tailwind v4 is a major architectural shift, not a minor version bump. The automated codemod (`npx @tailwindcss/upgrade`) handles ~90% of cases but misses: custom PostCSS plugins that expect the old config shape, third-party libraries that peer-depend on Tailwind v3, and arbitrary value patterns in dynamically constructed class names (which the AST parser cannot safely transform).

**How to avoid:**
- Run `npx @tailwindcss/upgrade` on a branch and thoroughly review the diff before merging.
- Replace `tailwindcss-animate` with `tw-animate-css` and add `@import "tw-animate-css"` to `globals.css`.
- Update PostCSS config: remove `tailwindcss` plugin, add `@tailwindcss/postcss`.
- Search the codebase for `tailwind.config` imports in test setup files (Vitest, Jest, Storybook) and update them.
- After migration, run `pnpm build` and `pnpm test` to verify both the build pipeline and test runner work correctly.

**Warning signs:**
- `globals.css` still contains `@tailwind base` after migration
- `tailwindcss-animate` still in `package.json` (should be replaced by `tw-animate-css`)
- `postcss.config.js` still references `tailwindcss` plugin (should be `@tailwindcss/postcss`)
- Any `require('tailwind.config')` or `import tailwindConfig from './tailwind.config'` in non-config files

**Phase to address:**
Phase 1 (Design System Foundation) — migration verification must include build and test pipeline checks.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Adding `"use client"` to page-level files to fix framer-motion errors | Fast fix for SSR errors | All data fetching on that page moves to client; RSC benefits lost | Never — always extract animation to wrapper component |
| Keeping both old CSS variables and new shadcn tokens in parallel | Avoids touching working components | Two token systems diverge; dark mode inconsistent across pages | Only as a 1-2 day interim state during migration, never permanent |
| Inline `setTimeout` to "pause" between mission state transitions | Quick visual debounce | Race conditions reappear under network latency or slow machines | Never — use TanStack Query mutation lifecycle instead |
| Using raw `fetch` + `useState` for mission polling instead of TanStack Query | Avoids adding a dependency | Manual cache invalidation, no deduplication, stale-state bugs multiply | Only acceptable for one-off status checks, not recurring polling |
| Skipping `draft_version` field on approval drafts | Saves one DB column | Stale approval bugs are nearly impossible to reproduce and fix | Never — draft versioning costs one integer column and prevents a class of silent bugs |
| Importing full icon library without `optimizePackageImports` | Zero config | 500KB+ added to every page bundle, slow dev server | Never — the config fix is one line |

---

## Integration Gotchas

Common mistakes when connecting libraries to the existing CampusNest stack.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| shadcn/ui + Tailwind v4 | Running `npx shadcn@latest add` before Tailwind v4 migration is complete | Complete Tailwind v4 migration first; shadcn v4 components use `@theme` tokens that do not exist in v3 config |
| framer-motion + Next.js 15 | Wrapping entire page in `motion.div` with `"use client"` | Create `MotionWrapper` client components that wrap only the animated element; keep pages as Server Components |
| `next/font/google` + Tailwind v4 | Applying font CSS variable as a class on `<body>` but not mapping it in `@theme` | Map `--font-space-grotesk` into `@theme { --font-display: var(--font-space-grotesk); }` so Tailwind utility classes (`font-display`) work |
| Lucide + Next.js 15 | Missing `optimizePackageImports` in `next.config.ts` | Add `experimental.optimizePackageImports: ["lucide-react"]` on day one |
| TanStack Query + Supabase RLS | Queries hitting `anon` key for authenticated missions | Ensure Supabase client in `queryFn` uses the session-aware client from `packages/supabase/server.ts`, not the browser client |
| framer-motion `AnimatePresence` + Next.js routing | Exit animations not running on page navigation | Wrap the animated content at the layout level; page components unmount before exit animation can complete |

---

## Performance Traps

Patterns that work in development but cause problems in production.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| framer-motion `layout` prop on large lists | List items reflow slowly when count changes; jank on add/remove | Only use `layout` prop on elements that genuinely need coordinated layout animation; avoid on list containers with 50+ items | Lists with >20 animated items |
| `backdrop-filter: blur()` on floating panel | Frame rate drops on mid-range devices; panel feels laggy | Use `will-change: transform` on the panel; test blur on Lighthouse mobile simulation; consider removing blur for accessibility (`prefers-reduced-motion`) | Any device without GPU compositing support |
| Mission polling at 2-second intervals for all active missions | Supabase connection pool exhausted under concurrent users; DB CPU spikes | Use Supabase Realtime channel subscription for mission status updates instead of polling; fall back to polling at 5s intervals only when Realtime is unavailable | > 50 concurrent users with active missions |
| Loading all mission history on page mount | AI Concierge page slow initial load; unnecessary DB queries for archived missions | Paginate: load last 10 missions on mount, lazy-load older history | Mission history grows beyond 50 entries per user |
| Applying framer-motion `whileHover` and `whileTap` to every interactive element | Subtle but cumulative: 50+ animated elements cause GC pauses | Reserve motion variants for primary CTAs and meaningful state transitions; use CSS `:hover` transitions for minor hover states | Pages with dense interactive lists |

---

## Security Mistakes

Domain-specific to the AI Concierge and design system migration.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Steering bar sends raw user input as Gemini prompt without sanitisation | Prompt injection: user could craft input that changes the agent's mission scope or leaks system prompt | Classify intent client-side first; send only the structured intent + parameters to the server, never raw strings |
| HITL approval endpoint lacks idempotency protection | Duplicate tour requests or repeated AI actions from double-submit | Add idempotency key (UUID) to approval requests; DB unique constraint on `(mission_id, draft_version, approved_by)` |
| Mission data accessible to other users via direct API call | User can poll another student's mission status if the API only checks `mission_id` without scoping to `auth.uid()` | RLS policy on `missions` table: `user_id = auth.uid()` for all operations; service-role calls explicitly log access reason |
| AI-drafted messages displayed verbatim without safety filter | Edge case: AI draft for a tour email contains PII or inappropriate content | Run Gemini safety settings at `BLOCK_MEDIUM_AND_ABOVE` for all HITL draft generation; show drafts in read-only preview before approval |

---

## UX Pitfalls

Specific to the chat → floating panel transition and AI mission UX.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Floating chat panel opens at full height by default | Obscures the listings view; feels intrusive; user immediately closes it | Default to minimised state (pill/tab at bottom-right); user explicitly expands to 60% height; remember preference in localStorage |
| Mission status only shows "Running..." with no progress detail | User cannot tell if the agent is stuck or making progress; abandons the mission | Show the last agent action as a sub-status: "Running — searching listings near Engineering Hall" — update every tool call |
| HITL draft card appears in the feed without visual priority | User misses the approval request; mission expires; user confused about why mission did not complete | Mark HITL cards with a distinct visual treatment (border colour, badge, gentle pulse animation) that differentiates them from informational cards |
| Steering bar input clears after submission | User cannot see what they submitted; hard to iterate on steering commands | Keep the submitted text in the input for 2 seconds after submission (fades to placeholder), or maintain a collapsible history of sent steers |
| No way to cancel an in-flight mission | AI is doing something the user changed their mind about; no escape | Every mission card shows a Cancel button that transitions the mission to `cancelled` status and stops all agent processing |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Font loading:** WOFF2 files in `public/fonts/`, `next/font/google` configured, font CSS variable mapped in Tailwind `@theme`, `adjustFontFallback: true` set, no FOUT visible on throttled-network test
- [ ] **Shadcn token merge:** Single `:root` block in `globals.css`, no conflicting custom property names, dark mode verified on every redesigned page, OKLCH values match Figma design
- [ ] **framer-motion boundary:** Zero `"use client"` in `page.tsx` or `layout.tsx` files added due to animation needs, `initial={false}` on AnimatePresence components, no hydration warnings in console
- [ ] **Lucide bundle:** `optimizePackageImports: ["lucide-react"]` present in `next.config.ts`, bundle analyser run confirming no icon library bloat
- [ ] **Mission HITL schema:** `draft_version` column on drafts table, `expires_at` column with cron cleanup, unique constraint on approval preventing double-submit, RLS policy scoping missions to `auth.uid()`
- [ ] **Floating panel persistence:** Panel renders in root layout (not page), `isOpen` + `conversationId` state lives in global store, panel survives Next.js route navigation without unmounting
- [ ] **Steering bar resilience:** `unknown_intent` handler returns visible clarification UI, intent classification logs stored for review, duplicate mission creation prevented by deduplication check
- [ ] **Tailwind v4 migration clean:** No `tailwind.config.js` remaining, `@tailwindcss/postcss` in PostCSS config, `tw-animate-css` replaces `tailwindcss-animate`, `@import "tailwindcss"` at top of `globals.css`

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Big-bang migration breaks multiple pages | HIGH | Feature-flag broken pages off; revert to page-by-page migration; use git worktree to keep old pages live |
| CSS token naming collision causes visual regressions | MEDIUM | Audit all custom property names with grep; rename conflicting variables systematically; run visual regression tests page-by-page |
| framer-motion "use client" propagation breaks RSC data fetching | MEDIUM | Extract animated elements to separate client component files; restore `"use client"` boundaries; re-test data fetching on affected pages |
| Font FOUT visible in production after deploy | LOW | Add `preload: true` to `next/font/google` config for above-the-fold font variants; verify `adjustFontFallback: true`; redeploy |
| Mission polling race condition causes state flicker | MEDIUM | Migrate polling to TanStack Query `refetchInterval`; add `staleTime` to prevent immediate overwrite after mutation |
| Stale HITL draft approved by user | HIGH | Add `draft_version` to schema, migration adds column with default, approval API validates version, display "newer draft available" error in UI |
| Double-submit creates duplicate tour requests | MEDIUM | Add `idempotency_key` unique constraint to tours table; run deduplication script to clean existing duplicates; disable submit button on click |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Big-bang migration breaks working features (#1) | Phase 1: Design System Foundation | All existing pages still pass E2E tests after Phase 1 |
| Shadcn CSS variable name collisions (#2) | Phase 1: Design System Foundation | Single `:root` block in globals.css; dark mode verified on old pages |
| framer-motion client component boundary (#3) | Phase 2: Marketing Landing Page (first use) | No `"use client"` in page.tsx files; no hydration warnings |
| Space Grotesk/DM Sans not on Google Fonts (#4) | Phase 1: Design System Foundation | `next/font/google` configured; no FOUT on throttled network |
| Lucide barrel import bundle bloat (#5) | Phase 1: Design System Foundation | `optimizePackageImports` in next.config.ts verified |
| Mission state polling race condition (#6) | AI Concierge Mission Board phase | TanStack Query used for all mission state; no setInterval in components |
| HITL draft stale/double-submit/timeout (#7) | AI Concierge HITL phase (schema first) | draft_version column present; submit button disables on click; expires_at enforced by cron |
| Steering bar ambiguous intent (#8) | AI Concierge Steering Bar phase | unknown_intent handler returns visible UI; tested with ambiguous inputs |
| Floating panel loses context on route change (#9) | Explore Page Split View phase | E2E test: open panel, navigate, verify panel state persists |
| Tailwind v4 build tooling breaks (#10) | Phase 1: Design System Foundation | `pnpm build` and `pnpm test` both pass after migration |

---

## Sources

- [shadcn/ui Tailwind v4 official docs](https://ui.shadcn.com/docs/tailwind-v4)
- [Tailwind CSS v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide)
- [Migrating Tailwind v3 to v4 with shadcn/ui — ZippyStarter](https://zippystarter.com/blog/guides/migrating-tailwind3-to-tailwind4-with-shadcn)
- [Theming shadcn with Tailwind v4 and CSS variables](https://medium.com/@joseph.goins/theming-shadcn-with-tailwind-v4-and-css-variables-d602f6b3c258)
- [framer-motion with Next.js Server Components](https://www.hemantasundaray.com/blog/use-framer-motion-with-nextjs-server-components)
- [framer-motion + Next.js 14 "use client" workaround](https://medium.com/@dolce-emmy/resolving-framer-motion-compatibility-in-next-js-14-the-use-client-workaround-1ec82e5a0c75)
- [framer-motion App Router shared layout animation GitHub issue](https://github.com/framer/motion/issues/1850)
- [How Next.js optimizes package imports (barrel files)](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)
- [Lucide icon bundle size GitHub issue](https://github.com/lucide-icons/lucide/issues/1733)
- [Tree shaking lucide-react with Vite](https://javascript.plainenglish.io/tree-shaking-lucide-react-icons-with-vite-and-vitest-57bf4cfe6032)
- [Next.js font optimization — official docs](https://nextjs.org/docs/app/getting-started/fonts)
- [Next.js custom self-hosted fonts — Vercel blog](https://vercel.com/blog/nextjs-next-font)
- [TanStack Query optimistic updates guide](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)
- [React stale closure in hooks — Dmitri Pavlutin](https://dmitripavlutin.com/react-hooks-stale-closures/)
- [Implementing HITL in AI workflows](https://dev.to/brains_behind_bots/implementing-human-in-the-loop-hitl-in-ai-workflows-a-practical-guide-3b6b)
- [Incremental vs big-bang migration strategy](https://medium.com/@navidbarsalari/%EF%B8%8F-incremental-vs-big-bang-migration-choosing-the-right-path-for-your-product-498521839a4d)
- [framer-motion layout animation performance — official docs](https://www.framer.com/motion/layout-animations/)
- [framer-motion AnimatePresence + layout animation GitHub issue](https://github.com/framer/motion/issues/1983)

---

*Pitfalls research for: CampusNest v1.1 — design system migration + AI Concierge addition*
*Researched: 2026-03-10*
