---
phase: 21
slug: app-navigation-auth-state
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x (unit) + Playwright (E2E) |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter web test --run` |
| **Full suite command** | `pnpm --filter web test --run && pnpm run build` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter web test --run`
- **After every plan wave:** Run `pnpm --filter web test --run && pnpm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | POST-01, PROF-01 | unit | `pnpm --filter web test --run __tests__/main-layout.test.tsx` | ✅ (extend) | ⬜ pending |
| 21-01-02 | 01 | 1 | LAND-01 | unit | `pnpm --filter web test --run components/landing/__tests__/Hero.test.tsx` | ❌ W0 | ⬜ pending |
| 21-01-03 | 01 | 1 | LAND-04 | unit | `pnpm --filter web test --run components/landing/__tests__/MobileStickyBar.test.tsx` | ❌ W0 | ⬜ pending |
| 21-02-01 | 02 | 1 | POST-01, LAND-01 | e2e | `pnpm --filter web exec playwright test tests/e2e/navigation.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/components/landing/__tests__/Hero.test.tsx` — stubs for LAND-01 (auth-aware CTA)
- [ ] `apps/web/components/landing/__tests__/MobileStickyBar.test.tsx` — stubs for LAND-04 (auth-aware sticky bar)
- [ ] `apps/web/tests/e2e/navigation.spec.ts` — stubs for POST-01 (post sublease flow) and LAND-01 (returning auth'd user flow)
- [ ] `apps/web/tests/e2e/pages/ExplorePage.ts` — page object for E2E navigation tests

*Existing: `apps/web/__tests__/main-layout.test.tsx` will be extended (not created).*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
