---
phase: 15
slug: ai-concierge-ui
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-11
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.9 + @testing-library/react + happy-dom |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter web vitest run components/concierge` |
| **Full suite command** | `pnpm --filter web test` |
| **Estimated runtime** | ~2s |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter web vitest run components/concierge`
- **After every plan wave:** Run `pnpm --filter web test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 3 seconds

---

## Per-Task Verification Map

| Task ID | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|-------------|-----------|-------------------|-------------|--------|
| 15-01 | AGENT-01 — Sidebar with mission cards + status indicators | unit | `pnpm --filter web vitest run components/concierge` | ✅ | ✅ green |
| 15-02 | AGENT-02 — Status-specific action cards (tour, draft, negotiation, comparison) | unit | `pnpm --filter web vitest run components/concierge` | ✅ | ✅ green |
| 15-03 | AGENT-03 — Agent summary + expandable execution logs | unit | `pnpm --filter web vitest run components/concierge` | ✅ | ✅ green |
| 15-04 | AGENT-04 — Persistent steering bar for course correction | unit | `pnpm --filter web vitest run components/concierge` | ✅ | ✅ green |
| 15-05 | AGENT-05 — Empty state with proactive mission suggestions | unit | `pnpm --filter web vitest run components/concierge` | ✅ | ✅ green |
| 15-06 | AGENT-06 — Active/Past tab filtering by completion status | unit | `pnpm --filter web vitest run components/concierge` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Test Coverage Summary

| Metric | Count |
|--------|-------|
| Total tests | 53 |
| AGENT-01 (sidebar/cards) | 9 |
| AGENT-02 (action cards) | 16 |
| AGENT-03 (summary/logs) | 9 |
| AGENT-04 (steering bar) | 6 |
| AGENT-05 (suggestions) | 4 |
| AGENT-06 (tab filtering) | 7 |
| Components with no gaps | 2 (ConciergeShell, ConciergeProvider — thin wrappers) |

---

## Validation Sign-Off

- [x] All tasks have automated verify
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 3s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-11

---

## Validation Audit 2026-03-11

| Metric | Count |
|--------|-------|
| Gaps found | 6 |
| Resolved | 6 |
| Escalated | 0 |
