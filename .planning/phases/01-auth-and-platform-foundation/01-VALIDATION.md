---
phase: 1
slug: auth-and-platform-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x (unit/integration) + Playwright (e2e) |
| **Config file** | `apps/web/vitest.config.ts` (Wave 0 creates) |
| **Quick run command** | `pnpm --filter web test` |
| **Full suite command** | `pnpm turbo test && pnpm --filter web test:e2e` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter web test`
- **After every plan wave:** Run `pnpm turbo test && pnpm --filter web test:e2e`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | AUTH-01 | unit | `pnpm --filter web test -- auth` | W0 | pending |
| 01-01-02 | 01 | 1 | AUTH-02 | unit | `pnpm --filter web test -- callback` | W0 | pending |
| 01-01-03 | 01 | 1 | AUTH-03 | unit | `pnpm --filter web test -- edu-validation` | W0 | pending |
| 01-02-01 | 02 | 1 | AUTH-04 | unit | `pnpm --filter web test -- profile` | W0 | pending |
| 01-02-02 | 02 | 1 | AUTH-05 | unit | `pnpm --filter web test -- session` | W0 | pending |
| 01-03-01 | 03 | 1 | PLAT-01 | unit | `pnpm --filter web test -- campus` | W0 | pending |
| 01-03-02 | 03 | 1 | PLAT-02 | unit | `pnpm --filter web test -- layout` | W0 | pending |
| 01-03-03 | 03 | 1 | PLAT-03 | e2e | `pnpm --filter web test:e2e -- mobile` | W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/vitest.config.ts` — vitest config for web app
- [ ] `apps/web/__tests__/setup.ts` — test setup with Supabase mocks
- [ ] `apps/web/__tests__/auth/` — test stubs for AUTH-01 through AUTH-05
- [ ] `apps/web/__tests__/platform/` — test stubs for PLAT-01 through PLAT-03

*Existing infrastructure in packages/utils and packages/ai covers those packages. Web app needs its own vitest config.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Magic link email delivery | AUTH-01 | Requires real Supabase email | 1. Enter .edu email 2. Check inbox 3. Click link 4. Verify redirect |
| Session persistence across browser restart | AUTH-02 | Requires real browser state | 1. Login 2. Close browser 3. Reopen 4. Verify still authenticated |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
