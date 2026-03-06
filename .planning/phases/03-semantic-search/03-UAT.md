---
status: testing
phase: 03-semantic-search
source: 03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md
started: 2026-03-06T14:50:00Z
updated: 2026-03-06T14:50:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Semantic Search Returns Relevant Results
expected: |
  Open CribAI chat. Ask a qualitative question like "quiet place near campus with natural light". Results should be semantically relevant to the vibe described, not just keyword matches. Listings should appear as listing cards in the chat.
awaiting: user response

## Tests

### 1. Semantic Search Returns Relevant Results
expected: Open CribAI chat. Ask a qualitative question like "quiet place near campus with natural light". Results should be semantically relevant to the vibe described, not just keyword matches. Listings should appear as listing cards in the chat.
result: [pending]

### 2. Hard Filters Work Alongside Semantic Search
expected: Ask CribAI something combining qualitative + quantitative constraints, e.g. "quiet 2-bedroom under $1200". Results should respect the hard filters (2 beds, max $1200/mo) while also ranking by semantic relevance to "quiet".
result: [pending]

### 3. Non-Semantic Search Still Works
expected: Ask CribAI a purely filter-based question with no qualitative language, e.g. "show me 1-bedroom apartments". Results should return via the SQL filter path (same behavior as before Phase 3). No regression.
result: [pending]

### 4. Map Block Appears for 3+ Semantic Results
expected: After a semantic search that returns 3 or more results with coordinates, an interactive map block should appear in the chat below the listing cards. The map should show the Madison/campus area.
result: [pending]

### 5. Map Shows Price-Label Pins
expected: The map block displays pins at each listing's location. Each pin shows the listing's price as a label (Zillow-style price markers), not generic dots.
result: [pending]

### 6. Pin Click Shows Popup Card
expected: Clicking a pin on the map opens a popup card showing: hero photo, address, monthly rent, beds/baths count, and a "View details" link to the listing detail page.
result: [pending]

### 7. Selected Pin Highlighted
expected: When a pin is clicked/selected, it visually changes (e.g. blue highlight) to distinguish it from unselected pins, providing spatial context.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0

## Gaps

[none yet]
