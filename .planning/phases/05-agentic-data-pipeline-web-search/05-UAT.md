---
status: testing
phase: 05-agentic-data-pipeline-web-search
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md]
started: 2026-03-07T00:00:00Z
updated: 2026-03-07T00:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Cold Start Smoke Test
expected: |
  Kill any running dev server. Run `pnpm dev` from the repo root. The Next.js app boots without errors, and loading the homepage in a browser returns a rendered page (not a crash or blank screen).
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running dev server. Run `pnpm dev` from the repo root. The Next.js app boots without errors, and loading the homepage in a browser returns a rendered page (not a crash or blank screen).
result: [pending]

### 2. Source Citation on Listing Cards
expected: Navigate to a page showing listing cards (e.g., search results or saved listings). Each listing card displays a source citation like "Apartments.com", "Craigslist", or "Zillow" indicating where the listing was scraped from.
result: [pending]

### 3. CribAI Web Search Tool
expected: Open CribAI chat. Ask something like "search the web for 2-bedroom apartments near UW Madison under $1500". CribAI calls the web_search tool and returns results with titles, URLs, and content snippets from external websites.
result: [pending]

### 4. Web Search Tool Indicator in Chat
expected: When CribAI uses the web_search tool, a tool indicator appears in the chat UI (similar to other tool indicators like search_listings). It should show a label like "Searching the web..." while running.
result: [pending]

### 5. Graceful Missing TAVILY_API_KEY
expected: If TAVILY_API_KEY is not set in environment variables, asking CribAI to web search returns a friendly message explaining web search is unavailable, rather than crashing or showing a raw error.
result: [pending]

### 6. Search Listings Includes Source Field
expected: When CribAI uses search_listings, the returned listing summaries include a source field. This can be verified by checking the listing cards rendered from search results — they should show the source citation.
result: [pending]

### 7. Save Web-Sourced Listing
expected: When CribAI returns a web search result for a listing, the user can save/favorite it. The listing gets persisted to the database via the /api/save-web-listing endpoint and appears in saved listings.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0

## Gaps

[none yet]
