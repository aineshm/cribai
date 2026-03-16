# E2E Test Results: Auth & Chat Flows

**Date:** 2026-03-09
**Tester:** Claude E2E Agent (Chrome DevTools MCP)
**Environment:** localhost:3000, Next.js 15 dev server, BYPASS_AUTH=true
**Dev User:** Emma Chen (free tier) / Raj Patel (pro tier)

---

## Summary

| # | Test | Result | Severity |
|---|------|--------|----------|
| 1 | CribAI page loads | PASS | - |
| 2 | Send message & get AI response | PASS | - |
| 3 | Conversation sidebar updates | FAIL | Medium |
| 4 | Click sidebar conversation to load history | BLOCKED | Medium |
| 5 | Dev user switcher pill | PASS | - |
| 6 | Unauthenticated access redirect | PASS | - |
| 7 | Reviews query (no tool) | PASS (graceful) | - |
| 8 | Neighborhood query (no tool) | PASS (graceful) | - |
| 9 | Schedule tour via chat | FAIL | High |
| 10 | Screenshots captured | PASS | - |

**Overall: 6 PASS, 2 FAIL, 1 BLOCKED**

---

## Detailed Results

### Test 1: Navigate to CribAI page
**Result: PASS**

- URL: `http://localhost:3000/uw-madison/cribai`
- Page loaded successfully with BYPASS_AUTH=true (no redirect to login)
- Nav bar shows: CampusNest logo, campus name "University of Wisconsin-Madison", DEV badge
- Logged in as Emma Chen (emma.chen@wisc.edu)
- Chat interface visible with conversation sidebar, message input, and 4 quick-action buttons
- Dev user switcher pill visible in bottom-right corner
- Screenshot: `e2e-screenshots/01-cribai-page-load.png`

### Test 2: Send message & verify AI response streams back
**Result: PASS**

- Typed "Find me a 2-bedroom apartment under $1200" and pressed Enter
- AI triggered the `search_listings` tool successfully
- Response included **5 listing cards** with real data from Supabase:
  - Boscobel, WI — $775/mo, 2 bed
  - Craigslist listing — $850/mo, 2 bed
  - Craigslist listing — $900/mo, 2 bed
  - McFarland — $1,095/mo, 2 bed
  - Poynette, WI — $1,125/mo, 2 bed
- Each listing card is a clickable link to the listing detail page
- AI also provided a text summary with the same 5 listings
- Button changed from "Send message" to "Thinking" during streaming, then back
- Screenshot: `e2e-screenshots/02-chat-response.png`, `e2e-screenshots/04-listing-cards-response.png`

### Test 3: Conversation sidebar shows new conversation
**Result: FAIL**

- After sending messages, the sidebar still shows "No conversations yet"
- After page reload, same state — "No conversations yet"
- Previous chat messages are lost on reload
- **Root cause:** The chat component does not create a conversation record in the `conversations` table when a new chat is started. The API route (`/api/conversations`) exists and supports dev auth, but the frontend chat component never calls it.
- Screenshot: `e2e-screenshots/03-sidebar-no-conversations.png`

### Test 4: Click sidebar conversation to load history
**Result: BLOCKED (by Test 3)**

- No conversations appear in the sidebar, so there is nothing to click
- Cannot test conversation history loading until Test 3 is fixed

### Test 5: Dev user switcher pill
**Result: PASS**

- Pill visible at bottom-right showing "Dev: Emma Chen free"
- Clicking opens a popover with 4 dev users:
  - Emma Chen — Undergrad (free)
  - Raj Patel — Grad student (pro)
  - Maria Garcia — International (premium)
  - New Student — Unverified user
- Clicked "Raj Patel" — page reloaded immediately
- Nav now shows "raj.patel@wisc.edu"
- Pill now shows "Dev: Raj Patel pro"
- Chat state reset (clean slate for new user) — expected behavior
- Screenshot: `e2e-screenshots/05-dev-user-switcher-open.png`, `e2e-screenshots/06-switched-to-raj.png`

### Test 6: Unauthenticated access
**Result: PASS**

- Set BYPASS_AUTH=false and restarted dev server
- Navigated to `http://localhost:3000/uw-madison/cribai`
- Correctly redirected to `http://localhost:3000/login?next=%2Fuw-madison%2Fcribai`
- Login page shows email input (.edu email) and "Send verification code" button
- `next` query param preserves intended destination for post-login redirect
- Screenshot: `e2e-screenshots/07-unauth-redirect-to-login.png`

### Test 7: Reviews query (placeholder tool check)
**Result: PASS (graceful degradation)**

- Sent: "What are the reviews for apartments on State Street?"
- No `get_reviews` tool exists in the system
- AI handled gracefully — asked for a specific address or apartment building name
- No error, no crash, no hallucinated reviews
- Screenshot: `e2e-screenshots/08-reviews-query.png`

### Test 8: Neighborhood query (placeholder tool check)
**Result: PASS (graceful degradation)**

- Sent: "What's the neighborhood like around 123 Langdon St?"
- No `get_neighborhood_info` tool exists in the system
- AI acknowledged the limitation ("still being analyzed") and suggested external resources:
  - Walk Score for walkability
  - Google Maps for commute times
  - City crime maps for safety
  - Google Street View for neighborhood vibe
- No error, no crash
- Screenshot: `e2e-screenshots/09-neighborhood-query.png`

### Test 9: Schedule tour via chat
**Result: FAIL**

- **Step 1:** Sent "I'd like to schedule a tour for the apartment at Boscobel, WI for next Saturday at 2pm"
- AI correctly identified the tour intent and asked for listing ID, name, and email
- **Step 2:** Provided listing ID, name, email, and exact date (March 15, 2026 at 2pm)
- AI triggered the `schedule_tour` tool correctly
- **Tool returned error:** "You must be signed in to schedule a tour."
- **Root cause:** The `schedule_tour` tool handler does not recognize the dev auth bypass. It requires real Supabase auth session even when BYPASS_AUTH=true. The middleware injects dev user headers, but the tool handler checks Supabase auth directly.
- Screenshot: `e2e-screenshots/10-tour-scheduling.png`, `e2e-screenshots/11-tour-auth-error.png`

### Test 10: Screenshots
**Result: PASS**

All screenshots saved to `docs/agent-outputs/e2e-screenshots/`:
- `01-cribai-page-load.png` — Initial page load
- `02-chat-response.png` — First AI response
- `03-sidebar-no-conversations.png` — Empty sidebar after messages
- `04-listing-cards-response.png` — Listing cards from search tool
- `05-dev-user-switcher-open.png` — Switcher popover open
- `06-switched-to-raj.png` — After switching to Raj Patel
- `07-unauth-redirect-to-login.png` — Login redirect
- `08-reviews-query.png` — Reviews graceful degradation
- `09-neighborhood-query.png` — Neighborhood graceful degradation
- `10-tour-scheduling.png` — Tour scheduling conversation
- `11-tour-auth-error.png` — Tour auth error
- `12-final-chat-state.png` — Final full-page state

---

## Bugs Found

### BUG-1: Conversations not persisted (Medium)
- **Location:** `apps/web/components/cribai-chat.tsx`
- **Issue:** Chat messages are only held in client state. No conversation record is created in the `conversations` table when a user starts chatting. The `/api/conversations` POST endpoint exists but is never called.
- **Impact:** Users lose all chat history on page reload. Sidebar always shows "No conversations yet."
- **Fix:** Call `POST /api/conversations` when the first message is sent, then associate messages with that conversation ID.

### BUG-2: schedule_tour tool ignores dev auth (High)
- **Location:** `packages/ai/src/tools/` (schedule_tour handler)
- **Issue:** The `schedule_tour` tool handler checks Supabase auth directly and doesn't recognize the dev auth bypass. Returns "You must be signed in to schedule a tour" even when BYPASS_AUTH=true.
- **Impact:** Tour scheduling is completely broken in dev mode. Cannot test the full tour flow.
- **Fix:** The tool handler should check `isDevAuthEnabled()` and use the dev user ID from headers/cookies when in dev mode, similar to how `/api/conversations/route.ts` does it.

### BUG-3: Chrome DevTools fill() doesn't trigger React onChange (Minor/Tooling)
- **Location:** N/A (browser automation issue)
- **Issue:** `fill()` sets the input value but doesn't trigger React's synthetic onChange, leaving the Send button disabled. Required workaround via `evaluate_script` to dispatch native input events.
- **Impact:** Automation-only issue; does not affect real users.

---

## Observations

1. **AI tool calling works well** — The `search_listings` tool returned real data from Supabase with proper listing cards rendered in the chat UI.
2. **Graceful degradation** — When no tool exists for a query (reviews, neighborhoods), the AI responds helpfully without errors.
3. **Dev user switcher is solid** — Clean UI, immediate page reload on switch, correct user context propagation.
4. **Auth protection works** — Unauthenticated users are properly redirected to login with the `next` param preserved.
5. **Streaming works** — The "Thinking" button indicator appears during AI response generation, and text streams in progressively.
6. **Listing cards are interactive** — Each card links to the correct listing detail page with proper routing.
