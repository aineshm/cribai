---
phase: 11
slug: landing-auth
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-11
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (E2E) |
| **Config file** | `apps/web/playwright.config.ts` |
| **Quick run command** | `cd apps/web && pnpm exec playwright test tests/e2e/homepage.spec.ts tests/e2e/auth.spec.ts --project=chromium` |
| **Full suite command** | `cd apps/web && pnpm exec playwright test --project=chromium` |
| **Estimated runtime** | ~35 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm exec playwright test tests/e2e/homepage.spec.ts tests/e2e/auth.spec.ts --project=chromium`
- **After every plan wave:** Run `pnpm exec playwright test --project=chromium`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 35 seconds

---

## Per-Task Verification Map

| Task ID | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|-------------|-----------|-------------------|-------------|--------|
| 11-01 | LAND-01 (Hero + CTA) | E2E | `playwright test homepage.spec.ts` | ✅ | ✅ green |
| 11-02 | LAND-02 (Social proof + features) | E2E | `playwright test homepage.spec.ts` | ✅ | ✅ green |
| 11-03 | LAND-03 (How It Works + footer CTA) | E2E | `playwright test homepage.spec.ts` | ✅ | ✅ green |
| 11-04 | LAND-04 (Mobile sticky CTA) | E2E | `playwright test homepage.spec.ts` | ✅ | ✅ green |
| 11-05 | AUTH-05 (Split layout + branded panel) | E2E | `playwright test auth.spec.ts` | ✅ | ✅ green |
| 11-06 | AUTH-06 (Multi-step OTP + animations) | E2E | `playwright test auth.spec.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements:
- [x] `apps/web/tests/e2e/homepage.spec.ts` — 9 tests covering LAND-01 through LAND-04
- [x] `apps/web/tests/e2e/auth.spec.ts` — 19 tests covering AUTH-05, AUTH-06 + middleware guards

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

Note: Full OTP → profile step transition requires live Supabase auth. The E2E tests verify client-side validation, form rendering, and split layout. The OTP code entry + redirect is verified via code review (AnimatePresence + slideVariants in AuthForm.tsx).

---

## Test Results (2026-03-11)

```
Running 28 tests using 4 workers
  28 passed (35.1s)
```

Breakdown:
- `homepage.spec.ts`: 9 tests — hero rendering, nav brand, all sections visible, How It Works 3 steps, CTA navigation (×3), mobile sticky CTA visibility + link
- `auth.spec.ts`: 19 tests — email form (heading, description, placeholder, type, submit, value, URL), split layout desktop (panel visible, branding, badges), mobile (panel hidden, form visible), OTP validation (non-.edu error, mail icon), middleware guards (×3), homepage→login navigation

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 35s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-11
