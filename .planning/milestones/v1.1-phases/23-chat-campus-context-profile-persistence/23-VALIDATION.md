---
phase: 23
slug: chat-campus-context-profile-persistence
status: audited
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-12
audited: 2026-03-12
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + React Testing Library |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter web test --run -- components/auth components/chat app/__tests__` |
| **Full suite command** | `pnpm --filter web test --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | EXPL-04, DETAIL-05 | unit | `pnpm --filter web test -- components/chat/__tests__/ChatProvider` | ✅ existing | ✅ green |
| 23-01-02 | 01 | 1 | EXPL-04, DETAIL-05 | unit | `pnpm --filter web test -- app/__tests__/main-layout` | ✅ existing | ✅ green |
| 23-02-01 | 02 | 2 | AUTH-05 | unit | `pnpm --filter web test -- components/auth/__tests__/AuthForm` | ✅ existing | ✅ green |
| 23-02-02 | 02 | 2 | AUTH-05 | unit | `pnpm --filter web test -- components/auth/__tests__/AuthForm.persist` | ✅ created | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `apps/web/components/auth/__tests__/AuthForm.persist.test.tsx` — 4 tests covering AUTH-05 profile persistence (✅ green)

*All phase requirements covered.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Explore page chat returns real AI response in browser | EXPL-04 | Requires live Supabase session + campusSlug DB row + real CribAI API call | Log in → /explore → open chat → send message → expect non-error response |
| Listing detail mobile chat returns real AI response | DETAIL-05 | Same — requires live session and real API call | Log in → /listing/[id] → tap Chat → send message → expect non-error response |
| Profile page shows persisted name after onboarding | AUTH-05 | Requires live Supabase updateUser round-trip | Sign up → complete profile step → navigate to /profile → verify name matches entry |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-12

---

## Validation Audit 2026-03-12

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All 4 tasks verified green. Wave 0 file (`AuthForm.persist.test.tsx`) created and passing (4/4). `main-layout.test.tsx` mock updated for `supabase.from()` + `ChatProvider`. No gaps remain.
