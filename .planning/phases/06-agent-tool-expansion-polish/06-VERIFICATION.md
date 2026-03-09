---
phase: 06-agent-tool-expansion-polish
verified: 2026-03-09T15:30:00Z
status: gaps_found
score: 4/5 success criteria verified
gaps:
  - truth: "CribAI can schedule tours with calendar awareness and PM contact (enhanced from current stub)"
    status: partial
    reason: "Runtime bug in error handler: setIsLoading(false) at cribai-chat.tsx:311 references undefined function (should be setIsStreaming). This will throw a ReferenceError when Gemini returns a 429 rate-limit error, breaking the chat UI."
    artifacts:
      - path: "apps/web/components/cribai-chat.tsx"
        issue: "Line 311 calls setIsLoading(false) but only setIsStreaming exists. Error handling path crashes."
    missing:
      - "Replace setIsLoading(false) with setIsStreaming(false) at line 311 of cribai-chat.tsx"
---

# Phase 6: Agent Tool Expansion & Polish Verification Report

**Phase Goal:** CribAI demonstrates breadth of agentic capabilities -- reviews, tour booking, PM contact, neighborhood info -- and the app is shippable
**Verified:** 2026-03-09T15:30:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can close the app, return later, and resume a previous conversation with full history intact | VERIFIED | Migration 010 creates conversations/messages tables with RLS. API routes handle CRUD. CribAI chat loads from DB for authenticated users, sessionStorage fallback for unauthenticated. Sidebar lists conversations and supports selecting/creating. |
| 2 | CribAI can discuss Reddit/Yelp/Google Maps reviews for a property (real or placeholder with clear "coming soon" UX) | VERIFIED | get-reviews.ts returns helpful placeholder with Reddit r/UWMadison, Google Maps, Yelp alternatives. Registered in schemas.ts and executor.ts. 4 tests. |
| 3 | CribAI can schedule tours with calendar awareness and PM contact (enhanced from current stub) | PARTIAL | schedule-tour.ts has full conflict detection against pending tours. contact-pm.ts returns helpful placeholder. However, cribai-chat.tsx line 311 has a bug: `setIsLoading(false)` references an undefined function (should be `setIsStreaming(false)`), causing a ReferenceError on Gemini 429 errors. |
| 4 | CribAI can provide neighborhood info (walkability, commute, safety, vibe) for a listing area | VERIFIED | get-neighborhood-info.ts covers all 4 topics with external resource suggestions (Walk Score, Google Maps, crime maps, Street View). Registered and tested. |
| 5 | Placeholder tools return helpful stubs that communicate future capability without breaking UX | VERIFIED | All 3 placeholder tools (reviews, contact PM, neighborhood info) return markdown-formatted text blocks with actionable alternative sources. No empty responses or bare "not implemented" messages. |

**Score:** 4/5 truths verified (1 partial due to runtime bug)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/010_chat_conversations.sql` | Conversations + messages tables with RLS | VERIFIED | 75 lines. CREATE TABLE, RLS policies, indexes, updated_at trigger. |
| `apps/web/app/api/conversations/route.ts` | List and create conversations | VERIFIED | 83 lines. GET lists user conversations, POST creates with Zod validation. |
| `apps/web/app/api/conversations/[id]/route.ts` | Get single conversation with messages | VERIFIED | 60 lines. Loads conversation + messages with RLS. |
| `apps/web/app/api/conversations/[id]/messages/route.ts` | Save messages to conversation | VERIFIED | 78 lines. POST with Zod validation, preview extraction, conversation update. |
| `apps/web/components/chat/conversation-sidebar.tsx` | Conversation list + new chat button | VERIFIED | 130 lines. Fetches conversations, renders list, mobile/desktop responsive. |
| `apps/web/components/cribai-chat.tsx` | DB persistence with sessionStorage fallback | VERIFIED (with bug) | 477 lines. DB persistence for auth users, sessionStorage fallback, lazy conversation creation. Bug at line 311: `setIsLoading` undefined. |
| `packages/ai/src/tools/handlers/get-reviews.ts` | Placeholder review tool | VERIFIED | 47 lines. Zod validation, helpful response with alternatives. |
| `packages/ai/src/tools/handlers/contact-pm.ts` | Placeholder PM contact tool | VERIFIED | 39 lines. Zod validation, suggests listing detail page. |
| `packages/ai/src/tools/handlers/get-neighborhood-info.ts` | Placeholder neighborhood info | VERIFIED | 63 lines. Covers walkability, commute, safety, vibe topics. |
| `packages/ai/src/tools/handlers/schedule-tour.ts` | Enhanced tour with conflict detection | VERIFIED | 141 lines. Date conflict detection, warnings appended to modelContext, never blocks tour creation. |
| `packages/ai/src/tools/schemas.ts` | 11 tool declarations | VERIFIED | 269 lines. All 11 FunctionDeclarations registered in CRIBAI_TOOLS array. |
| `packages/ai/src/tools/executor.ts` | 11 handler entries | VERIFIED | 39 lines. All 11 handlers imported and mapped. |
| `apps/web/components/submit-listing-form.tsx` | Listing submission form | VERIFIED | 301 lines. Full form with Zod validation, field-level errors, sonner toasts. |
| `apps/web/app/api/submit-listing/route.ts` | POST endpoint | VERIFIED | 106 lines. Auth check, Zod parse, service-role insert with source='manual'. |
| `apps/web/app/(campus)/[campusSlug]/submit-listing/page.tsx` | Submit listing page | VERIFIED | 33 lines. Server component with auth redirect. |
| `packages/types/src/listing.ts` | listingSubmissionSchema | VERIFIED | Schema with address, rent, bedrooms, contact_email, and optional fields. |
| Test files (4) | Tests for new tools | VERIFIED | 305 total lines across 4 test files. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| cribai-chat.tsx | /api/conversations | fetch for create/load/save | WIRED | createConversation, loadConversationMessages, persistMessage all call /api/conversations endpoints |
| conversation-sidebar.tsx | /api/conversations | fetch to list | WIRED | fetchConversations calls GET /api/conversations |
| conversations/route.ts | supabase.from('conversations') | Supabase query | WIRED | Both GET and POST query conversations table |
| cribai-page-client.tsx | CribAIChat + ConversationSidebar | Props and callbacks | WIRED | activeConversationId, refreshTrigger, onConversationCreated all connected |
| schemas.ts | CRIBAI_TOOLS array | FunctionDeclaration registrations | WIRED | getReviews, contactPm, getNeighborhoodInfo all in array |
| executor.ts | handler imports | HANDLERS record | WIRED | get_reviews, contact_pm, get_neighborhood_info all mapped |
| submit-listing-form.tsx | /api/submit-listing | fetch POST | WIRED | handleSubmit calls fetch with JSON body |
| submit-listing/route.ts | supabase.from('listings').insert | Supabase insert | WIRED | Service-role client inserts with source='manual' |
| layout.tsx + mobile-nav.tsx | /submit-listing | Nav links | WIRED | Both desktop and mobile nav link to submit-listing |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CHAT-01 | 06-01 | Conversation history persists across sessions | SATISFIED | DB-backed conversations with sidebar, sessionStorage fallback |
| CHAT-02 | 06-02 | Tour scheduling works end-to-end via chat | SATISFIED | schedule_tour with conflict detection, tour_confirmation block |
| CHAT-03 | 06-01 | CribAI has a map tool that renders interactive map block | SATISFIED | ChatMapBlock in chat-block-renderer.tsx, case 'map' handled |
| AGENT-03 | 06-02 | (Not defined in REQUIREMENTS.md) | UNDEFINED | Referenced in ROADMAP but no definition in REQUIREMENTS.md. Likely covered by placeholder tools (reviews, PM contact, neighborhood). |
| AGENT-04 | 06-02 | (Not defined in REQUIREMENTS.md) | UNDEFINED | Referenced in ROADMAP but no definition in REQUIREMENTS.md. Likely covered by placeholder tools. |
| DATA-03 | 06-03 | Manual listing submission form | SATISFIED | Submit listing page, form, API route, service-role insert |
| DATA-07 | 06-02 | Reddit/review scraping pipeline | SATISFIED | Covered by placeholder get_reviews tool per success criteria allowing stubs |
| LIST-05 | 06-02 | Listings display scraped reviews | SATISFIED | Covered by placeholder get_reviews tool per success criteria allowing stubs |

**Note:** AGENT-03 and AGENT-04 are referenced in ROADMAP.md phase 6 requirements but have no corresponding definitions in REQUIREMENTS.md. This is a documentation gap, not an implementation gap -- the work appears to be covered by the placeholder tools.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| apps/web/components/cribai-chat.tsx | 311 | `setIsLoading(false)` -- undefined function reference | BLOCKER | ReferenceError thrown when Gemini returns 429 rate-limit. Chat UI breaks on error path. Should be `setIsStreaming(false)`. |
| packages/ai/src/tools/handlers/get-reviews.ts | 22,31 | "coming soon" messaging | INFO | Expected -- placeholder tools per success criteria. Helpful alternatives provided. |
| packages/ai/src/tools/handlers/contact-pm.ts | 16,23 | "coming soon" messaging | INFO | Expected -- placeholder tool with actionable alternatives. |
| packages/ai/src/tools/handlers/get-neighborhood-info.ts | 34,46 | "coming soon" messaging | INFO | Expected -- placeholder tool with external resource suggestions. |

### Human Verification Required

### 1. Chat Persistence Round-Trip

**Test:** Sign in, send a message in CribAI, close browser tab, reopen CribAI page.
**Expected:** Previous conversation appears in sidebar; clicking it restores all messages.
**Why human:** Requires browser session lifecycle and Supabase auth cookie persistence.

### 2. Conversation Sidebar Navigation

**Test:** Create 3+ conversations, switch between them using sidebar.
**Expected:** Each conversation loads its own message history; active conversation is highlighted.
**Why human:** State management across component re-renders needs real interaction.

### 3. Submit Listing Form Validation

**Test:** Submit form with missing required fields, then with valid data.
**Expected:** Field-level errors appear for invalid input; success toast on valid submission.
**Why human:** Visual validation feedback and toast rendering.

### 4. Mobile Sidebar Toggle

**Test:** On mobile viewport, tap the conversation history button.
**Expected:** Sidebar slides in from left with backdrop overlay; selecting a conversation closes it.
**Why human:** CSS transition and responsive layout behavior.

### Gaps Summary

One gap blocks full goal achievement:

**Runtime bug in error handler (BLOCKER):** `cribai-chat.tsx` line 311 references `setIsLoading(false)` which does not exist in the component. The component uses `setIsStreaming` for loading state. When Gemini returns a 429 rate-limit error (which happens in practice per commit `63147a8`), the error handling path at line 303-313 will throw a ReferenceError, crashing the chat UI instead of gracefully showing the error message. This is a one-line fix: replace `setIsLoading(false)` with `setIsStreaming(false)`.

Additionally, AGENT-03 and AGENT-04 are undefined in REQUIREMENTS.md despite being referenced in ROADMAP.md. This is a documentation gap that should be resolved by either adding definitions or removing the references.

---

_Verified: 2026-03-09T15:30:00Z_
_Verifier: Claude (gsd-verifier)_
