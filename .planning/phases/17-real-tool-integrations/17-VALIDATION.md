---
phase: 17
slug: real-tool-integrations
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-10
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.x |
| **Config file** | packages/ai/vitest.config.ts |
| **Quick run command** | `pnpm --filter @campusnest/ai test -- --run` |
| **Full suite command** | `pnpm run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @campusnest/ai test -- --run`
- **After every plan wave:** Run `pnpm run test && pnpm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | TOOLS-01 | unit | `pnpm --filter @campusnest/ai test -- --run src/tools/__tests__/google-places.test.ts` | ✅ | ✅ green (8) |
| 17-01-02 | 01 | 1 | TOOLS-03 | unit | `pnpm --filter @campusnest/ai test -- --run src/tools/__tests__/walkscore.test.ts` | ✅ | ✅ green (3) |
| 17-01-03 | 01 | 1 | ALL | unit | `pnpm --filter @campusnest/ai test -- --run src/tools/__tests__/api-cache.test.ts` | ✅ | ✅ green (4) |
| 17-02-01 | 02 | 2 | TOOLS-01 | unit | `pnpm --filter @campusnest/ai test -- --run src/tools/__tests__/get-reviews.test.ts` | ✅ | ✅ green (10) |
| 17-02-02 | 02 | 2 | TOOLS-03 | unit | `pnpm --filter @campusnest/ai test -- --run src/tools/__tests__/get-neighborhood-info.test.ts` | ✅ | ✅ green (7) |
| 17-03-01 | 03 | 2 | TOOLS-02 | unit | `pnpm --filter @campusnest/ai test -- --run src/tools/__tests__/contact-pm.test.ts` | ✅ | ✅ green (8) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `packages/ai/src/tools/__tests__/google-places.test.ts` — 8 API client tests (Text Search, Place Details, Nearby Search)
- [x] `packages/ai/src/tools/__tests__/walkscore.test.ts` — 3 API client tests (success, failure, network error)
- [x] `packages/ai/src/tools/__tests__/api-cache.test.ts` — 4 cache tests (hit, miss, expiry, upsert)
- [x] Mock setup for `global.fetch` using `vi.stubGlobal`
- [x] Mock setup for `createGeminiClient` using `vi.mock`

*All Wave 0 tests green — 40/40 passing across 6 test files.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Google Places returns real reviews for UW-Madison property | TOOLS-01 | Requires live API key and real address | Call get_reviews with known UW-Madison address, verify non-stub response |
| Walk Score returns real scores | TOOLS-03 | Requires live API key | Call get_neighborhood_info with known Madison address, verify numeric scores |

---

## Validation Audit 2026-03-11

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

*Note: 3 pre-existing test failures in get-saved-listings (1) and persist-web-listing (2) are unrelated to Phase 17 — logged in deferred-items.md.*

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s (5.9s actual)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete
