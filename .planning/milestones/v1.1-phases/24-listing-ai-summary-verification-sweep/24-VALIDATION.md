---
phase: 24
slug: listing-ai-summary-verification-sweep
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-12
audited: 2026-03-12
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.9 + @testing-library/react (unit) + Playwright (E2E) |
| **Config file** | `apps/web/vitest.config.ts`, `apps/web/playwright.config.ts` |
| **Quick run command** | `cd apps/web && pnpm exec vitest run components/listing` |
| **Full suite command** | `cd apps/web && pnpm exec vitest run && pnpm exec playwright test tests/e2e/listing-detail.spec.ts --project=chromium` |
| **Estimated runtime** | ~30 seconds (unit), ~60 seconds (E2E listing-detail) |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/web && pnpm exec vitest run components/listing`
- **After every plan wave:** Run `cd apps/web && pnpm exec vitest run && pnpm exec playwright test tests/e2e/listing-detail.spec.ts --project=chromium`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | DETAIL-03 | unit | `pnpm exec vitest run components/listing` | ✅ | ✅ green |
| 24-01-02 | 01 | 1 | DETAIL-03 | E2E | `pnpm exec playwright test tests/e2e/listing-detail.spec.ts --project=chromium` | ✅ | ✅ green |
| 24-02-01 | 02 | 2 | DESIGN-01, DESIGN-02, DESIGN-04, COMPAT-01 | E2E | `pnpm exec playwright test tests/e2e/design-system.spec.ts --project=chromium` | ✅ | ✅ green |
| 24-02-02 | 02 | 2 | LAND-02, LAND-03, AUTH-05 | E2E | `pnpm exec playwright test tests/e2e/homepage.spec.ts tests/e2e/auth.spec.ts --project=chromium` | ✅ | ✅ green |
| 24-02-03 | 02 | 2 | EXPL-01, EXPL-02, EXPL-03, EXPL-05 | unit | `pnpm exec vitest run components/explore` | ✅ | ✅ green |
| 24-02-04 | 02 | 2 | DETAIL-01, DETAIL-02, DETAIL-04 | E2E | `pnpm exec playwright test tests/e2e/listing-detail.spec.ts --project=chromium` | ✅ | ✅ green |
| 24-02-05 | 02 | 2 | POST-02, POST-03, PROF-03 | unit | `pnpm exec vitest run components/post components/profile` | ✅ | ✅ green |
| 24-02-06 | 02 | 2 | AGENT-02, AGENT-03, AGENT-04, AGENT-05, AGENT-06 | unit | `pnpm exec vitest run components/concierge` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

*No Wave 0 setup needed — all test files exist and no new framework installation is required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| v1.0-mvp git tag exists | COMPAT-01 | Git tag cannot be asserted in E2E test | Run `git tag -l v1.0-mvp` — must return `v1.0-mvp` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-12

---

## Validation Audit 2026-03-12

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
| Tasks audited | 8 |
| All COVERED | 8 |

*Note: 5 pre-existing `ProfilePage.test.tsx` failures (framer-motion layoutId in happy-dom) are documented in STATE.md as out-of-scope — not counted as gaps.*
