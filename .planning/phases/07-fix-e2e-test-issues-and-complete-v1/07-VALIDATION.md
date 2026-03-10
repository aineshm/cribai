---
phase: 7
slug: fix-e2e-test-issues-and-complete-v1
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x (unit/integration) + Playwright (E2E) |
| **Config file** | `apps/web/vitest.config.ts`, `apps/web/playwright.config.ts` |
| **Quick run command** | `pnpm --filter @campusnest/web test -- --run` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @campusnest/web test -- --run`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| BUG-1 | 01 | 1 | Price filter | unit+E2E | `pnpm --filter @campusnest/web test -- --run` | ✅ | ⬜ pending |
| BUG-2 | 01 | 1 | Conversations | unit | `pnpm --filter @campusnest/web test -- --run` | ✅ | ⬜ pending |
| BUG-3 | 01 | 1 | schedule_tour dev auth | unit | `pnpm --filter @campusnest/ai test -- --run` | ✅ | ⬜ pending |
| BUG-4 | 01 | 1 | Google Places photos | migration | Manual visual check | N/A | ⬜ pending |
| UX-1 | 02 | 2 | Favicon | manual | Check network tab | N/A | ⬜ pending |
| UX-2 | 02 | 2 | Submit button copy | manual | Visual check | N/A | ⬜ pending |
| UX-3 | 02 | 2 | Notification read | manual | Visual check | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. E2E specs exist and can be extended.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No 403 on listing photos | BUG-4 | Visual check for broken images | Load listings page, verify no broken image icons |
| Favicon present | UX-1 | Browser-level check | Load any page, verify favicon in tab + no 404 in network |
| Submit button copy | UX-2 | Copy change | Navigate to submit-listing, verify button text |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
