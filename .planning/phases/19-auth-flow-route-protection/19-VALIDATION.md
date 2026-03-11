---
phase: 19
slug: auth-flow-route-protection
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 19-01-01 | 01 | 1 | AUTH-06 | unit | `cd apps/web && pnpm vitest run components/auth/__tests__/AuthForm.redirect.test.tsx` | ❌ W0 | ⬜ pending |
| 19-01-02 | 01 | 1 | POST-01 | unit | `cd apps/web && pnpm vitest run lib/__tests__/middleware.test.ts` | ❌ W0 | ⬜ pending |
| 19-01-03 | 01 | 1 | PROF-01 | unit | `cd apps/web && pnpm vitest run components/profile/__tests__/ProfileHeader.test.tsx` | ✅ (extend) | ⬜ pending |
| 19-01-04 | 01 | 1 | PROF-02 | unit | `cd apps/web && pnpm vitest run components/profile/__tests__/SavedListings.test.tsx` | ❌ W0 | ⬜ pending |
| 19-01-05 | 01 | 1 | DETAIL-05 | unit | `cd apps/web && pnpm vitest run components/listing/__tests__/MobileBottomBar.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/components/auth/__tests__/AuthForm.redirect.test.tsx` — stubs for AUTH-06 redirect behavior
- [ ] `apps/web/lib/__tests__/middleware.test.ts` — stubs for POST-01 and /profile route guard
- [ ] `apps/web/components/profile/__tests__/SavedListings.test.tsx` — stubs for PROF-02 Link navigation
- [ ] `apps/web/components/listing/__tests__/MobileBottomBar.test.tsx` — stubs for DETAIL-05 Chat button
- [ ] Extend `apps/web/components/profile/__tests__/ProfileHeader.test.tsx` — add dynamic session data tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual redirect after OTP entry | AUTH-06 | Full auth flow requires Supabase OTP | 1. Open /login 2. Enter .edu email 3. Enter OTP 4. Verify lands on /explore |
| Dev-mode infinite redirect loop | PROF-01 | Requires BYPASS_AUTH=true env | 1. Set BYPASS_AUTH=true 2. Navigate to /profile 3. Verify no redirect loop |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
