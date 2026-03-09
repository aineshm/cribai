---
phase: 6
slug: agent-tool-expansion-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.1.0 |
| **Config file** | `packages/ai/vitest.config.ts`, `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @campusnest/ai test -- --run` |
| **Full suite command** | `pnpm -r test -- --run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @campusnest/ai test -- --run`
- **After every plan wave:** Run `pnpm -r test -- --run && pnpm -r build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | CHAT-01 | integration | `pnpm --filter @campusnest/web build` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | CHAT-01 | unit | `pnpm --filter @campusnest/web test -- --run` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | AGENT-03 | unit | `pnpm --filter @campusnest/ai test -- --run __tests__/get-reviews.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 1 | AGENT-04 | unit | `pnpm --filter @campusnest/ai test -- --run __tests__/get-neighborhood-info.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-03 | 02 | 1 | CHAT-02 | unit | `pnpm --filter @campusnest/ai test -- --run __tests__/schedule-tour.test.ts` | ✅ | ⬜ pending |
| 06-03-01 | 03 | 2 | DATA-03 | unit | `pnpm --filter @campusnest/web test -- --run` | ❌ W0 | ⬜ pending |
| 06-03-02 | 03 | 2 | LIST-05 | manual-only | Visual verification | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/ai/src/tools/__tests__/get-reviews.test.ts` — stubs for AGENT-03, DATA-07
- [ ] `packages/ai/src/tools/__tests__/contact-pm.test.ts` — stubs for contact_pm placeholder
- [ ] `packages/ai/src/tools/__tests__/get-neighborhood-info.test.ts` — stubs for AGENT-04

*Existing infrastructure covers schedule_tour (CHAT-02) and map block (CHAT-03).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Conversation sidebar shows history | CHAT-01 | UI layout verification | 1. Send 3+ messages 2. Refresh page 3. Verify conversation appears in sidebar 4. Click to resume |
| Placeholder tools show "coming soon" UX | AGENT-03, AGENT-04 | UX quality assessment | 1. Ask CribAI about reviews 2. Verify helpful stub with alternatives 3. No broken UI elements |
| Review display on listing page | LIST-05 | Visual verification | 1. Navigate to listing detail 2. Verify placeholder review section renders |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
