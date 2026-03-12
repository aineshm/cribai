---
phase: 13
slug: listing-detail-redesign
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-11
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (E2E) |
| **Config file** | `apps/web/playwright.config.ts` |
| **Quick run command** | `cd apps/web && pnpm exec playwright test tests/e2e/listing-detail.spec.ts --project=chromium` |
| **Full suite command** | `cd apps/web && pnpm exec playwright test --project=chromium` |
| **Estimated runtime** | ~20 seconds (listing-detail only), ~60 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm exec playwright test tests/e2e/listing-detail.spec.ts --project=chromium`
- **After every plan wave:** Run `pnpm exec playwright test --project=chromium`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|-------------|-----------|-------------------|-------------|--------|
| 13-01 | DETAIL-01 (Photo gallery 2/3+1/3 + lightbox) | E2E | `playwright test listing-detail.spec.ts` | ✅ | ✅ green |
| 13-02 | DETAIL-02 (Sticky CTA sidebar: Book Tour + Ask AI) | E2E | `playwright test listing-detail.spec.ts` | ✅ | ✅ green |
| 13-03 | DETAIL-03 (Landlord card, amenities, AI lease summary) | E2E | `playwright test listing-detail.spec.ts` | ✅ | ✅ green |
| 13-04 | DETAIL-04 (Commute section: map + walk/transit times) | E2E | `playwright test listing-detail.spec.ts` | ✅ | ✅ green |
| 13-05 | DETAIL-05 (Mobile sticky bottom bar) | E2E | `playwright test listing-detail.spec.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky/escalated*

---

## Wave 0 Requirements

- [x] `apps/web/tests/e2e/listing-detail.spec.ts` — 28 tests covering DETAIL-01 through DETAIL-05
- [x] Existing `apps/web/playwright.config.ts` infrastructure sufficient

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Audit 2026-03-11

| Metric | Count |
|--------|-------|
| Gaps found | 5 |
| Resolved | 5 |
| Escalated | 0 |

### Debug Notes

- DETAIL-02 price selector scoped to `.sticky` to avoid mobile-only duplicate
- DETAIL-03 utility text matched with `{ exact: true }` to avoid description paragraph collision
- Navigation wait strategy changed from `domcontentloaded` to `networkidle` for stable hydration

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-11
