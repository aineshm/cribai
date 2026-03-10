# Architecture Research

**Domain:** AI-native student housing platform — v1.1 UI/UX upgrade + AI Concierge missions integration
**Researched:** 2026-03-10
**Confidence:** HIGH (existing codebase inspected in full, official docs verified)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Next.js 15 App Router                         │
├─────────────┬───────────────────────┬───────────────────────────────┤
│  Marketing  │   (campus) route grp  │       (auth) route grp        │
│  /          │   /[campusSlug]/...   │       /login /verify-edu      │
│  page.tsx   │   layout.tsx (shell)  │       (REDESIGN)              │
│  (REWRITE)  │   explore/ (NEW)      │                               │
│             │   concierge/ (NEW)    │                               │
│             │   listings/[id]/      │                               │
│             │   saved/              │                               │
│             │   submit-listing/     │                               │
├─────────────┴───────────────────────┴───────────────────────────────┤
│                    apps/web/components/                               │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────────┐  │
│  │ ui/ (shadcn)   │  │ chat/ (blocks)  │  │ concierge/ (NEW)     │  │
│  │ Button,Card    │  │ ChatBlockRend.  │  │ MissionCard, HITL    │  │
│  │ Sheet,Badge    │  │ MapBlock etc.   │  │ SteeringBar          │  │
│  │ (NEW)          │  │ (KEEP/REUSE)    │  │ FloatingChatPanel    │  │
│  └────────────────┘  └─────────────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│                    packages/ (shared workspace)                       │
│  ┌───────────────┐  ┌───────────────┐  ┌────────────────────────┐   │
│  │ ai/           │  │ types/        │  │ supabase/              │   │
│  │ CribAI engine │  │ Zod schemas   │  │ client.ts + server.ts  │   │
│  │ tools (6)     │  │ + mission.ts  │  │ (UNCHANGED)            │   │
│  │ + missions/   │  │ (NEW)         │  │                        │   │
│  │   (NEW)       │  │               │  │                        │   │
│  └───────────────┘  └───────────────┘  └────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│              Supabase (PostgreSQL + PostGIS + Realtime + Auth)        │
│  ┌─────────────┐  ┌────────────────────┐  ┌──────────────────────┐  │
│  │ listings    │  │ missions (NEW)     │  │ chat_conversations   │  │
│  │ saved_list. │  │ mission_steps (NEW)│  │ tour_requests        │  │
│  │ profiles    │  │                    │  │ notifications        │  │
│  └─────────────┘  └────────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `apps/web/app/page.tsx` | Marketing landing page | REWRITE — currently a stub |
| `apps/web/app/(auth)/login/` | OTP auth flow | REDESIGN — split layout with branded panel |
| `apps/web/app/(campus)/[campusSlug]/explore/` | Unified listings + map + floating AI chat | NEW — replaces `/listings` + `/cribai` |
| `apps/web/app/(campus)/[campusSlug]/concierge/` | AI missions board with HITL approval | NEW |
| `apps/web/components/ui/` | shadcn/ui primitives (Button, Card, Sheet, Badge, etc.) | NEW |
| `apps/web/components/concierge/` | Mission cards, HITL, steering bar, floating panel | NEW |
| `apps/web/components/chat/` | Existing block renderers (ChatBlockRenderer, MapBlock, etc.) | KEEP/REUSE inside floating panel |
| `packages/ai/src/missions/` | Mission executor using Gemini | NEW |
| `supabase/migrations/013_missions.sql` | missions + mission_steps tables + RLS | NEW |

## Recommended Project Structure

```
apps/web/
├── app/
│   ├── page.tsx                          # Marketing landing (full rewrite)
│   ├── layout.tsx                        # Root: Cabinet Grotesk + Satoshi fonts
│   ├── globals.css                       # @theme inline bridge for shadcn tokens
│   ├── (auth)/
│   │   └── login/page.tsx                # Redesigned split layout
│   ├── (campus)/[campusSlug]/
│   │   ├── layout.tsx                    # Campus shell + nav (add Concierge link)
│   │   ├── explore/
│   │   │   ├── page.tsx                  # Server: listings fetch + auth
│   │   │   └── explore-client.tsx        # Client: split view state + floating panel
│   │   ├── concierge/
│   │   │   ├── page.tsx                  # Server: missions fetch
│   │   │   └── concierge-client.tsx      # Client: mission board + steering bar
│   │   ├── listings/[id]/page.tsx        # Redesigned detail page
│   │   ├── saved/page.tsx                # Combined profile + saved tabs
│   │   └── submit-listing/page.tsx       # Multi-step wizard
│   └── api/
│       ├── ai/cribai/route.ts            # Existing SSE chat endpoint (UNCHANGED)
│       ├── missions/
│       │   ├── route.ts                  # POST: create mission, GET: list missions
│       │   └── [id]/
│       │       ├── route.ts              # GET: single mission with steps
│       │       └── approve/route.ts      # POST: HITL approve/reject draft
│       └── conversations/               # Existing (UNCHANGED)
├── components/
│   ├── ui/                              # shadcn/ui primitives (NEW)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── sheet.tsx
│   │   ├── badge.tsx
│   │   └── ...
│   ├── chat/                            # Existing chat blocks (KEEP as-is)
│   │   ├── chat-block-renderer.tsx
│   │   ├── chat-listing-card.tsx
│   │   └── ...
│   └── concierge/                       # NEW mission UI
│       ├── mission-card.tsx
│       ├── mission-step-timeline.tsx
│       ├── hitl-draft-approval.tsx
│       ├── steering-bar.tsx
│       └── floating-chat-panel.tsx      # Reuses CribAIChat hook internals
└── lib/
    └── dev-auth.ts                      # Existing (UNCHANGED)

packages/
├── ai/src/
│   ├── cribai.ts                        # Existing chat engine (UNCHANGED)
│   ├── missions/                        # NEW
│   │   ├── executor.ts                  # Mission orchestrator (Gemini)
│   │   └── steps.ts                     # Step type definitions
│   └── tools/                           # Existing 6 tools (UNCHANGED)
└── types/src/
    └── mission.ts                       # NEW Zod schema for mission/step

supabase/migrations/
└── 013_missions.sql                     # missions + mission_steps + RLS + publication
```

### Structure Rationale

- **`components/ui/`:** shadcn/ui adds primitives here via `npx shadcn@latest add`. Keeps primitives separate from feature components. Matches shadcn's own convention.
- **`components/concierge/`:** New feature folder mirrors the existing `components/chat/` pattern. Not mixed into the flat `components/` root.
- **`explore/explore-client.tsx`:** Server/client split follows the existing `cribai-page-client.tsx` pattern exactly. Server page handles auth + data fetch; client component owns UI state (map viewport, chat panel open/closed, filter state).
- **`packages/ai/src/missions/`:** Mission logic lives in the AI package (not the web app). Keeps the web app thin — it only handles HTTP and UI. The mission executor can be tested independently.

## Architectural Patterns

### Pattern 1: Server/Client Page Split

**What:** Every page with auth-gated data AND client-side state uses a server page component + a `'use client'` inner component. This is already the pattern in the codebase (`cribai-page-client.tsx`).

**When to use:** All new pages — explore, concierge, listing detail, saved/profile.

**Trade-offs:** One extra file per page, but a clean boundary — server handles auth/DB, client handles UI state.

**Example:**
```typescript
// explore/page.tsx (Server Component)
export default async function ExplorePage({ params }) {
  const { campusSlug } = await params;
  const listings = await fetchListings(campusSlug);
  const { user } = await getUser();
  return <ExploreClient listings={listings} isAuthenticated={!!user} campusSlug={campusSlug} />;
}

// explore/explore-client.tsx ('use client')
export function ExploreClient({ listings, isAuthenticated, campusSlug }) {
  const [chatOpen, setChatOpen] = useState(false);
  // split view state, floating panel toggle, map viewport
}
```

### Pattern 2: shadcn/ui + Tailwind v4 Token Bridge

**What:** The existing codebase uses CSS custom properties with its own naming (`--primary-600`, `--surface-50`, etc.) via `var()` throughout components. shadcn/ui expects `--background`, `--foreground`, `--primary`, etc., resolved via `@theme inline` in Tailwind v4.

**The constraint:** Both systems must coexist during the migration. Existing components keep `var(--primary-600)`. New shadcn components use `bg-primary`. The bridge maps old tokens to shadcn names.

**When to use:** This must be done once before adding any shadcn component. It is a prerequisite, not optional.

**Example:**
```css
/* globals.css — add BEFORE npx shadcn@latest init */

/* shadcn semantic token layer — maps to existing tokens */
:root {
  --background: var(--surface-50);
  --foreground: var(--surface-900);
  --primary: 13 148 136;       /* --primary-600 as raw HSL for shadcn */
  --primary-foreground: 255 255 255;
  --muted: var(--surface-100);
  --muted-foreground: var(--surface-500);
  --border: var(--surface-200);
  --ring: var(--primary-400);
  --card: var(--surface-50);
  --card-foreground: var(--surface-900);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
}
```

Source: [shadcn/ui Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) — HIGH confidence.

### Pattern 3: Framer Motion Client-Only Wrappers

**What:** Motion components require `'use client'`. Create thin wrapper components in `components/ui/` for animated layout primitives rather than annotating every page file.

**Import path:** Use `motion/react` (not the legacy `framer-motion`) for React 19 and App Router compatibility.

**When to use:** Page entrances, list item staggering, floating panel open/close (Sheet already handles this via shadcn), mission card status transitions.

**Example:**
```typescript
// components/ui/motion-list-item.tsx
'use client';
import { motion } from 'motion/react';

export function MotionListItem({
  children,
  index,
}: {
  children: React.ReactNode;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
```

Source: [Framer Motion with Next.js Server Components](https://www.hemantasundaray.com/blog/use-framer-motion-with-nextjs-server-components) — MEDIUM confidence (author-blog); verified by Next.js RSC boundary rules — HIGH.

### Pattern 4: Mission Status via Supabase Realtime

**What:** `missions` rows have a `status` column with a fixed pipeline (`pending → running → awaiting_approval → complete | failed`). The concierge page client subscribes to `postgres_changes` on that row. No polling.

**When to use:** `MissionCard` component on the concierge page. Also used for mission step trace updates.

**Trade-offs:** Requires `missions` added to the `supabase_realtime` publication in the migration. Simpler than SSE for this use case since the Supabase client is already initialized in every page.

**Example:**
```typescript
// components/concierge/mission-card.tsx
'use client';
useEffect(() => {
  const channel = supabase
    .channel(`mission-${missionId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'missions',
        filter: `id=eq.${missionId}`,
      },
      (payload) => {
        setStatus(payload.new.status as MissionStatus);
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [missionId, supabase]);
```

Source: [Supabase Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) — HIGH confidence.

### Pattern 5: HITL Approval Gate

**What:** The mission executor sets `status = 'awaiting_approval'` and writes a draft payload into `mission_steps`. The client receives the Realtime update and renders `HitlDraftApproval`. The user approves or rejects via `POST /api/missions/[id]/approve`.

**When to use:** Tour scheduling drafts, any agent action with external side effects (sending an email, submitting a form).

**Why not use Vercel AI SDK's built-in HITL:** The existing CribAI uses a custom SSE protocol, not Vercel AI SDK's `useChat`. Implementing HITL at the mission level (in the missions table) is cleaner than retrofitting the chat stream.

**Data flow:**
```
Gemini produces draft content
    ↓
executor.ts writes: missions.status = 'awaiting_approval'
                    mission_steps += { step_type: 'draft', payload: { ... } }
    ↓
Supabase Realtime pushes UPDATE → concierge-client.tsx re-renders
    ↓
HitlDraftApproval renders with draft content + Approve/Reject buttons
    ↓
User clicks Approve → POST /api/missions/[id]/approve
    ↓
Route handler resumes executor → status: 'running' → 'complete'
```

## Data Flow

### Explore Page (Unified Split View)

```
User visits /[campus]/explore
    ↓
Server page (page.tsx): Supabase query for listings + auth check
    ↓
ExploreClient renders: ListingsPanel (60%) | MapboxPanel (40%)
    ↓
User types in SteeringBar
    ↓
SteeringBar calls /api/ai/cribai (existing SSE endpoint — UNCHANGED)
    ↓
FloatingChatPanel (shadcn Sheet) opens, CribAI response streams in
    ↓
Chat listing cards in panel link back into main listings view
```

### AI Concierge Mission Flow

```
User submits intent in SteeringBar (concierge page)
    ↓
POST /api/missions → creates missions row (status: 'running')
    ↓
Mission executor (packages/ai/src/missions/executor.ts) invoked
    ↓ (writes steps to mission_steps table as it runs)
Supabase Realtime pushes UPDATE events to browser
    ↓
concierge-client.tsx updates MissionCard status live
    ↓ (if HITL required)
executor writes status = 'awaiting_approval' + draft in mission_steps
    ↓
HitlDraftApproval renders with draft for user review
    ↓
User approves → POST /api/missions/[id]/approve
    ↓
executor resumes → status = 'running' → 'complete'
```

### Font Migration Data Flow

```
Root layout.tsx:
  Remove: DM_Serif_Display + Inter (next/font/google)
  Add:    localFont for Cabinet Grotesk (variable: --font-display)
          localFont for Satoshi (variable: --font-body)
  Result: All components using var(--font-display) and var(--font-body)
          pick up new fonts automatically — zero component changes needed.
```

### CribAI Chat Refactor (Full-Page → Floating Panel)

```
EXISTING:
  CribAIChatPage → CribAIChat (self-contained component with all state)

v1.1:
  useCribAIChat hook (extract SSE logic + message state from cribai-chat.tsx)
      ↓
  FloatingChatPanel (Sheet wrapper) — uses useCribAIChat
  FullPageCribAI (if still needed for /cribai redirect fallback) — uses useCribAIChat
```

## Integration Points — New vs Modified vs Unchanged

### New Files

| File | Purpose |
|------|---------|
| `apps/web/components/ui/*.tsx` | shadcn/ui primitives |
| `apps/web/components/concierge/mission-card.tsx` | Mission status card with Realtime |
| `apps/web/components/concierge/mission-step-timeline.tsx` | Step-by-step trace view |
| `apps/web/components/concierge/hitl-draft-approval.tsx` | Approve/reject draft UI |
| `apps/web/components/concierge/steering-bar.tsx` | Intent input bar (reuses /api/ai/cribai) |
| `apps/web/components/concierge/floating-chat-panel.tsx` | Floating Sheet with CribAI inside |
| `apps/web/app/(campus)/[campusSlug]/explore/page.tsx` | Server page |
| `apps/web/app/(campus)/[campusSlug]/explore/explore-client.tsx` | Client split view |
| `apps/web/app/(campus)/[campusSlug]/concierge/page.tsx` | Server missions page |
| `apps/web/app/(campus)/[campusSlug]/concierge/concierge-client.tsx` | Client mission board |
| `apps/web/app/api/missions/route.ts` | POST create, GET list missions |
| `apps/web/app/api/missions/[id]/route.ts` | GET single mission |
| `apps/web/app/api/missions/[id]/approve/route.ts` | POST HITL approve/reject |
| `packages/ai/src/missions/executor.ts` | Mission orchestrator |
| `packages/ai/src/missions/steps.ts` | Step type definitions |
| `packages/types/src/mission.ts` | Zod schemas for missions |
| `supabase/migrations/013_missions.sql` | DB schema + RLS + Realtime pub |

### Modified Files

| File | Change | Risk |
|------|--------|------|
| `apps/web/app/layout.tsx` | Swap fonts (DM Serif → Cabinet Grotesk, Inter → Satoshi) | LOW — CSS var change only |
| `apps/web/app/globals.css` | Add `@theme inline` bridge for shadcn tokens | LOW — additive only |
| `apps/web/app/page.tsx` | Full rewrite — marketing landing | MEDIUM — replaces a stub |
| `apps/web/components/cribai-chat.tsx` | Extract `useCribAIChat` hook; keep component working | MEDIUM — preserve SSE logic |
| `apps/web/app/(campus)/[campusSlug]/*/page.tsx` (all pages) | Swap bespoke styles for shadcn primitives | MEDIUM — one page at a time |
| Campus `layout.tsx` | Add Concierge nav link | LOW |
| `next.config.ts` | Add redirects: `/listings` → `/explore`, `/cribai` → `/explore` | LOW |

### Unchanged Files (reused as-is)

| File | Reason |
|------|--------|
| `packages/ai/src/cribai.ts` | Core chat engine — no changes needed |
| `packages/ai/src/tools/` (all 6 handlers) | All tool handlers work unchanged |
| `apps/web/app/api/ai/cribai/route.ts` | Existing SSE endpoint consumed by steering bar |
| `apps/web/components/chat/` (all block components) | Block rendering reused inside FloatingChatPanel |
| `packages/supabase/` | No changes to clients |
| All Supabase migrations 001–012 | New schema is additive only |

## New Database Schema

### 013_missions.sql

```sql
-- missions: one row per user intent/task
create table missions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  campus_id   uuid not null references campus_configs(id),
  title       text not null,           -- "Find 1BR near engineering quad"
  intent      text not null,           -- raw user input from steering bar
  status      text not null default 'pending'
                check (status in ('pending','running','awaiting_approval','complete','failed')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- mission_steps: step-by-step trace of agent execution
create table mission_steps (
  id          uuid primary key default gen_random_uuid(),
  mission_id  uuid not null references missions(id) on delete cascade,
  step_type   text not null,           -- 'tool_call' | 'draft' | 'result' | 'error'
  tool_name   text,                    -- e.g. 'search_listings'
  payload     jsonb,                   -- tool args or draft content
  created_at  timestamptz default now()
);

-- RLS: users see only their own missions
alter table missions enable row level security;
create policy "users_own_missions" on missions
  for all using (auth.uid() = user_id);

alter table mission_steps enable row level security;
create policy "users_own_mission_steps" on mission_steps
  for all using (
    mission_id in (select id from missions where user_id = auth.uid())
  );

-- Enable Realtime for status push
alter publication supabase_realtime add table missions;
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–1k users | Current approach is fine. missions table + Realtime handles load. Next.js route handler can run executor inline (with Vercel Pro `maxDuration = 60`). |
| 1k–10k users | Move mission executor to Supabase Edge Function to avoid Next.js cold start + timeout issues on long multi-tool Gemini calls. |
| 10k+ users | Replace simple `status` column with durable state machine (LangGraph or Inngest). Add Gemini rate-limit queue. Upgrade Supabase plan for Realtime connection limits. |

### Scaling Priority

1. **First bottleneck:** Long-running mission executor. Multi-tool Gemini calls can take 15–30s. Vercel Hobby timeout is 10s. Vercel Pro allows 60s. Fix: upgrade tier or move executor to Edge Function before 1k users.
2. **Second bottleneck:** Supabase Realtime connection limits on the free/starter plan. Each user on the concierge page holds one channel open. Fix: upgrade Supabase plan.

## Anti-Patterns

### Anti-Pattern 1: Importing Motion in Server Components

**What people do:** Add `import { motion } from 'motion/react'` to a file without `'use client'`, or forget to add the directive when building a page that uses animations.

**Why it's wrong:** Throws a build-time error. Next.js 15 is strict about RSC boundaries. Motion requires browser APIs.

**Do this instead:** Create thin `'use client'` wrapper components in `components/ui/` (e.g., `MotionListItem`, `MotionSection`). Import those from Server Components. Never add `motion` to a file that is or might be a Server Component.

### Anti-Pattern 2: Adding shadcn Components Before the CSS Bridge

**What people do:** Run `npx shadcn@latest add button` before mapping the existing token names to shadcn's expected names in `globals.css`.

**Why it's wrong:** shadcn components use Tailwind utilities like `bg-primary`, `text-foreground`. In Tailwind v4, these map to `--color-primary`, `--color-foreground` via `@theme inline`. If those CSS variables are not defined, components render unstyled with no error.

**Do this instead:** Add the `@theme inline` bridge in `globals.css` first. Verify one component (Button) renders correctly with the correct colors before adding the full library.

### Anti-Pattern 3: Running Mission Executor Inline in the API Route Handler

**What people do:** Put the full Gemini agentic loop (which may call 3–5 tools and take 20–30 seconds) directly inside a Next.js API route handler.

**Why it's wrong:** Vercel serverless function timeout is 10s on Hobby, 60s on Pro. Multi-tool missions exceed both at scale. The function times out, the mission fails, the user sees an error.

**Do this instead:** The API route creates the mission row and returns immediately with the mission ID (202 Accepted). The executor runs as a detached process (Edge Function, or a fire-and-forget fetch to a background endpoint). The client subscribes to mission status via Realtime — it never waits on the HTTP response for completion.

### Anti-Pattern 4: Copying CribAIChat for the Floating Panel

**What people do:** Duplicate `cribai-chat.tsx` into a new `floating-chat-panel.tsx` and adjust the UI wrapper.

**Why it's wrong:** Two copies of the SSE parsing logic and message state. They diverge within one PR. Bug fixes must be applied twice.

**Do this instead:** Extract a `useCribAIChat(campusSlug, options)` hook from `cribai-chat.tsx`. The hook owns all SSE and message state. Both the legacy full-page CribAI view and the new floating panel use the same hook. The floating panel is just a different UI shell around the same state.

### Anti-Pattern 5: Routing the Explore Page Under /cribai

**What people do:** Enhance the existing `/cribai` route to include the split listings + map view rather than creating a new `/explore` route.

**Why it's wrong:** The explore page is a fundamentally different mental model (browse + search + chat unified) from the old full-page chat. Retrofitting into `/cribai` means the URL misleads users, the page carries accumulated technical debt, and it complicates the routing structure.

**Do this instead:** Create `/explore` as the new canonical route. Add redirects in `next.config.ts` from `/listings` and `/cribai` to `/explore`. Clean URL from day one, no accumulated debt.

### Anti-Pattern 6: Blocking the CSS/Font Swap on Component Work

**What people do:** Delay the font and token migration until components are being redesigned, then do it page-by-page.

**Why it's wrong:** Every page that goes out between now and the font migration looks inconsistent. The font swap is a 15-minute change to `layout.tsx` and `globals.css` that immediately improves every page at once.

**Do this instead:** Do the font swap and CSS bridge in Phase 1, before any component or page work begins. It is a prerequisite with zero risk.

## Suggested Build Order

Build bottom-up, respecting dependencies:

**Phase 1 — CSS Foundation (no UI risk, immediate improvement)**
- Update `globals.css`: add `@theme inline` shadcn bridge
- Update `layout.tsx`: swap fonts to Cabinet Grotesk + Satoshi
- Verify existing pages still look correct (fonts change, tokens stay working)

**Phase 2 — shadcn/ui Primitives**
- `npx shadcn@latest add button card badge sheet input select`
- Create `components/ui/` files
- Verify Button renders with correct brand colors before proceeding

**Phase 3 — Marketing + Auth Pages**
- Rewrite `apps/web/app/page.tsx` (marketing landing)
- Redesign `(auth)/login/` split layout
- These are standalone pages with no shared state dependencies — fastest visual wins

**Phase 4 — Explore Page**
- Requires: CSS done (1), shadcn Sheet for floating panel (2), Mapbox already present
- Extract `useCribAIChat` hook from `cribai-chat.tsx`
- Build `ExploreClient` + `FloatingChatPanel`
- Add `next.config.ts` redirects from `/listings` and `/cribai`

**Phase 5 — Listing Detail + Profile/Saved Redesigns**
- Independent page rewrites using new shadcn primitives
- Can be parallelized; no AI or DB dependencies

**Phase 6 — DB Schema + Mission Types**
- Write and apply `013_missions.sql`
- Enable Realtime publication for missions table
- Write `packages/types/src/mission.ts` Zod schemas
- Unit-testable: DB and types can be verified before UI work

**Phase 7 — Mission Executor + API Routes**
- Build `packages/ai/src/missions/executor.ts`
- Build `/api/missions/` route handlers
- Integration-testable with simple status checks before UI

**Phase 8 — Concierge Page**
- Requires phases 6 + 7 complete
- Build `MissionCard`, `HitlDraftApproval`, `SteeringBar`, `concierge-client.tsx`
- Add Realtime subscriptions

**Phase 9 — Post Sublease Wizard**
- Multi-step form, no AI dependencies
- Can run in parallel with phases 6–8

## Sources

- [shadcn/ui Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4) — CSS variable migration, `@theme inline` pattern — HIGH confidence
- [shadcn/ui Next.js installation](https://ui.shadcn.com/docs/installation/next) — init command, component addition — HIGH confidence
- [Framer Motion — motion/react import](https://www.hemantasundaray.com/blog/use-framer-motion-with-nextjs-server-components) — client component boundary — MEDIUM confidence (author-verified against RSC docs)
- [Supabase Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes) — subscription pattern, publication setup — HIGH confidence
- [Vercel AI SDK HITL pattern](https://ai-sdk.dev/cookbook/next/human-in-the-loop) — approval gate architecture reference — MEDIUM confidence (uses different SDK, but pattern is transferable)
- Codebase inspection: `apps/web/`, `packages/ai/`, `supabase/migrations/` — verified 2026-03-10

---
*Architecture research for: CampusNest v1.1 — UI/UX upgrade + AI Concierge integration*
*Researched: 2026-03-10*
