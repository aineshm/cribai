---
phase: 2
slug: data-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1 |
| **Config file** | `services/scraper/vitest.config.ts` (scraper), `apps/web/vitest.config.ts` (web) |
| **Quick run command** | `pnpm --filter @campusnest/scraper test` |
| **Full suite command** | `pnpm --filter @campusnest/scraper test && pnpm --filter @campusnest/web test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @campusnest/scraper test`
- **After every plan wave:** Run `pnpm --filter @campusnest/scraper test && pnpm --filter @campusnest/web test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | DATA-01 | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/apartments-com.test.ts` | No — W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | DATA-02 | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/photo-extraction.test.ts` | No — W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | DATA-02 | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/normalizer.test.ts` | Yes (extend) | ⬜ pending |
| 02-02-01 | 02 | 1 | DATA-05 | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/metrics.test.ts` | No — W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | DATA-06 | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/staleness.test.ts` | No — W0 | ⬜ pending |
| 02-02-03 | 02 | 2 | DATA-06 | unit | `pnpm --filter @campusnest/web test -- --run __tests__/freshness-badge.test.ts` | No — W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `services/scraper/__tests__/photo-extraction.test.ts` — stubs for DATA-02 photo extraction
- [ ] `services/scraper/__tests__/metrics.test.ts` — stubs for DATA-05 metrics output and exit-on-zero
- [ ] `services/scraper/__tests__/staleness.test.ts` — stubs for DATA-06 archive and delete logic
- [ ] `apps/web/__tests__/freshness-badge.test.ts` — stubs for DATA-06 freshness display
- [ ] Extend `services/scraper/__tests__/normalizer.test.ts` — add photo normalization tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Photos display correctly from Apartments.com CDN | DATA-02 | Hotlink protection can only be tested with real URLs in browser | Run scraper once, open listing page, verify images load without 403 |
| GitHub Actions nightly cron fires | DATA-05 | Cron scheduling is GitHub infrastructure | Trigger manual workflow_dispatch, verify job summary appears |
| Email notification on failure | DATA-05 | GitHub notification settings per-user | Deliberately fail a run, check email inbox |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
