---
status: testing
phase: 06-agent-tool-expansion-polish
source: 06-01-SUMMARY.md, 06-02-SUMMARY.md, 06-03-SUMMARY.md
started: 2026-03-09T15:00:00Z
updated: 2026-03-09T20:15:00Z
---

## Current Test

number: 8
name: Schedule Tour Conflict Detection
expected: |
  Schedule two tours for overlapping dates on different listings. The second tour should still be created successfully, but CribAI's response should mention or warn about the scheduling overlap.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running dev server. Run `pnpm dev` from scratch. Server boots without errors, CribAI chat page loads at /[campusSlug]/cribai, and you can see the chat interface ready to accept input.
result: pass

### 2. Conversation Sidebar Appears
expected: When logged in, navigate to CribAI chat page. A conversation sidebar should be visible (or toggleable on mobile) showing your past conversations. If no past conversations exist, it should be empty or show a "New Chat" prompt.
result: pass

### 3. Chat Creates Conversation on First Message
expected: Start a new chat by typing a message (e.g., "Show me apartments near campus"). After sending, the sidebar should update to show a new conversation entry with a title derived from your message.
result: pass

### 4. Load Past Conversation
expected: Click on a conversation in the sidebar. The chat area should load and display the full message history from that conversation (your messages and CribAI responses).
result: pass

### 5. Unauthenticated Chat Works
expected: Log out and visit the CribAI chat page. You should still be able to chat with CribAI (using sessionStorage). The sidebar should not appear or should be hidden.
result: issue
reported: "doesn't open chat when i'm logged out"
severity: major

### 6. Placeholder Tool: Reviews
expected: Ask CribAI something like "What are the reviews for [listing name]?" The response should include a friendly "coming soon" message with alternative resource suggestions (Reddit, Google Maps, Yelp).
result: [pending-retest]

### 7. Placeholder Tool: Neighborhood Info
expected: Ask CribAI "What's the neighborhood like around [address]?" The response should include a helpful coming-soon message with suggestions to check Walk Score, Google Maps, or similar resources.
result: pass

### 8. Schedule Tour Conflict Detection
expected: Schedule two tours for overlapping dates on different listings. The second tour should still be created successfully, but CribAI's response should mention or warn about the scheduling overlap.
result: [pending]

### 9. Submit Listing Page Loads
expected: When logged in, navigate to /[campusSlug]/submit-listing. A form should appear with fields for address, rent, bedrooms, bathrooms, sqft, amenities, description, contact email, and source URL.
result: [pending]

### 10. Submit Listing Validation
expected: On the submit listing form, try submitting with required fields empty. Field-level validation errors should appear (e.g., "Address is required", "Rent must be a number"). The form should not submit until valid.
result: [pending]

### 11. Submit Listing Nav Link Auth-Gated
expected: When logged in, "Submit Listing" link should appear in the navigation (both desktop and mobile). When logged out, the link should not be visible.
result: [pending]

## Summary

total: 11
passed: 5
issues: 1
pending: 5
skipped: 0

## Gaps

- truth: "Unauthenticated users can access CribAI chat page and chat using sessionStorage"
  status: failed
  reason: "User reported: doesn't open chat when i'm logged out"
  severity: major
  test: 5
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
