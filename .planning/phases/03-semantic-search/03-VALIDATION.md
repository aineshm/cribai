---
phase: 03
slug: semantic-search
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1+ |
| **Config file** | `packages/ai/vitest.config.ts` and `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @campusnest/ai test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @campusnest/ai test`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | SRCH-01 | unit | `pnpm --filter @campusnest/ai test -- --grep "synthesize"` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | SRCH-01 | unit | `pnpm --filter @campusnest/ai test -- --grep "embedding"` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | SRCH-01 | unit | `pnpm --filter @campusnest/ai test -- --grep "embed-listings"` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | SRCH-02 | unit | `pnpm --filter @campusnest/ai test -- --grep "semantic"` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 1 | SRCH-02 | unit | `pnpm --filter @campusnest/ai test -- --grep "search"` | ✅ | ⬜ pending |
| 03-02-03 | 02 | 1 | SRCH-02 | unit | `pnpm --filter @campusnest/ai test -- --grep "hybrid"` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 2 | SRCH-03 | unit | `pnpm --filter @campusnest/web test -- --grep "map"` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 2 | SRCH-03 | unit | `pnpm --filter @campusnest/ai test -- --grep "map block"` | ❌ W0 | ⬜ pending |
| 03-04-01 | 02 | 1 | SRCH-04 | unit | `pnpm --filter @campusnest/ai test -- --grep "relevance"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/ai/src/embeddings/__tests__/synthesize-text.test.ts` — stubs for SRCH-01 text synthesis
- [ ] `packages/ai/src/embeddings/__tests__/generate-embedding.test.ts` — stubs for SRCH-01 embedding generation
- [ ] `packages/ai/src/embeddings/__tests__/embed-listings.test.ts` — stubs for SRCH-01 batch processing
- [ ] `packages/ai/src/tools/__tests__/search-listings-semantic.test.ts` — stubs for SRCH-02 hybrid search
- [ ] `apps/web/components/chat/__tests__/map-block.test.tsx` — stubs for SRCH-03 map rendering

*Existing infrastructure covers SRCH-02 backward compatibility (search-listings.test.ts exists).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Map renders with correct pins and popups | SRCH-03 | Visual rendering + Mapbox API | Open chat, search for listings, verify map shows price-label pins with clickable popups |
| Semantic results feel relevant | SRCH-04 | Subjective quality assessment | Ask CribAI qualitative queries ("quiet place with natural light"), verify results make sense |
| Map popup triggers CribAI context | SRCH-03 | Interactive chat + map integration | Click a map pin, then ask CribAI about the pinned listing without re-specifying it |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
