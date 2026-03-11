# Stack Research

**Domain:** UI/UX Design System Migration + AI Concierge Missions (CampusNest v1.1)
**Researched:** 2026-03-10
**Confidence:** HIGH (all core libraries verified against official docs + shadcn/ui Tailwind v4 page)
**Scope:** NEW additions only. Existing stack (Next.js 15, Supabase, Gemini, Mapbox, Vitest, Playwright, Sonner) is proven and not re-evaluated.

---

## What This Research Covers

The v1.1 milestone adds:
1. Design system migration — Space Grotesk + DM Sans fonts, shadcn/ui components, Lucide icons, framer-motion animations
2. AI Concierge missions page — task-based agent pipeline with status polling, draft approval (HITL), and an intent-parsing steering bar

---

## Recommended Stack

### Core New Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `shadcn/ui` | latest CLI (`shadcn@latest`) | Accessible, copy-owned UI primitives built on Radix UI | Tailwind-native, full Tailwind v4 support shipped Q1 2025. Components are owned source code (not a library dependency), so zero versioning churn. CSS variables integrate directly with existing `globals.css` token system. Already decided in PROJECT.md. |
| `motion` (formerly `framer-motion`) | ^12.x (`framer-motion` entrypoint) | Spring physics, layout animations, presence/exit transitions | Rebranded from framer-motion in late 2024. New import path is `import { motion, AnimatePresence } from 'framer-motion'`. API identical to framer-motion. v12 is current stable. Industry standard for React spring animations. |
| `lucide-react` | ^0.468+ | SVG icon set matching shadcn/ui ecosystem | Tree-shakeable ES modules — only imported icons ship. Named imports (`import { Home } from 'lucide-react'`) are fully typed. Bundled with shadcn/ui CLI so no separate decision needed. Replaces inline Heroicon SVGs. |
| `tw-animate-css` | ^1.x | Tailwind v4 animation utilities (shadcn accordion, dialog, etc.) | shadcn/ui deprecated `tailwindcss-animate` in favor of `tw-animate-css` for Tailwind v4 compatibility. CSS-first approach, no JS plugin. Replace `@plugin 'tailwindcss-animate'` with `@import "tw-animate-css"` in `globals.css`. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `class-variance-authority` | ^0.7.0 | Type-safe component variant definitions | Installed by shadcn/ui CLI. Use when building custom variant components (e.g., Button with `primary`/`secondary`/`ghost` variants). |
| `clsx` | ^2.1.0 | Conditional className construction | Installed by shadcn/ui CLI. Use in `cn()` utility (`clsx` + `tailwind-merge` combined). |
| `tailwind-merge` | ^2.x | Merge Tailwind classes without conflicts | Installed by shadcn/ui CLI. Use in `cn()` utility to prevent class collisions when combining dynamic styles. |

### Font Loading

| Font | Delivery Method | Why |
|------|----------------|-----|
| Space Grotesk | `next/font/google` with downloaded WOFF2 files | Not on Google Fonts. Free to download from cdnfonts.com / fontsource. Place in `apps/web/public/fonts/cabinet-grotesk/`. Use variable font weights (400–800). |
| DM Sans | `next/font/google` with downloaded WOFF2 files | Not on Google Fonts. Download from fontsource or cdnfonts.com. Place in `apps/web/public/fonts/satoshi/`. Use for body text (replaces Inter). |

**Implementation pattern for `apps/web/app/layout.tsx`:**
```typescript
import localFont from 'next/font/google';

const cabinetGrotesk = localFont({
  src: [
    { path: '../public/fonts/cabinet-grotesk/CabinetGrotesk-Regular.woff2', weight: '400' },
    { path: '../public/fonts/cabinet-grotesk/CabinetGrotesk-Medium.woff2', weight: '500' },
    { path: '../public/fonts/cabinet-grotesk/CabinetGrotesk-Bold.woff2', weight: '700' },
    { path: '../public/fonts/cabinet-grotesk/CabinetGrotesk-Extrabold.woff2', weight: '800' },
  ],
  variable: '--font-cabinet',
  display: 'swap',
});

const satoshi = localFont({
  src: [
    { path: '../public/fonts/satoshi/DM Sans-Regular.woff2', weight: '400' },
    { path: '../public/fonts/satoshi/DM Sans-Medium.woff2', weight: '500' },
    { path: '../public/fonts/satoshi/DM Sans-Bold.woff2', weight: '700' },
  ],
  variable: '--font-satoshi',
  display: 'swap',
});
```

Then update `globals.css`:
```css
/* Replace existing font token */
--font-display: var(--font-cabinet), system-ui, sans-serif;
--font-body: var(--font-satoshi), system-ui, sans-serif;
```

### Mission State Management (AI Concierge)

| Technology | Purpose | Why |
|------------|---------|-----|
| Supabase `missions` table (new) | Persist agent task state | Fits existing Supabase-first architecture. Single source of truth shared between Next.js route handlers (write) and client (read). |
| React `useInterval` polling hook (custom, ~20 lines) | Poll `missions` table every 5s for status updates | Vercel serverless functions don't support persistent WebSocket connections. SSE works but adds streaming complexity for a status column (enum string). Simple 5s interval poll is sufficient — missions change state at most once per minute in practice. No new library needed. |
| Supabase Realtime (existing) | Push mission status to connected clients | Already in `@supabase/supabase-js`. Use as upgrade path if polling proves too slow. Subscribe to `missions` table `UPDATE` filtered by `user_id`. Zero new dependencies. |

**Decision: Start with polling, not SSE or WebSocket.**
- Vercel blocks persistent WebSocket connections in serverless mode.
- SSE (`ReadableStream` route handler) is viable but adds ~50 lines of boilerplate for what amounts to a status string.
- 5s polling is imperceptible lag for a task that takes 30–120 seconds.
- Upgrade to Supabase Realtime if `pending → running → done` transition needs sub-second UI response.

### Intent Parsing (Steering Bar)

| Technology | Purpose | Why |
|------------|---------|-----|
| Gemini 2.5 Flash (existing `@google/genai`) | Parse steering bar free-text into structured mission amendment | Zero new dependency. The existing CribAI agentic loop pattern applies: send "amend mission" prompt with current mission state + user input, receive structured `{ action, params }` via function calling. |

**No new library needed.** The steering bar is a text input that fires a POST to a Next.js route handler, which calls Gemini with the current mission context and returns an amendment action. Same pattern as the existing 11-tool CribAI loop.

---

## Installation

```bash
# 1. Initialize shadcn/ui (run from apps/web — reads existing tsconfig paths @/*)
cd apps/web
pnpm dlx shadcn@latest init -t next

# 2. Core animation utilities (shadcn/ui requires tw-animate-css for Tailwind v4)
pnpm add tw-animate-css --filter @campusnest/web

# 3. Motion (framer-motion v2 — new package name)
pnpm add motion --filter @campusnest/web

# shadcn/ui CLI installs these automatically:
# class-variance-authority, clsx, tailwind-merge, lucide-react

# 4. Font files (manual download — no npm package)
# Download Space Grotesk WOFF2 files from cdnfonts.com
# Download DM Sans WOFF2 files from fontsource or cdnfonts.com
# Place in apps/web/public/fonts/{cabinet-grotesk,satoshi}/
```

**No new database tables beyond `missions` for the AI Concierge feature.**

---

## Tailwind v4 + shadcn/ui Configuration

The project already uses Tailwind v4 (`@import "tailwindcss"` in `globals.css`). The shadcn/ui CLI will update `globals.css` to add `@theme inline` directives. Key changes after init:

```css
/* Replace this (tailwindcss-animate was never used in this project, skip) */
/* Add after @import "tailwindcss": */
@import "tw-animate-css";

/* shadcn/ui adds @theme inline block — merge with existing :root tokens */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  /* ... shadcn color tokens ... */
}
```

**Critical:** Existing `globals.css` CSS custom properties (e.g., `--primary-500`, `--surface-100`) use a different naming convention than shadcn/ui defaults (`--background`, `--foreground`, `--primary`). Reconcile during migration: either adopt shadcn naming fully or map existing tokens into the shadcn theme namespace.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `motion` (`framer-motion` import) | `framer-motion` | Both packages are identical — `framer-motion` still receives updates. Use `framer-motion` if you have existing imports and want zero-change migration. |
| `shadcn/ui` (copy-paste model) | `@radix-ui/react-*` directly | Use Radix directly if you need full control with no pre-styled layer. shadcn is Radix + styling — it's not an abstraction on top, it's Radix with owned CSS. |
| Supabase Realtime | SSE route handler | Use SSE if mission updates need sub-2-second latency without upgrading to Realtime. Pattern: `ReadableStream` in Next.js route handler, `EventSource` on client. |
| `next/font/google` (manual files) | Google Fonts CDN for Space Grotesk/DM Sans | Neither font is on Google Fonts. CDNFonts/Fontsource are alternatives but `next/font/google` provides automatic subsetting, preload hints, and zero external DNS request at runtime. |
| `tw-animate-css` | `tailwindcss-animate` (v3 only) | `tailwindcss-animate` does not support Tailwind v4. Do not use. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `tailwindcss-animate` | Tailwind v3 plugin only. Incompatible with `@import "tailwindcss"` v4 syntax. shadcn/ui explicitly deprecated it. | `tw-animate-css` |
| `framer-motion` (new code) | Still works, but the package is being maintained under the `motion` name going forward. New code should use `framer-motion` imports. | `motion` with `import { motion } from 'framer-motion'` |
| WebSocket server (e.g., `ws`, Pusher) | Vercel serverless functions terminate at 30s — persistent WS connections are not supported without upgrading to Vercel Pro Edge + custom WS infra. | Supabase Realtime (already provisioned) or polling |
| LangGraph / Inngest for mission state | v1.1 uses simple status enum column. State machine frameworks are deferred to v2 per PROJECT.md. | `missions` table with `status` enum + polling |
| Heroicons (inline SVGs) | Manual copy-paste, not tree-shakeable, inconsistent sizing props. | `lucide-react` named imports |
| `@next/font` (deprecated package) | Merged into `next` since Next.js 13.2. Using the old package causes duplicate font loading. | `import localFont from 'next/font/google'` |
| Google Fonts CDN at runtime | CSP header blocks external font sources except `fonts.gstatic.com`. Space Grotesk and DM Sans are not on Google Fonts anyway. | `next/font/google` with local WOFF2 files |

---

## Stack Patterns by Variant

**For motion components in Server Components (App Router):**
- `motion.*` components require `'use client'` — they cannot be used directly in server components.
- Pattern: Create thin client wrapper files (`apps/web/components/motion/`) that re-export typed motion elements. Server components import the wrapper. This is the established Next.js 15 pattern per the community.

```typescript
// apps/web/components/motion/index.tsx
'use client';
export { motion, AnimatePresence } from 'framer-motion';
```

**For shadcn/ui in a monorepo:**
- Run `pnpm dlx shadcn@latest init` from `apps/web/`, not the root. The CLI reads `apps/web/tsconfig.json` for the `@/*` path alias.
- Components install into `apps/web/components/ui/` by default. This is correct — do not move them to a shared package unless you have multiple apps consuming them (CampusNest is single-app for v1.1).

**For the `cn()` utility:**
- shadcn/ui CLI creates `apps/web/lib/utils.ts` with the canonical `cn` function. Check if one already exists in `apps/web/lib/` and consolidate.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `shadcn@latest` CLI | Next.js 15, React 19, Tailwind v4 | Full support confirmed on shadcn/ui docs as of 2025. React 19 peer dep resolved. |
| `motion` ^12.x | React 19, Next.js 15 | Tested with Next.js 16 + React 19 per community reports. v12.35.2 is current stable as of early 2026. |
| `lucide-react` ^0.468+ | React 19 | Included by shadcn/ui CLI. Named imports provide tree shaking. |
| `tw-animate-css` ^1.x | Tailwind v4 only | CSS-first, no JS plugin. Drop-in `@import` replacement for `tailwindcss-animate`. |
| `next/font/google` | Next.js 15, App Router | Built into `next` package since 13.2. No separate install. Works with variable fonts. |
| `class-variance-authority` ^0.7.0 | React 19 | Installed by shadcn/ui CLI. |
| `clsx` ^2.1.0 | Any | Zero dependencies. |
| `tailwind-merge` ^2.x | Tailwind v4 | v2+ required for Tailwind v4 class detection. |

---

## CSP Header Impact

The existing `next.config.ts` has a strict CSP. Two changes needed for v1.1:

1. **Local fonts** — no CSP change needed. `next/font/google` serves fonts from `/_next/static/` (same origin).
2. **motion (framer-motion)** — pure client-side JS, no external requests. No CSP change.
3. **shadcn/ui** — no external requests. No CSP change.

The existing `font-src 'self' https://fonts.gstatic.com` can be simplified to `font-src 'self'` once the Google Fonts CDN import is removed from `layout.tsx`.

---

## Migration Checklist for layout.tsx

Current state uses `DM_Serif_Display` and `Inter` from `next/font/google`. Replace with:

1. Remove `import { DM_Serif_Display, Inter } from 'next/font/google'`
2. Add `import localFont from 'next/font/google'`
3. Define `cabinetGrotesk` and `satoshi` with local font configs (see pattern above)
4. Update `className` on `<html>` to use new CSS variable names
5. Update `globals.css` `--font-display` and `--font-body` tokens
6. Simplify CSP `font-src` to `'self'` only

---

## Sources

- [shadcn/ui Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) — confirmed Tailwind v4 + React 19 support, tw-animate-css requirement
- [shadcn/ui Next.js installation docs](https://ui.shadcn.com/docs/installation/next) — CLI command, monorepo flag
- [shadcn/ui manual installation docs](https://ui.shadcn.com/docs/installation/manual) — full dependency list
- [shadcn/ui React 19 docs](https://ui.shadcn.com/docs/react-19) — React 19 peer dep status HIGH confidence
- [motion.dev upgrade guide](https://motion.dev/docs/react-upgrade-guide) — framer-motion → framer-motion migration MEDIUM confidence (WebSearch)
- [tw-animate-css npm](https://www.npmjs.com/package/tw-animate-css) — Tailwind v4 animation replacement MEDIUM confidence (WebSearch)
- [lucide-react official docs](https://lucide.dev/guide/packages/lucide-react) — tree shaking pattern HIGH confidence
- [Next.js font optimization docs](https://nextjs.org/docs/app/getting-started/fonts) — localFont API HIGH confidence
- [SSE vs WebSocket vs polling comparison](https://dev.to/haraf/server-sent-events-sse-vs-websockets-vs-long-polling-whats-best-in-2025-5ep8) — mission state pattern rationale MEDIUM confidence

---

*Stack research for: CampusNest v1.1 UI/UX upgrade + AI Concierge*
*Researched: 2026-03-10*
