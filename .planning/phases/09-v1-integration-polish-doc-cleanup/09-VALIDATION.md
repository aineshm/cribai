---
phase: 9
slug: v1-integration-polish-doc-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (apps/web vitest.config.ts) |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @campusnest/web test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @campusnest/web test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | INT-01 (contact_email) | manual smoke | n/a — manual | N/A | ⬜ pending |
| 09-01-02 | 01 | 1 | INT-02 (dev auth conversations GET) | manual smoke | n/a — manual | N/A | ⬜ pending |
| 09-01-03 | 01 | 1 | INT-03 (middleware expansion) | E2E | `npx playwright test --project=chromium auth.spec.ts` | ✅ | ⬜ pending |
| 09-02-01 | 02 | 1 | ROADMAP.md cleanup | visual inspection | n/a — manual | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files required — Phase 9 fixes are in API routes and middleware where the project has no unit test coverage (documented gap). Changes verified by manual smoke testing and existing Playwright E2E suite for auth redirects.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| contact_email persisted or removed from form | INT-01 | API route has no unit tests | Submit listing via form, verify DB row or confirm field absent |
| GET /api/conversations/[id] in dev auth | INT-02 | API route has no unit tests | Set BYPASS_AUTH=true, GET conversation by ID, expect 200 |
| Middleware redirects campus routes | INT-03 | Existing E2E covers auth redirects | Visit /campus/dashboard unauthenticated, expect redirect to login |
| ROADMAP.md no stale checkmarks | Documentation | Visual inspection | Open ROADMAP.md, verify completed plans have [x] |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
