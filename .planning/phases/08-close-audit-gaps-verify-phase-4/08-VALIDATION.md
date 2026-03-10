---
phase: 8
slug: close-audit-gaps-verify-phase-4
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (packages/types, packages/ai, apps/web) |
| **Config file** | `packages/types/vitest.config.ts`, `packages/ai/vitest.config.ts`, `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @campusnest/types test --run && pnpm --filter @campusnest/ai test --run && pnpm --filter web test --run` |
| **Full suite command** | `pnpm run test --recursive && pnpm run build` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @campusnest/types test --run && pnpm --filter @campusnest/ai test --run && pnpm --filter web test --run`
- **After every plan wave:** Run `pnpm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | LIST-01..04 | static | `grep -l "LIST-0[1-4]" .planning/phases/04-*/*-VERIFICATION.md` | ❌ W0 | ⬜ pending |
| 08-02-01 | 02 | 1 | - | yaml | `yq '.jobs.scrape.steps[].name' .github/workflows/nightly-scrape.yml` | ✅ | ⬜ pending |
| 08-03-01 | 03 | 1 | - | unit | `pnpm --filter web test --run` | ✅ | ⬜ pending |
| 08-04-01 | 04 | 1 | - | build | `pnpm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files needed.

*This is a verification/gap-closure phase — no new feature tests required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Photo gallery renders photos | LIST-03 | Browser rendering | Visit /uw-madison/listings/[id], verify photos load |
| Freshness badge displays | LIST-04 | Browser rendering | Visit /uw-madison/listings/[id], verify badge shows |
| Messages API dev auth | - | Requires running dev server | `curl -X POST localhost:3000/api/conversations/[id]/messages` with dev cookie |

*LIST-03 and LIST-04 code existence verified statically in VERIFICATION.md; rendering requires browser.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
