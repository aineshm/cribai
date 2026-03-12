---
phase: 21
slug: app-navigation-auth-state
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-11
audited: 2026-03-12
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x (unit) + Playwright (E2E) |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `npx vitest run` (from apps/web) |
| **Full suite command** | `npx vitest run && pnpm run build` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run && pnpm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | POST-01, PROF-01 | unit | `npx vitest run __tests__/main-layout.test.tsx` | ✅ | ✅ green |
| 21-01-02 | 01 | 1 | LAND-01 | unit | `npx vitest run components/landing/__tests__/Hero.test.tsx` | ✅ | ✅ green |
| 21-01-03 | 01 | 1 | LAND-04 | unit | `npx vitest run components/landing/__tests__/MobileStickyBar.test.tsx` | ✅ | ✅ green |
| 21-02-01 | 02 | 1 | POST-01, LAND-01, LAND-04 | e2e | `npx playwright test tests/e2e/navigation.spec.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `apps/web/components/landing/__tests__/Hero.test.tsx` — 4 tests for LAND-01 (auth-aware CTA)
- [x] `apps/web/components/landing/__tests__/MobileStickyBar.test.tsx` — 3 tests for LAND-04 (auth-aware sticky bar)
- [x] `apps/web/tests/e2e/navigation.spec.ts` — 7 E2E tests for POST-01 (middleware protection) and LAND-01/LAND-04 (unauthenticated CTAs)

*Existing: `apps/web/__tests__/main-layout.test.tsx` extended with 4 auth-conditional tests (7 total).*

*Note: `ExplorePage.ts` page object listed in original draft was not needed — `HomePage.ts` provides all required locators.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved

---

## Validation Audit 2026-03-12

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

**Test Results:**
```
Unit Tests: 3 files, 14 tests — ALL PASSING
  - __tests__/main-layout.test.tsx: 7 tests ✅
  - components/landing/__tests__/Hero.test.tsx: 4 tests ✅
  - components/landing/__tests__/MobileStickyBar.test.tsx: 3 tests ✅

E2E Tests: 1 file, 7 tests — ALL PASSING (last verified during Phase 21 execution)
  - tests/e2e/navigation.spec.ts: 7 tests ✅
```
