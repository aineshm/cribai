---
phase: 14
slug: post-sublease-profile-saved-redesign
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-11
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for Post Sublease + Profile/Saved Redesign.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.x + @testing-library/react |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `cd apps/web && pnpm vitest run components/post/__tests__/ components/profile/__tests__/` |
| **Full suite command** | `cd apps/web && pnpm vitest run` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/web && pnpm vitest run components/post/__tests__/ components/profile/__tests__/`
- **After every plan wave:** Run `cd apps/web && pnpm vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 2 seconds

---

## Per-Task Verification Map

| Task ID | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|-------------|-----------|-------------------|-------------|--------|
| POST-01 | Multi-step wizard (Basics→Review) with forward/back nav | unit | `pnpm vitest run components/post/__tests__/PostWizard.test.tsx` | ✅ | ✅ green |
| POST-02 | Desktop sidebar with step indicators, current highlighted | unit | `pnpm vitest run components/post/__tests__/StepSidebar.test.tsx` | ✅ | ✅ green |
| POST-03 | Mobile progress bar with step count and percentage | unit | `pnpm vitest run components/post/__tests__/MobileProgressBar.test.tsx` | ✅ | ✅ green |
| PROF-01 | Profile header with avatar, name, university, verification badge | unit | `pnpm vitest run components/profile/__tests__/ProfileHeader.test.tsx` | ✅ | ✅ green |
| PROF-02 | Tabs switch between Saved Listings and Account Settings | integration | `pnpm vitest run components/profile/__tests__/ProfilePage.test.tsx` | ✅ | ✅ green |
| PROF-03 | Settings nav: Personal Info, Notifications, Log Out | unit | `pnpm vitest run components/profile/__tests__/SettingsNav.test.tsx` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All requirements have automated verify commands
- [x] Sampling continuity: no gaps without automated verify
- [x] All MISSING gaps resolved (6/6)
- [x] No watch-mode flags
- [x] Feedback latency < 2s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-11

---

## Validation Audit 2026-03-11

| Metric | Count |
|--------|-------|
| Gaps found | 6 |
| Resolved | 6 |
| Escalated | 0 |
