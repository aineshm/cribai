---
status: diagnosed
phase: 05-agentic-data-pipeline-web-search
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md]
started: 2026-03-07T00:00:00Z
updated: 2026-03-08T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running dev server. Run `pnpm dev` from the repo root. The Next.js app boots without errors, and loading the homepage in a browser returns a rendered page (not a crash or blank screen).
result: pass

### 2. Source Citation on Listing Cards
expected: Navigate to a page showing listing cards (e.g., search results or saved listings). Each listing card displays a source citation like "Apartments.com", "Craigslist", or "Zillow" indicating where the listing was scraped from.
result: pass

### 3. CribAI Web Search Tool
expected: Open CribAI chat. Ask something like "search the web for 2-bedroom apartments near UW Madison under $1500". CribAI calls the web_search tool and returns results with titles, URLs, and content snippets from external websites.
result: issue
reported: "Web search results are not persisted to the listing corpus with source tags. Links/URLs from web search are not shown inline in chat, forcing an extra query. Should be a single-step experience."
severity: major

### 4. Web Search Tool Indicator in Chat
expected: When CribAI uses the web_search tool, a tool indicator appears in the chat UI (similar to other tool indicators like search_listings). It should show a label like "Searching the web..." while running.
result: pass

### 5. Graceful Missing TAVILY_API_KEY
expected: If TAVILY_API_KEY is not set in environment variables, asking CribAI to web search returns a friendly message explaining web search is unavailable, rather than crashing or showing a raw error.
result: pass

### 6. Search Listings Includes Source Field
expected: When CribAI uses search_listings, the returned listing summaries include a source field. This can be verified by checking the listing cards rendered from search results — they should show the source citation.
result: pass

### 7. Save Web-Sourced Listing
expected: When CribAI returns a web search result for a listing, the user can save/favorite it. The listing gets persisted to the database via the /api/save-web-listing endpoint and appears in saved listings.
result: issue
reported: "Saved web listings appear in saved listings page but not on the dashboard."
severity: minor

## Additional Issues

### A. Chat Context Lost on Navigation
reported: "Navigating to a listing from chat and pressing back loses all chat content/context. Chat page is empty on return."
severity: major

## Summary

total: 7
passed: 5
issues: 2
pending: 0
skipped: 0

## Gaps

- truth: "Web search results are persisted to listing corpus with source tags and URLs shown inline in chat"
  status: failed
  reason: "User reported: Web search results are not persisted to the listing corpus with source tags. Links/URLs from web search are not shown inline in chat, forcing an extra query. Should be a single-step experience."
  severity: major
  test: 3
  root_cause: "Three gaps: (A) persistWebListing() exists but is never called by webSearch() handler — _context unused. (B) buildResult() returns type:'text' plain string instead of structured listing_card blocks. (C) chat-block-renderer.tsx renders text as plain <p> with no URL detection or dedicated web result block type."
  artifacts:
    - path: "packages/ai/src/tools/handlers/web-search.ts"
      issue: "webSearch() never calls persistWebListing(); buildResult() returns text block instead of listing cards"
    - path: "packages/types/src/chat.ts"
      issue: "No web search result block type with source URLs"
    - path: "apps/web/components/chat/chat-block-renderer.tsx"
      issue: "Text renderer has no link support or web result component"
  missing:
    - "Call persistWebListing() for each web search result to add to corpus with source tag"
    - "Return structured listing_card or web_result blocks instead of plain text"
    - "Add URL rendering in chat block renderer"
  debug_session: ".planning/debug/web-search-persist-dashboard.md"

- truth: "Saved web listings appear on dashboard"
  status: failed
  reason: "User reported: Saved web listings appear in saved listings page but not on the dashboard."
  severity: minor
  test: 7
  root_cause: "Dashboard page is a static placeholder with zero data queries. Only calls supabase.auth.getUser() for redirect. 'Saved Items' card always shows 'No saved items yet' regardless of database state."
  artifacts:
    - path: "apps/web/app/(campus)/[campusSlug]/dashboard/page.tsx"
      issue: "No Supabase queries — hardcoded empty-state cards"
  missing:
    - "Add Supabase queries for saved listings, tour requests on dashboard"
    - "Follow query pattern from apps/web/app/(campus)/[campusSlug]/saved/page.tsx"
  debug_session: ".planning/debug/web-search-persist-dashboard.md"

- truth: "Chat content persists when navigating away and back"
  status: failed
  reason: "User reported: Navigating to a listing from chat and pressing back loses all chat content/context. Chat page is empty on return."
  severity: major
  test: 6
  root_cause: "Chat messages exist only in React useState (cribai-chat.tsx line 38). Zero persistence anywhere. Link in chat-listing-card.tsx triggers navigation that unmounts CribAIChat, destroying all state. No ChatContext, localStorage, sessionStorage, or database tables for chat."
  artifacts:
    - path: "apps/web/components/cribai-chat.tsx"
      issue: "useState<Message[]>([]) is sole storage — destroyed on unmount"
    - path: "apps/web/components/chat/chat-listing-card.tsx"
      issue: "<Link> triggers navigation that unmounts chat component"
    - path: "apps/web/app/(campus)/[campusSlug]/cribai/page.tsx"
      issue: "No restoration logic, no conversation ID concept"
  missing:
    - "Add sessionStorage persistence for chat messages (quick win)"
    - "Hydrate messages from sessionStorage on mount"
    - "Future: database persistence with chat_sessions table"
  debug_session: ".planning/debug/chat-lost-on-navigation.md"
