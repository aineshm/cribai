---
status: complete
phase: 09-v1-integration-polish-doc-cleanup
source: [09-01-SUMMARY.md, 09-02-SUMMARY.md]
started: 2026-03-10T19:00:00Z
updated: 2026-03-10T19:45:00Z
---

## Current Test

number: 1
name: Cold Start Smoke Test
expected: |
  Kill any running dev server. Start the application from scratch with `pnpm dev`. Server boots without errors. Apply migration 011 (contact_email column) if not already applied. A primary page load (homepage or /login) returns successfully.
[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running dev server. Start the application from scratch with `pnpm dev`. Server boots without errors. Apply migration 011 (contact_email column) if not already applied. A primary page load (homepage or /login) returns successfully.
result: pass

### 2. Submit Listing Persists contact_email
expected: Navigate to the submit-listing form. Fill in all fields including the contact email. Submit the form. The listing is created successfully and the contact_email value is persisted to the database (check via Supabase dashboard or SQL query on the listings table).
result: issue
reported: "contact information should be the current user; add option for building name, apt number/unit number etc. We also need to be able to verify the sublease somehow. everything else is okay. We want to become the preferable place for people to post their subtheses, especially near the campus location."
severity: major

### 3. Conversation Sidebar Reload in Dev Mode
expected: With BYPASS_AUTH=true in .env.local, open CribAI chat and start a conversation. Reload the page or click a conversation in the sidebar. The conversation loads successfully (GET /api/conversations/[id] returns 200) — no auth errors or empty state.
result: pass

### 4. Middleware Redirects on Protected Campus Routes
expected: Log out (or use an incognito window). Visit /uw-madison/dashboard, /uw-madison/saved, /uw-madison/notifications, and /uw-madison/submit-listing. Each should redirect to the login page (not render the page content briefly before redirecting).
result: pass

### 5. ROADMAP.md Checkmark Accuracy
expected: Open .planning/ROADMAP.md. All completed plan entries across phases 1-9 show [x] checkmarks. No stale [ ] entries remain for plans that have been executed.
result: pass

## Summary

total: 5
passed: 4
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Submit listing form persists contact_email to database"
  status: failed
  reason: "User reported: contact information should be the current user; add option for building name, apt number/unit number etc. Need sublease verification. Want to become preferred sublease posting platform near campus."
  severity: major
  test: 2
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
