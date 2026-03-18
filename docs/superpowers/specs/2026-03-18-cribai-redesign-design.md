# CribAI Redesign — Full Spec

## Context

CampusNest is rebranding to CribAI and restructuring the frontend around an agent-first architecture. The current app has 13 tool calls that all return instant results, a mission system that's wired but underutilized, and navigation that centers on a sublease posting form. This redesign makes the AI agent the primary experience — missions become the activity log for any significant action, chat becomes the main interaction surface, and the brand reflects the AI-native identity.

**Prompted by:** The mission launcher shipped but revealed that the current tool/mission boundary is unclear, the nav prioritizes posting over conversation, and returning users have no way to review past interactions.

**Deferred (documented for future phase):**
- Lease analysis mission (upload lease doc → AI extracts key terms → generates report). Tracked in intent-classifier.ts as `lease_analysis` intent. Pipeline: accept upload → extract terms → research flags → generate report. Will require chat file attachment mechanism (see Section 3.4 note).
- Chat-based photo upload (file input in chat bar). Deferred until listing page photo upload (Section 3.3) is validated.

---

## Sub-project 1: Brand + Nav + Chat Inbox

**Goal:** Visual restructure — rename CampusNest → CribAI everywhere, replace "Post Sublease" nav item with "Chat", build inbox-style conversation history page. No backend changes.

### 1.1 Brand Rename: CampusNest → CribAI

Every surface that says "CampusNest" becomes "CribAI":

- **Nav bar** (desktop + mobile): logo text, brand link
- **Landing page** (`/`): hero heading, feature descriptions, footer
- **Login page**: brand panel heading, value props
- **Sublease landing** (`/sublease`): header nav, any CampusNest mentions
- **Chat pages**: any CampusNest references in headers
- **Page titles** (`<title>` tags): all Metadata objects across routes
- **Meta tags**: OpenGraph titles, Twitter cards, descriptions
- **Favicon / icon**: if it references CampusNest text
- **404 page**: "Go home" / brand references
- **Privacy / Terms pages**: stubs that mention CampusNest
- **AI package**: tool descriptions in `packages/ai/src/tools/schemas.ts` that reference CampusNest

**Files to modify** (non-exhaustive — grep for "CampusNest" across entire repo):
- `apps/web/app/layout.tsx` — root metadata
- `apps/web/app/page.tsx` — landing page
- `apps/web/app/(main)/layout.tsx` — desktop nav
- `apps/web/app/(auth)/login/` — login page
- `apps/web/app/sublease/SubleaseClient.tsx` — sublease landing
- `apps/web/components/layout/MobileBottomNav.tsx` — mobile nav
- `packages/ai/src/tools/schemas.ts` — tool descriptions referencing CampusNest
- `packages/ai/src/cribai.ts` — system prompt if it mentions CampusNest
- All `page.tsx` files with `export const metadata`

**Logo:** Keep the house icon (`Home` from lucide-react), change text to "CribAI".

### 1.2 Navigation Restructure

**Desktop top nav:**
Before: `CampusNest | [Search] | Discover | Agent | Post Sublease | [Avatar]`
After: `CribAI | [Search] | Discover | Agent | Chat | [Avatar]`

- "Post Sublease" link removed
- "Chat" added, links to `/chat`
- Icon: `MessageSquare` from lucide-react

**Mobile bottom nav:**
Before: `Search | Agent | [Post (elevated)] | Saved | Profile`
After: `Search | Agent | [Chat (elevated)] | Saved | Profile`

- Elevated center button changes from PlusCircle/Post to MessageSquare/Chat
- Links to `/chat` instead of `/post`
- Auth gate remains (redirects to `/login` if not authenticated)

**Files:**
- `apps/web/app/(main)/layout.tsx` — desktop nav links
- `apps/web/components/layout/MobileBottomNav.tsx` — mobile bottom nav

### 1.3 Chat Inbox Page (`/chat`)

Replace the current chat page (sidebar + chat area) with an inbox-style layout.

**Inbox view (default):**
- Full-width list of past conversations as rows
- Each row shows:
  - First message preview (truncated to ~80 chars)
  - Timestamp (relative: "2 hours ago", "Yesterday", "Mar 15")
  - Mission indicator badge if a mission was spawned from this conversation (query: `SELECT id FROM missions WHERE conversation_id = ?` — the missions table has a `conversation_id` column)
- Sorted by most recent first
- "New Chat" button (prominent, top of list) — opens empty focused chat view (conversation created lazily on first message send, not on button click, to avoid empty conversations cluttering the inbox)
- Empty state: "No conversations yet. Start chatting with CribAI!" with "New Chat" CTA

**Focused chat view (after clicking a row):**
- Full-screen CribAI chat with that conversation loaded
- Back button / breadcrumb to return to inbox
- Conversation ID passed via URL: `/chat?conversation={id}`

**Data source:** Conversations table in Supabase (already exists, used by ConversationSidebar).

**Files:**
- `apps/web/app/(main)/chat/page.tsx` — server component
- `apps/web/app/(main)/chat/chat-page-client.tsx` — rewrite from sidebar layout to inbox layout
- New `apps/web/components/chat/ConversationInbox.tsx` component

### 1.4 Remove `/post` Route

- Client-side redirect: `/post` page component calls `router.replace('/chat')` and shows a brief message: "Start a chat to post your sublease"
- Not a server-side redirect (need client context for toast)
- Update `/sublease` landing page: "Post Your Sublease" CTA → links to `/chat`
- Keep PostWizard component files for now (can clean up later) but remove all nav links to `/post`

### 1.5 Sublease Landing Page Update

- "Post Your Sublease" CTA href changes from `/post` to `/chat`
- Brand references updated to CribAI (header already has nav from earlier fix)

---

## Sub-project 2: Mission-Backed Tools + Agent Page Launcher

**Goal:** Restructure tool calls so significant actions create missions. Redesign the Agent page launcher with a free-text request box.

### 2.1 Tool Classification

**Principle:** A mission is any action worth tracking as a discrete activity in the user's agent history. Instant tools return results in the chat stream. Mission-backed tools create a background pipeline.

**Actual tool names** (from `packages/ai/src/tools/types.ts` ToolName union):

**Instant tools (8):** Return results directly in chat.
| Tool | Purpose |
|---|---|
| `search_listings` | Quick DB/vector search. Always ends with "Want a deep search?" CTA |
| `compare_listings` | Side-by-side comparison from DB data |
| `web_search` | Tavily web search, returns links |
| `explain_lease_term` | Explain a lease clause or term |
| `get_neighborhood_info` | Campus area reference data |
| `get_saved_listings` | Retrieve user's saved listings |
| `get_landlord_info` | Landlord/PM contact lookup |
| `propose_mission` | Meta-tool — proposes a mission to user |

**Mission-backed tools (5):** Create a mission via signal pattern (see Section 2.3).
| Tool | Mission type | Pipeline | Status |
|---|---|---|---|
| `get_listing_detail` + `get_reviews` | `listing_deep_dive` | fetch detail → pull reviews → compare similar → true cost → report | **New pipeline** |
| `schedule_tour` | `tour_outreach` | fetch PM contact → draft email → HITL approval → send | Exists |
| `contact_pm` | `tour_outreach` | shares tour_outreach pipeline | Exists |
| `create_sublease` | `sublease_post` | validate → geocode → insert → confirm | **Convert existing tool** |

**Not a tool — triggered via `propose_mission`:**
| Mission type | Trigger | Pipeline | Status |
|---|---|---|---|
| `housing_search` | User accepts "deep search" CTA → CribAI calls `propose_mission` → banner → Agent launcher | search → dedup → research → rank → report | Exists |

**Key clarification:** `search_listings` is ALWAYS instant. The deep housing search is a separate `housing_search` mission triggered via `propose_mission`, not a "deep mode" of `search_listings`.

**Deferred mission type:**
| Mission type | Pipeline | Status |
|---|---|---|
| `lease_analysis` | accept upload → extract terms → research flags → generate report | **Deferred to future phase** |

### 2.2 Deep Search CTA Pattern

After every instant `search_listings` response, CribAI offers to go deeper:

- Update `search_listings` handler's `modelContext` to append: "Always end your response by offering: 'If you'd like to tell me more about your preferences, I can run a deep search for your requirements.'"
- If user accepts → CribAI calls `propose_mission` with `intent: 'housing_search'` and extracted fields
- Slim banner → "Review & Start" → Agent page launcher

### 2.3 Tool-to-Mission Trigger Pattern

**Architecture:** Tool handlers remain pure functions in `packages/ai/` with no Next.js dependency. The SSE route handles mission creation.

For each mission-backed tool, the handler returns a **mission signal** in its `ToolResult`:

```
ToolResult {
  modelContext: "I'm starting a [mission type] for you...",
  clientBlock: { type: 'listing_card' | 'text', ... },  // normal client block
  missionRequest: {                                       // NEW field on ToolResult
    type: 'listing_deep_dive' | 'tour_outreach' | 'sublease_post',
    input: { ... extracted fields ... }
  }
}
```

The SSE route (`apps/web/app/api/ai/cribai/route.ts`) detects `missionRequest` in the tool result and:
1. Creates the mission via direct DB insert (service-role client)
2. Kicks off the executor via `after()` (Next.js)
3. Emits a `mission_created` SSE event with the mission ID
4. Frontend shows a link to the Agent tab

This keeps `packages/ai/` framework-agnostic — the tool handler just returns data, the route handles the side effects.

**ToolResult type change** (`packages/ai/src/tools/types.ts`):
```typescript
export interface ToolResult {
  readonly modelContext: string;
  readonly clientBlock: ChatBlock;
  readonly mapBlock?: ChatBlock;
  readonly missionRequest?: {
    readonly type: string;
    readonly input: Record<string, unknown>;
  };
}
```

### 2.4 Intent Classification Update

Update `propose_mission` handler and `classifyIntent` to support new mission types:

- `packages/ai/src/tools/handlers/propose-mission.ts`: Add `'listing_deep_dive'` and `'sublease_post'` to the intent enum
- `packages/ai/src/intent-classifier.ts`: Add `'listing_deep_dive'` and `'sublease_post'` to `IntentResultSchema` enum (alongside existing `housing_search`, `tour_outreach`, `lease_analysis`, `general_chat`)
- `apps/web/app/api/ai/cribai/route.ts`: Add new types to `REGISTERED_MISSION_INTENTS` set

### 2.5 Agent Page Launcher Redesign

Replace the current rigid form with a conversational launcher:

**Primary input:** Free-text request box
- Placeholder: "Describe what you're looking for..."
- On submit: API call to classify intent + extract fields (reuse `classifyIntent` from intent-classifier.ts, exposed via a new `/api/ai/classify` endpoint)
- Pre-fills the structured fields below

**Structured fields (below, editable):**
- Mission type (auto-detected, shown as a label not dropdown)
- Budget, bedrooms, location, move-in date (for housing_search)
- Fields vary by mission type

**"Start Mission" button:** Creates the mission, clears form

### 2.6 New Mission Pipelines

**`listing_deep_dive` pipeline (new):**
1. `fetch_detail` — Get full listing data from DB
2. `pull_reviews` — Aggregate reviews (DB + web search)
3. `compare_similar` — Find and compare similar listings by price/location/size
4. `calculate_true_cost` — Full cost breakdown with utilities estimate
5. `generate_report` — Compile into a structured report with recommendation

Register in `packages/ai/src/missions/` following the pattern of `housing-search/index.ts`.

**`sublease_post` pipeline (convert from tool):**
1. `validate_fields` — Validate address, rent, dates, amenities
2. `geocode_address` — Google Places geocoding (reuse existing `geocodeAddress` helper)
3. `insert_listing` — DB insert with creator_id, source='sublease'
4. `confirm` — Return listing URL, prompt for photos

Register in `packages/ai/src/missions/` following existing pattern.

---

## Sub-project 3: Listing Page Creator Edit + Photo Upload

**Goal:** Listing creators can edit their sublease details and upload photos directly on the listing page. Other users see "Posted by [name]".

### 3.1 "Posted by" Attribution

On listing detail pages where `source === 'sublease'` and `creator_id` is set:
- Show "Posted by [display_name]" below the address
- Display name from `auth.users` user_metadata (set during profile setup)
- If no display name, show "Posted by a verified student"

### 3.2 Creator Edit Controls

When the authenticated user's ID matches `listing.creator_id` OR the user's email is in the admin list:
- Show "Edit Listing" button on the listing detail page
- Inline editing: click a field to edit (address, rent, bedrooms, bathrooms, description, amenities, available date)
- Save button PATCHes the listing via API
- Changes reflected immediately

**Admin emails (temporary — move to env var or DB table when user base grows):**
- `amohan28@wisc.edu`
- `aineshmohan@outlook.com`

### 3.3 Photo Upload on Listing Page

For creator/admin users:
- "Add Photos" button on the listing detail page
- Upload to Supabase Storage (existing bucket or new `listing-photos` bucket)
- Photos linked to listing via `photo_urls` array column (already exists)
- Drag to reorder, click to delete
- Max 10 photos per listing

### 3.4 Photo Upload in Chat (DEFERRED)

Chat-based photo upload requires a new chat attachment mechanism (file input in chat bar, multipart upload handling in SSE route, associating files with a listing context). This is a substantial feature.

**Deferred to a future phase.** For now, after `create_sublease` completes, CribAI prompts: "Your listing is live! Add photos by visiting your listing page: [link]" — directing users to the listing page upload (Section 3.3).

### 3.5 API Endpoints

- `PATCH /api/listings/[id]` — Update listing fields (creator or admin only)
- `POST /api/listings/[id]/photos` — Upload photos (creator or admin only)
- `DELETE /api/listings/[id]/photos/[photoId]` — Remove a photo (creator or admin only)

Authorization check: `listing.creator_id === auth.uid() OR user.email IN admin_emails`

---

## Implementation Order

| Phase | Sub-project | Scope | Dependencies |
|---|---|---|---|
| 1 | Brand + Nav + Chat Inbox | Frontend only | None |
| 2 | Mission-backed tools + Agent launcher | Backend pipelines + frontend | Sub-project 1 (nav must be updated) |
| 3 | Listing creator edit + photos | Feature addition | Sub-project 2 (sublease_post mission) |

Each sub-project gets its own implementation plan when reached. Sub-projects are independently deployable.

---

## Frontend-to-Backend Map

```
FRONTEND ROUTES              → BACKEND DEPENDENCIES
─────────────────────────────────────────────────────
/ (landing)                  → None (static)
/login                       → Supabase Auth (OTP)
/explore                     → Supabase listings query (direct)
                               POST /api/ai/cribai (SSE) — chat panel
                               match_listings_semantic RPC
                               campus_landmarks table
                               MapPanel → Mapbox API
/chat (inbox)                → GET /api/conversations (list)
                               JOIN missions ON conversation_id (badge)
/chat?conversation={id}      → GET /api/conversations/[id]/messages
                               POST /api/ai/cribai (SSE stream)
/messages (Agent)            → GET /api/missions (list)
                               GET /api/missions/[id] (detail + logs)
                               POST /api/missions (create)
                               POST /api/ai/classify (intent extraction)
                               POST /api/missions/[id]/steer
                               POST /api/missions/[id]/drafts/[id]/approve
                               POST /api/missions/[id]/drafts/[id]/reject
                               Supabase Realtime (missions table)
/listing/[id]                → GET listing from Supabase
                               GET /api/listings/[id]/stats (creator only)
                               PATCH /api/listings/[id] (creator/admin edit)
                               POST /api/listings/[id]/photos (upload)
                               POST /api/events (listing_viewed tracking)
/sublease                    → GET listing counts from Supabase
/profile                     → Supabase Auth user_metadata
                               GET saved_listings

BACKGROUND PIPELINES         → BACKEND DEPENDENCIES
─────────────────────────────────────────────────────
housing_search mission       → search_listings tool, web_search tool
                               Gemini 2.5 Flash (ranking/report)
listing_deep_dive mission    → get_listing_detail, get_reviews tools
                               web_search (external reviews)
tour_outreach mission        → PM contact lookup, Gemini (draft email)
                               Resend (send email), HITL approval
sublease_post mission        → Google Places API (geocode)
                               Supabase insert (listings table)
lease_analysis mission       → [DEFERRED] File upload, Gemini analysis
```

---

## Verification

### Sub-project 1
- `pnpm run build` passes
- `pnpm test` passes
- Grep for "CampusNest" returns 0 results in user-facing code (apps/web + packages/ai)
- All pages render with "CribAI" branding
- Desktop nav shows: CribAI | Search | Discover | Agent | Chat
- Mobile nav shows: Search | Agent | Chat (elevated) | Saved | Profile
- `/chat` shows inbox-style conversation list
- Clicking a conversation opens focused chat view
- "New Chat" opens empty chat (conversation created on first message, not on button click)
- `/post` redirects to `/chat` with client-side redirect
- `/sublease` "Post" CTA links to `/chat`

### Sub-project 2
- Mission-backed tool calls return `missionRequest` in ToolResult
- SSE route creates missions from `missionRequest` signals
- `search_listings` responses end with "deep search" offer
- Agent page launcher accepts free-text input and classifies intent
- Housing search mission runs end-to-end
- `create_sublease` creates a trackable `sublease_post` mission
- `propose_mission` intent enum includes all active mission types

### Sub-project 3
- Sublease listings show "Posted by [name]"
- Creator sees edit controls on their listing
- Admin emails (`amohan28@wisc.edu`, `aineshmohan@outlook.com`) see edit controls on all listings
- Photo upload works on listing page
- After sublease creation, CribAI links to listing page for photo upload
- Non-creators see no edit controls
