---
phase: 20
slug: concierge-mount-design-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.9 + @testing-library/react + happy-dom |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter web vitest run components/concierge` |
| **Full suite command** | `pnpm --filter web test` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter web vitest run components/concierge`
- **After every plan wave:** Run `pnpm --filter web test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | AGENT-01 | unit | `pnpm --filter web vitest run app/__tests__` | ❌ W0 | ⬜ pending |
| 20-01-02 | 01 | 1 | AGENT-01 | unit | `pnpm --filter web vitest run components/concierge` | ✅ | ⬜ pending |
| 20-02-01 | 02 | 1 | DESIGN-03 | grep | `grep -rn "<svg" apps/web/components/ --include="*.tsx" \| grep -v "__tests__"` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/__tests__/main-layout.test.tsx` — stubs for AGENT-01 (ConciergeShell + ConciergeNavButton render in (main) layout)
- [ ] Existing vitest config already includes `__tests__/**/*.test.{ts,tsx}` — no config change needed

*Existing infrastructure covers DESIGN-03 verification (grep-based smoke test).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ConciergeNavButton visible in main nav visually | AGENT-01 | Visual verification of layout/positioning | Navigate to /explore, verify ConciergeNavButton appears in top nav |
| ConciergeShell sidebar opens from nav button | AGENT-01 | Interaction + visual state | Click ConciergeNavButton, verify sidebar slides open |
| MapPin icon visual fidelity | DESIGN-03 | Filled vs stroked pin appearance | Navigate to listing detail map, verify pin icon looks correct |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
