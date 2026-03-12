---
phase: 29
slug: chat-to-mission-bridge-concierge-ui-wiring
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.0 |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @campusnest/web test -- --run --reporter=verbose` |
| **Full suite command** | `pnpm --filter @campusnest/ai test -- --run && pnpm --filter @campusnest/web test -- --run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @campusnest/web test -- --run`
- **After every plan wave:** Run `pnpm --filter @campusnest/ai test -- --run && pnpm --filter @campusnest/web test -- --run && pnpm build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 29-01-01 | 01 | 0 | V2-BRIDGE-01 | unit | `pnpm --filter @campusnest/ai test -- --run packages/ai/src/__tests__/intent-classifier.test.ts` | ❌ W0 | ⬜ pending |
| 29-01-02 | 01 | 0 | V2-CONCIERGE-02 | unit | `pnpm --filter @campusnest/web test -- --run apps/web/hooks/__tests__/use-missions-realtime.test.ts` | ❌ W0 | ⬜ pending |
| 29-02-01 | 02 | 1 | V2-BRIDGE-01 | unit | `pnpm --filter @campusnest/ai test -- --run packages/ai/src/__tests__/intent-classifier.test.ts` | ❌ W0 | ⬜ pending |
| 29-02-02 | 02 | 1 | V2-BRIDGE-01 | unit | same file | ❌ W0 | ⬜ pending |
| 29-03-01 | 03 | 1 | V2-BRIDGE-02 | unit | `pnpm --filter @campusnest/web test -- --run components/chat/__tests__/ChatProvider.test.tsx` | ✅ (new test case) | ⬜ pending |
| 29-03-02 | 03 | 1 | V2-BRIDGE-02 | unit | same file | ✅ (new test case) | ⬜ pending |
| 29-04-01 | 04 | 2 | V2-CONCIERGE-01 | unit | `pnpm --filter @campusnest/web test -- --run components/concierge/__tests__/concierge.test.tsx` | ✅ (new test case) | ⬜ pending |
| 29-04-02 | 04 | 2 | V2-CONCIERGE-02 | unit | `pnpm --filter @campusnest/web test -- --run apps/web/hooks/__tests__/use-missions-realtime.test.ts` | ❌ W0 | ⬜ pending |
| 29-05-01 | 05 | 2 | V2-BRIDGE-03 | unit | `pnpm --filter @campusnest/web test -- --run components/concierge/__tests__/concierge.test.tsx` | ✅ (new test case) | ⬜ pending |
| 29-05-02 | 05 | 2 | V2-CONCIERGE-01 | unit | same file | ✅ (new test case) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/ai/src/__tests__/intent-classifier.test.ts` — stubs for V2-BRIDGE-01 (classifyIntent unit tests with mocked Gemini client; shouldClassify unit tests; graceful degradation on Gemini error)
- [ ] `apps/web/hooks/__tests__/use-missions-realtime.test.ts` — stubs for V2-CONCIERGE-02 (hook unit tests with mocked supabase-js channel; subscribe on userId; unsubscribe on unmount)
- [ ] `apps/web/hooks/` directory — create if it doesn't exist

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Supabase Realtime `{config: {private: true}}` enforces RLS | V2-CONCIERGE-02 | Requires live Supabase project; can't mock at integration level | Subscribe two test users; insert mission for user A; verify user B's channel does NOT receive the event |
| Chat UI renders mission proposal confirmation card | V2-BRIDGE-02 | Requires real Gemini classify response in browser | Send "Find me a 2BR apartment near campus under $1,200/mo" in chat; verify proposal card appears with Confirm/Dismiss buttons |
| Mission creation opens Concierge sidebar with new mission | V2-BRIDGE-02 | Requires full POST /api/missions + executor + Realtime chain | Confirm a mission proposal in chat; verify Concierge sidebar auto-opens with mission in "running" status within 3 seconds |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
