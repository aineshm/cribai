---
phase: 10
slug: design-system-foundation
status: validated
nyquist_compliant: false
wave_0_complete: true
created: 2026-03-11
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (E2E) + Vitest (unit) |
| **Config file** | `apps/web/playwright.config.ts`, `apps/web/vitest.config.ts` |
| **Quick run command** | `cd apps/web && pnpm exec playwright test tests/e2e/design-system.spec.ts --project=chromium` |
| **Full suite command** | `cd apps/web && pnpm exec playwright test --project=chromium` |
| **Estimated runtime** | ~15 seconds (design-system only), ~45 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm exec playwright test tests/e2e/design-system.spec.ts --project=chromium`
- **After every plan wave:** Run `pnpm exec playwright test --project=chromium`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|-------------|-----------|-------------------|-------------|--------|
| 10-01 | DESIGN-01 (Space Grotesk + DM Sans) | E2E | `playwright test design-system.spec.ts` | ✅ | ✅ green |
| 10-02 | DESIGN-02 (shadcn/ui primitives) | E2E | `playwright test design-system.spec.ts` | ✅ | ✅ green |
| 10-03 | DESIGN-03 (Lucide icons) | E2E | `playwright test design-system.spec.ts` | ✅ | ✅ green |
| 10-04 | DESIGN-04 (framer-motion animations) | E2E | `playwright test design-system.spec.ts` | ✅ | ✅ green |
| 10-05 | DESIGN-05 (Token bridge) | E2E | `playwright test design-system.spec.ts` | ✅ | ✅ green |
| 10-06 | COMPAT-01 (v1.0 compat) | E2E | `playwright test listings.spec.ts` | ✅ | ⚠️ escalated |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky/escalated*

---

## Wave 0 Requirements

- [x] `apps/web/tests/e2e/design-system.spec.ts` — 12 tests covering DESIGN-01 through DESIGN-05
- [x] Existing `apps/web/playwright.config.ts` infrastructure sufficient

*Existing infrastructure covers all phase requirements except COMPAT-01 (see escalation).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| v1.0 listings page compatibility | COMPAT-01 | `listings.spec.ts` DOM selectors stale after Phase 12/16 redesign — all 10 tests fail. Implementation files need updating. | Update `ListingsPage.ts` page object to match new explore page DOM, or restore `data-testid` attributes on filter components. |

---

## Validation Audit 2026-03-11

| Metric | Count |
|--------|-------|
| Gaps found | 6 |
| Resolved | 5 |
| Escalated | 1 |

### Escalation: COMPAT-01

All 10 tests in `listings.spec.ts` fail. The `/{campus}/listings` route no longer renders the selectors expected by `ListingsPage.ts` — missing `h1`, `data-testid="beds-filter"`, `getByPlaceholder('Min price')`, `data-testid="sort-filter"`. DOM was changed during Phase 12/16 redesign. Test file was never updated.

**Recommended fix:** Update `ListingsPage.ts` page object and `listings.spec.ts` to match the new explore-page DOM structure.

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter (blocked by COMPAT-01 escalation)

**Approval:** partial 2026-03-11
