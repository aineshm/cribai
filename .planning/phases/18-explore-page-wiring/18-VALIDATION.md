---
phase: 18
slug: explore-page-wiring
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.9 + @testing-library/react + happy-dom (unit), Playwright (E2E) |
| **Config file** | `apps/web/vitest.config.ts`, `apps/web/playwright.config.ts` |
| **Quick run command** | `pnpm --filter web vitest run components/explore` |
| **Full suite command** | `pnpm --filter web test` |
| **Estimated runtime** | ~3s (unit), ~15s (E2E) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter web vitest run components/explore`
- **After every plan wave:** Run `pnpm --filter web test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 3 seconds

---

## Per-Task Verification Map

| Task ID | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|-------------|-----------|-------------------|-------------|--------|
| 18-01 | EXPL-05 — ListingCard Link to /listing/[id] | unit | `pnpm --filter web vitest run components/explore` | ❌ W0 | ⬜ pending |
| 18-02 | EXPL-04 — AIChatButton scoped to Explore | unit | `pnpm --filter web vitest run components/chat` | ❌ W0 | ⬜ pending |
| 18-03 | EXPL-04 — AIChatPanel wired to CribAI API | unit | `pnpm --filter web vitest run components/chat` | ❌ W0 | ⬜ pending |
| 18-04 | EXPL-01 — ExploreLayout split view | unit | `pnpm --filter web vitest run components/explore` | ❌ W0 | ⬜ pending |
| 18-05 | EXPL-02 — ViewToggle list/map switch | unit | `pnpm --filter web vitest run components/explore` | ❌ W0 | ⬜ pending |
| 18-06 | EXPL-03 — FilterChips toggle and update | unit | `pnpm --filter web vitest run components/explore` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/components/explore/__tests__/ExploreLayout.test.tsx` — stubs for EXPL-01
- [ ] `apps/web/components/explore/__tests__/ViewToggle.test.tsx` — stubs for EXPL-02
- [ ] `apps/web/components/explore/__tests__/FilterChips.test.tsx` — stubs for EXPL-03
- [ ] `apps/web/components/chat/__tests__/AIChatButton.test.tsx` — stubs for EXPL-04 scoping
- [ ] `apps/web/components/chat/__tests__/AIChatPanel.test.tsx` — stubs for EXPL-04 wiring
- [ ] framer-motion mock in vitest.setup.ts or per-file

*Existing infrastructure covers framework setup; only test files need creation.*

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 3s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
