---
phase: 19
slug: auth-flow-route-protection
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-11
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + @testing-library/react |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `cd apps/web && pnpm vitest run` |
| **Full suite command** | `cd apps/web && pnpm vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/web && pnpm vitest run`
- **After every plan wave:** Run `cd apps/web && pnpm vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | AUTH-06 | unit | `cd apps/web && pnpm vitest run components/auth/__tests__/AuthForm.redirect.test.tsx` | ✅ | ✅ green |
| 19-01-02 | 01 | 1 | POST-01 | unit | `cd apps/web && pnpm vitest run lib/__tests__/middleware.test.ts` | ✅ | ✅ green |
| 19-01-03 | 01 | 1 | PROF-01 | unit | `cd apps/web && pnpm vitest run components/profile/__tests__/ProfileHeader.test.tsx` | ✅ | ✅ green |
| 19-01-04 | 01 | 1 | PROF-02 | unit | `cd apps/web && pnpm vitest run components/profile/__tests__/SavedListings.test.tsx` | ✅ | ✅ green |
| 19-01-05 | 01 | 1 | DETAIL-05 | unit | `cd apps/web && pnpm vitest run components/listing/__tests__/MobileBottomBar.test.tsx` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `apps/web/components/auth/__tests__/AuthForm.redirect.test.tsx` — 3 tests (AUTH-06)
- [x] `apps/web/lib/__tests__/middleware.test.ts` — 5 tests (POST-01, /profile guard)
- [x] `apps/web/components/profile/__tests__/SavedListings.test.tsx` — 3 tests (PROF-02)
- [x] `apps/web/components/listing/__tests__/MobileBottomBar.test.tsx` — 2 tests (DETAIL-05)
- [x] `apps/web/components/profile/__tests__/ProfileHeader.test.tsx` — 10 tests (+2 PROF-01)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual redirect after OTP entry | AUTH-06 | Full auth flow requires Supabase OTP | 1. Open /login 2. Enter .edu email 3. Enter OTP 4. Verify lands on /explore |
| Dev-mode infinite redirect loop | PROF-01 | Requires BYPASS_AUTH=true env | 1. Set BYPASS_AUTH=true 2. Navigate to /profile 3. Verify no redirect loop |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-11

---

## Validation Audit 2026-03-11

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All 5 Wave 0 test files were created during plan execution (19-01, 19-02). 23 tests across 5 files all pass green. No gaps to fill.
