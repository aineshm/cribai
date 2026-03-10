# Feature Research

**Domain:** AI-native student housing platform — v1.1 UI/UX upgrade + AI Concierge missions
**Researched:** 2026-03-10
**Confidence:** HIGH (design system patterns) / MEDIUM-HIGH (AI Concierge UX, real estate explore patterns)

---

## Context: v1.0 Already Built

The following are fully shipped and must NOT be redesigned from scratch — only reskinned:

| Existing Feature | Current State |
|-----------------|---------------|
| OTP auth with .edu validation | Built — page exists, needs layout redesign |
| Multi-source scraper + nightly pipeline | Built — backend only, no redesign needed |
| Semantic search via pgvector + Gemini | Built — powers the explore page AI chat |
| Mapbox map blocks in CribAI chat | Built — needs migration to floating panel |
| Save/favorite listings with dedicated page | Built — needs profile/saved tab merge |
| Real-time price change notifications | Built — notification bell component exists |
| Photo galleries on listing detail | Built — `listing-photo-gallery.tsx` exists |
| CribAI with 11 function-calling tools | Built — powers both chat and AI Concierge |
| DB-backed conversation persistence + sidebar | Built — needs nav integration only |
| Manual listing submission form | Built — needs wizard redesign |
| Tour scheduling with conflict detection | Built — backend complete |
| Freshness indicators, fairness badge | Built — components exist |

**Design system currently in use:** Tailwind v4 with custom classes, Heroicons, no animation library, no component primitives.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features v1.1 users assume exist. Missing or broken = product feels unpolished or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Design system consistency** | Apps without visual coherence feel unfinished. Students compare CampusNest to Zillow and Apartments.com which have polished design systems. First impression determines trust. | MEDIUM | shadcn/ui primitives must underlie all new components. Cabinet Grotesk + Satoshi fonts via `@next/font`. Single `globals.css` token layer. Components live-in-repo (shadcn philosophy: you own the code). |
| **Marketing landing page** | Any SaaS/platform product needs a public-facing homepage for unauthenticated users, new signups, and Google SEO. Without one, sharing the URL shows a blank auth page. | MEDIUM | Hero + social proof + how-it-works + features section + CTA. ~5 sections. Framer Motion scroll-triggered entry animations. Must convert visitors to auth flow. |
| **Auth page with branded layout** | Login/signup pages with no brand identity feel like they belong to a different product. Generic auth = low trust. | LOW-MEDIUM | Split-panel: left = brand illustration/animated gradient, right = OTP form. Existing OTP logic stays, only layout changes. Multi-step: email input → OTP verify → profile setup (if new user). |
| **Explore page with split list+map view** | Zillow, Redfin, and Apartments.com all use split-view explore as the industry standard. Students expect to see listings AND their map position simultaneously. | HIGH | 60% list / 40% map split. Filter chips as horizontal scrollable row (not a modal). Floating CribAI panel replaces the separate /cribai route. This is the highest-traffic page. |
| **Listing detail with photo grid + sticky CTA** | Users expect property photos to be prominent (not buried), and the primary action (schedule tour / save) to always be visible while scrolling. Industry standard since Airbnb popularized it. | MEDIUM | 2-col layout: main content left, sticky sidebar right with CTA card. Photo gallery as masonry grid or hero+thumbnails strip. Address, price, fairness badge, true cost above fold. |
| **Consistent icon system** | Mixing Heroicons and Lucide (or emoji) across pages looks unfinished. A single icon library is a baseline design quality signal. | LOW | Swap all icons to Lucide React. Tree-shakeable, matches shadcn/ui ecosystem. Single audit pass across all components. |
| **Page transition animations** | Static page-to-page navigation feels dated. Modern web apps (Vercel, Linear, Notion) use subtle entrance animations to signal quality. | LOW-MEDIUM | Framer Motion `AnimatePresence` for route transitions. Spring physics for mounted components. Avoid overuse — every element should not animate. |
| **Profile/saved combined page** | Users expect a unified account page (Airbnb, Zillow both combine saved/profile under account). Separate pages create unnecessary navigation friction. | LOW-MEDIUM | Tabs: "Saved Listings" + "Settings" (profile form). Profile header with avatar, name, university, campus. Reuse existing `heart-button.tsx` and `profile-form.tsx` internals. |

### Differentiators (Competitive Advantage)

Features that define CampusNest v1.1's edge. These are not table stakes — students do not have them from competitors.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **AI Concierge missions page** | No competitor (Zillow, Apartments.com, Redfin) offers task-based agentic housing search. Missions like "Find me 5 options under $800, compare them, and draft tour requests" execute asynchronously and return structured results. This is the flagship v1.1 differentiator. | HIGH | New page at `/[campusSlug]/concierge`. Mission cards with 5-state pipeline: Queued → In Progress → Action Needed → Draft Approval → Completed. HITL approval gates draft tour/compare outputs. Polling via Supabase Realtime on `missions` table. |
| **HITL draft approval flow** | Agents making irreversible actions (scheduling tours, sending messages to landlords) without human sign-off is a UX anti-pattern. Showing drafts for approval before execution builds trust and converts more completions. | MEDIUM | "Action Needed" and "Draft Approval" states render a review card with Approve / Edit / Reject controls. On approve, mission resumes execution. Uses the existing tour scheduling tool as the first action requiring approval. |
| **Steering bar for mid-mission correction** | Users discover their mission needs adjustment mid-execution (wrong price range, different neighborhood). Mid-task steering without losing context is an emerging differentiator from 2025 agentic systems. | MEDIUM | Persistent input bar at the bottom of an active mission. Pre-populated with the original prompt. Submit a correction re-queues with updated context. Framer Motion slide-in from bottom. |
| **Agent summary + raw logs toggle** | Power users want to see what the AI actually did. Beginner users want a 2-sentence summary. Both expectations must be met without clutter. | LOW-MEDIUM | Accordion-style: summary (always visible) + "View agent steps" expands a timeline of tool calls with icons (search, compare, map, etc). Reuses data already logged to conversation turns. |
| **Proactive empty state with mission templates** | A blank concierge page loses 60% of users before they start (per research). Suggesting ready-made mission templates converts first-time users into active ones. | LOW | On zero missions: show 3-4 template cards ("Find 3BR under $800 near campus", "Compare downtown vs near-campus options", "Schedule tours for my saved listings"). One-click pre-fills the mission input. |
| **Floating CribAI panel on explore page** | Replacing the separate `/cribai` route with a contextual panel on the explore page creates a seamless "search while chatting" experience. No competitor offers side-by-side AI chat + map + list filtering in one view. | HIGH | Panel slides in from right. Shares listing search state (filters applied in panel reflect in list, and vice versa). Dismissible. Re-openable via floating FAB. Requires shared state layer (React context or URL params). |
| **AI lease summary on listing detail** | No student housing platform summarizes lease terms in plain English from the listing data. Displaying a 3-bullet AI summary ("12-month lease, pets allowed with $200 deposit, utilities separate") removes a major friction point for students. | MEDIUM | Gemini call against listing data + lease_terms KB at render time. Cached in listing record after first generation. Renders in the listing detail sidebar. Falls back gracefully if data insufficient. |
| **Commute section on listing detail** | Distance and commute time to campus is the #1 filter criterion for students. Building it into the detail page (not just the map pin) is a concrete differentiator vs generic real estate sites. | MEDIUM | Campus-to-listing commute: walking, biking, transit, driving. Use Mapbox Directions API (already integrated). Display as 4-chip row with icons. Depends on campus config having lat/lng (already in DB). |
| **Post sublease wizard** | Students need to sublet during summers/study abroad. Facebook groups and Craigslist are the current solutions — terrible UX. A guided multi-step form with progress sidebar positions CampusNest as the canonical student sublease platform. | MEDIUM-HIGH | Steps: Lease details → Pricing → Photos → Campus/Location → Review → Submit. Sidebar progress tracker shows completed/active/pending steps. React Hook Form + Zod validation per step. Photo upload to Supabase Storage. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Fully autonomous agent (no approval gates)** | "Just do everything automatically" sounds faster. | Scheduling tours or contacting landlords without user approval creates real-world consequences students may not want. Trust requires visibility. Legal and liability exposure if agent acts on stale listings. | HITL draft approval at all irreversible actions. Show what will happen before it happens. |
| **Real-time agent execution feedback (streaming logs)** | Feels more transparent and alive. | Streaming tool call logs are noise. Most steps complete in <2 seconds. Streaming creates visual churn without user value. High implementation complexity for negligible UX gain. | Show a progress indicator (spinner/pulse) while in-progress, then reveal the summary once done. Reserve raw logs for the expandable toggle. |
| **Generative UI (agent returns component JSON)** | Future-forward, fully dynamic layouts. | Dramatically increases complexity: type safety, rendering safety, fallback handling, accessibility. Out of scope per PROJECT.md for v1.1. No established pattern to copy from. | Hardcoded mission card types for v1.1. Generative UI is a v2+ investigation once mission types stabilize. |
| **Full state machine backend (LangGraph)** | Correctness, retries, observability at scale. | Over-engineered for v1.1 with one campus and unknown mission volume. LangGraph adds deployment complexity. Not needed until missions need retry logic and cross-session recovery. | Simple `missions` table with status column + Supabase Realtime polling. Per PROJECT.md explicit decision. |
| **Traditional filter page as standalone route** | Familiar from desktop web circa 2015. | Violates the "AI chat replaces the filter box" core value. Keeping a full filter page implies AI search is optional. Creates two competing search paradigms. | Integrate filter chips into the explore page header. Keep them minimal and AI-readable (so AI understands context when filters are active). |
| **Infinite scroll on listing grid** | Familiar from social media. | Prevents users from developing a mental map of how many listings exist. Paginated grid with "Load more" is less disorienting in housing context where options are limited (50-200 listings per campus). | Paginated grid, 12-24 listings per page. Total count visible ("47 listings near campus"). |
| **Dark mode** | Nice-to-have, often requested. | Doubles the CSS variables surface area. Cabinet Grotesk and Satoshi are tuned for light contexts. Design system tokens need full second pass. | Ship light mode only for v1.1. Add dark mode toggle as a standalone v1.2 enhancement once token layer is stable. |
| **Animation on every element** | Motion feels premium. | Overuse of Framer Motion degrades perceived performance on low-end devices. Every animated element adds a JS listener. Too much motion = vestibular disorder accessibility issue. | Animate page entrances, modal/drawer open/close, and listing card hover states only. Static for tables, text, and utility components. |

---

## Feature Dependencies

```
Design System (shadcn/ui + tokens + fonts)
    └──required by──> ALL new pages and components
                     ├── Landing page
                     ├── Auth redesign
                     ├── Explore page redesign
                     ├── Listing detail redesign
                     ├── Post sublease wizard
                     ├── Profile/saved page
                     └── AI Concierge page

Explore page (split list+map)
    ├──requires──> Existing listings API (already built)
    ├──requires──> Mapbox integration (already built)
    ├──requires──> Filter chips state (new, shared with AI panel)
    └──enhances──> Floating CribAI panel (shares filter state)

Floating CribAI panel
    ├──requires──> Existing CribAI conversation API (already built)
    ├──requires──> Shared filter/context state with explore page
    └──replaces──> Separate /cribai route (retire that route)

AI Concierge page
    ├──requires──> New `missions` table (Supabase migration)
    ├──requires──> Mission executor (new API route, wraps existing tools)
    ├──requires──> Supabase Realtime on missions (status polling)
    ├──requires──> Auth (user-scoped missions)
    └──HITL draft approval──requires──> Review card UI + approve/reject API

Listing detail redesign
    ├──requires──> Existing listing data API (already built)
    ├──requires──> Photo gallery component (already built, needs reskin)
    ├──requires──> AI lease summary (new Gemini call, cached in DB)
    └──requires──> Commute section (Mapbox Directions API, campus config)

Post sublease wizard
    ├──requires──> Auth
    ├──requires──> Supabase Storage for photo uploads (new bucket)
    ├──requires──> `sublets` table (schema exists, needs full activation)
    └──requires──> Campus assignment (campus_id from user profile)

Profile/saved page
    ├──requires──> Auth
    ├──requires──> Existing saved listings API (already built)
    └──requires──> Existing profile form (already built, needs reskin)
```

### Dependency Notes

- **Design system must be Phase 1:** Every subsequent page depends on it. Building explore or concierge before the token layer is stable causes rework.
- **Explore page before AI Concierge:** The floating panel on explore and the concierge page share tool/search infrastructure. Explore validates that the tools work in the new UI before concierge adds async mission complexity.
- **Missions table is a new DB migration:** Must be written and applied before the concierge page can be developed or tested.
- **Post sublease wizard requires Supabase Storage:** The `sublets` schema exists but the photo upload infrastructure does not. This is a prerequisite for the wizard to be feature-complete.
- **Landing page and auth redesign are independent:** Can be built in any order after the design system.

---

## MVP Definition

### v1.1 Launch With (All Required for Milestone)

- [ ] **Design system** — Cabinet Grotesk + Satoshi + shadcn/ui + Lucide + Framer Motion base. Prerequisite for everything.
- [ ] **Landing page** — Marketing page for unauthenticated users. Entry point for all new users.
- [ ] **Auth page redesign** — Split-panel branded layout. First post-landing impression.
- [ ] **Explore page** — Split list+map with filter chips + floating CribAI panel. Core product interaction.
- [ ] **Listing detail redesign** — Photo grid, sticky CTA, AI lease summary, commute section.
- [ ] **Post sublease wizard** — Multi-step with sidebar tracker. Enables supply-side growth.
- [ ] **Profile/saved page** — Combined tabbed page. Account management.
- [ ] **AI Concierge page** — Mission cards, 5-state pipeline, HITL draft approval, steering bar, raw logs toggle.

### Add After v1.1 Validation

- [ ] **Proactive mission templates (empty state)** — Trigger: if <10% of users create their first mission within 3 days of account creation.
- [ ] **Dark mode** — Trigger: user request volume or design system token stability.
- [ ] **More AI Concierge mission types** — Trigger: once volume data shows which mission types users request most.

### Future Consideration (v2+)

- [ ] **Generative UI in concierge** — Agent returns component JSON. Deferred; needs stable mission type inventory first.
- [ ] **Full LangGraph state machine backend** — Correctness and retries at scale. Deferred per PROJECT.md explicit decision.
- [ ] **Landlord-facing mission types** — "Find a tenant for my 2BR opening in May." Requires PM platform.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Design system migration | HIGH | MEDIUM | P1 |
| Landing page | HIGH | MEDIUM | P1 |
| Explore page (split + floating panel) | HIGH | HIGH | P1 |
| AI Concierge missions page | HIGH | HIGH | P1 |
| Listing detail redesign | HIGH | MEDIUM | P1 |
| Auth page redesign | MEDIUM | LOW | P1 |
| Post sublease wizard | MEDIUM | MEDIUM-HIGH | P1 |
| Profile/saved page | MEDIUM | LOW | P1 |
| HITL draft approval | HIGH | MEDIUM | P1 |
| Steering bar | MEDIUM | MEDIUM | P1 |
| AI lease summary | MEDIUM | MEDIUM | P2 |
| Commute section | HIGH | MEDIUM | P2 |
| Agent summary + raw logs toggle | MEDIUM | LOW | P2 |
| Proactive empty state templates | MEDIUM | LOW | P2 |
| Dark mode | LOW | MEDIUM | P3 |
| Generative UI | HIGH (long-term) | HIGH | P3 |

**Priority key:**
- P1: Must have for v1.1 milestone launch
- P2: Should have — include if time permits, not a blocker
- P3: Nice to have — future consideration

---

## Competitor Feature Analysis

| Feature | Zillow / Apartments.com | Redfin | CampusNest v1.1 |
|---------|------------------------|--------|-----------------|
| Split list+map explore | Yes — industry standard | Yes — Redfin pioneered it | Yes + floating AI panel alongside |
| Filter chips on explore | Yes — full filter panel | Yes — top bar with filter chips | Yes — minimal chips, AI-first, filters sync with chat |
| Listing detail photo gallery | Yes — full-screen slideshow | Yes — hero + thumbnail strip | Yes — masonry grid or hero+strip |
| Sticky CTA on listing detail | Partial — "Contact" button | Yes — sticky agent contact bar | Yes — "Schedule Tour" + "Save" always visible |
| AI chat assistant | Zillow: ChatGPT plugin (2025) | No | Yes — floating panel in explore, separate CribAI |
| Agentic task missions | No competitor | No competitor | Yes — flagship differentiator |
| HITL draft approval | No competitor | No competitor | Yes |
| Sublease posting | Craigslist-tier | No | Yes — guided wizard |
| AI lease summary | No competitor | No competitor | Yes |
| Commute from campus | Partial — general commute tools | Partial — walk score | Yes — campus-specific, in-detail |
| Student-specific auth (.edu) | No — open to all | No | Yes — .edu gating is a trust signal |

---

## v1.1-Specific Implementation Notes

### Design System Migration Approach

shadcn/ui is installed directly into the repo (components are owned, not packaged). Use `npx shadcn@latest add [component]` selectively — do not bulk-install all components. Start with: Button, Card, Input, Badge, Tabs, Dialog, Drawer, Avatar, Accordion, Progress. Radix accessibility is inherited — do not override `aria-*` attributes.

**Cabinet Grotesk + Satoshi:** Install via `@next/font/local` with `variable` option. Define CSS variables `--font-heading` and `--font-body` in `globals.css`. Apply via `cn()` utility to `<body>` and heading elements.

**Framer Motion rules for this project:**
- Animate: page entrance (fade+translate Y), modal/drawer open/close, listing card hover lift, mission status badge transitions
- Do not animate: table rows, text content, form fields, utility badges
- Use `useReducedMotion()` hook — wrap all animation variants with a check so users with motion sensitivity preferences get static UI

### AI Concierge Missions Architecture

The `missions` table needs at minimum: `id`, `user_id`, `campus_id`, `prompt` (original text), `steering_prompt` (latest correction), `status` (enum: queued/in_progress/action_needed/draft_approval/completed/failed), `summary` (AI-generated), `raw_logs` (JSONB array of tool call steps), `draft_payload` (JSONB for HITL review), `created_at`, `updated_at`.

Mission execution runs in a Next.js API route (not an Edge Function — needs Node.js for Gemini SDK). The route is called by the client on mission create, runs the agentic loop (existing 11 tools), updates `missions.status` at each checkpoint, and parks at `action_needed` or `draft_approval` when human sign-off is required.

Polling via Supabase Realtime channel subscription on `missions` filtered by `user_id`. Client subscribes on concierge page mount, updates local state on `UPDATE` events.

### Explore Page Floating Panel

The floating CribAI panel needs shared state with the listing grid. The cleanest pattern: URL search params as the source of truth for active filters. Both the filter chips row and the AI chat panel can read/write `?price_max=800&beds=2&pet_friendly=true`. This makes the state shareable via URL and eliminates prop drilling. The AI panel, when the user says "show me 2BR only", writes `beds=2` to the URL. The listing grid reads URL params and re-fetches.

### Listing Detail AI Lease Summary

Generate once, cache on `listings.ai_lease_summary` (nullable text column, add via migration). On first visit to a listing detail: if null, call Gemini synchronously, store result, return it. Subsequent visits: read from column. Add a "Refresh summary" option for stale listings. Cap generation at 3 bullets, ~150 words.

---

## Sources

- [shadcn/ui official docs and changelog — March 2026](https://ui.shadcn.com/docs/changelog/2026-03-cli-v4)
- [Framer Motion official docs](https://motion.dev/)
- [Human-in-the-Loop AI Agents — Permit.io](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices-frameworks-use-cases-and-demo)
- [HITL in Agentic AI 2026 — Onereach.ai](https://onereach.ai/blog/human-in-the-loop-agentic-ai-systems/)
- [Designing for Agentic AI — Smashing Magazine, Feb 2026](https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/)
- [Agentic UX design patterns — Exalt Studio](https://exalt-studio.com/blog/designing-for-ai-agents-7-ux-patterns-that-drive-engagement)
- [UX design for agents — Microsoft Design](https://microsoft.design/articles/ux-design-for-agents/)
- [Real estate website design best practices — HousingWire 2026](https://www.housingwire.com/articles/real-estate-website-design/)
- [SaaS landing page best practices 2025 — Userpilot](https://userpilot.com/blog/saas-landing-page-best-practices/)
- [Empty state UX examples — Eleken](https://www.eleken.co/blog-posts/empty-state-ux)
- [Multi-step form wizard UX — LogRocket](https://blog.logrocket.com/building-reusable-multi-step-form-react-hook-form-zod/)
- [Real estate UX trends 2025 — Medium](https://medium.com/@emilyanderson51691/top-12-ux-ui-design-trends-for-real-estate-apps-in-2025-37a5b70aef21)
- [Zillow ChatGPT integration launch — Oct 2025](https://zillow.mediaroom.com/2025-10-06-Zillow-debuts-the-only-real-estate-app-in-ChatGPT)
- [shadcn/ui best practices 2026 — Medium](https://medium.com/write-a-catalyst/shadcn-ui-best-practices-for-2026-444efd204f44)

---
*Feature research for: CampusNest v1.1 UI/UX Upgrade + AI Concierge*
*Researched: 2026-03-10*
