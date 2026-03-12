---
phase: 22
slug: token-cleanup-chat-multi-campus
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-11
audited: 2026-03-12
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x + @testing-library/react + happy-dom |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter web test -- --run components/chat` |
| **Full suite command** | `pnpm --filter web test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter web test -- --run components/chat`
- **After every plan wave:** Run `pnpm --filter web test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green + `pnpm --filter web build` passes
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | DESIGN-05 | build check | `pnpm --filter web build` | ✅ | ✅ green |
| 22-01-02 | 01 | 1 | DESIGN-05 | grep check | `grep -r "design-tokens" apps/web --include="*.ts" --include="*.tsx"` | ✅ | ✅ green |
| 22-02-01 | 02 | 1 | EXPL-04 | unit | `pnpm --filter web test -- --run components/chat/__tests__/ChatProvider.test.tsx` | ✅ | ✅ green |
| 22-02-02 | 02 | 1 | EXPL-04 | unit | `pnpm --filter web test -- --run` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. The `ChatProvider.test.tsx` file exists and covers the relevant behaviors. Tests need updating, not creation.

*The one test that needs updating: line 98 in `ChatProvider.test.tsx` asserts `campusSlug` equals `'uw-madison'` — must be updated to assert against the new prop value.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| AIChatButton still works on /explore after ChatProvider restructure | EXPL-04 | Route context is outside campus tree — automated test may not catch missing provider | Navigate to /explore, click AI chat button, verify panel opens without errors |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-12

---

## Validation Audit 2026-03-12

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All 4 tasks had existing automated commands. ChatProvider.test.tsx has 9 passing tests including new `campusSlug` prop assertion (`'test-campus'`) and empty-string default test. design-tokens.ts confirmed deleted, zero imports, build clean.
