---
phase: 5
slug: agentic-data-pipeline-web-search
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing across all packages) |
| **Config file** | `services/scraper/vitest.config.ts`, `packages/ai/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @campusnest/scraper test -- --run && pnpm --filter @campusnest/ai test -- --run` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @campusnest/scraper test -- --run && pnpm --filter @campusnest/ai test -- --run`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | DATA-03 | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/zillow.test.ts` | No — W0 | pending |
| 05-01-02 | 01 | 1 | DATA-03 | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/craigslist.test.ts` | No — W0 | pending |
| 05-01-03 | 01 | 1 | DATA-03 | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/run.test.ts` | No — W0 | pending |
| 05-01-04 | 01 | 1 | DATA-03 | unit | `pnpm --filter @campusnest/scraper test -- --run __tests__/diagnostics.test.ts` | No — W0 | pending |
| 05-02-01 | 02 | 1 | AGENT-01 | unit | `pnpm --filter @campusnest/ai test -- --run __tests__/web-search.test.ts` | No — W0 | pending |
| 05-02-02 | 02 | 1 | AGENT-02 | unit | `pnpm --filter @campusnest/ai test -- --run __tests__/web-search-cache.test.ts` | No — W0 | pending |
| 05-02-03 | 02 | 1 | AGENT-01 | unit | `pnpm --filter @campusnest/ai test -- --run __tests__/executor.test.ts` | No — W0 | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

- [ ] `services/scraper/__tests__/zillow.test.ts` — stubs for Zillow scraper parsing
- [ ] `services/scraper/__tests__/craigslist.test.ts` — stubs for Craigslist RSS parsing
- [ ] `services/scraper/__tests__/run.test.ts` — stubs for buildScrapers without Google Places
- [ ] `services/scraper/__tests__/diagnostics.test.ts` — stubs for per-source diagnostic output
- [ ] `packages/ai/__tests__/web-search.test.ts` — stubs for Tavily handler with mocked API
- [ ] `packages/ai/__tests__/web-search-cache.test.ts` — stubs for session cache TTL and dedup
- [ ] `packages/ai/__tests__/executor.test.ts` — stubs for web_search registration

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Scraper produces 100+ listings from live sources | DATA-03 | Depends on external site availability | Run nightly scrape locally, verify listing count in Supabase |
| Web search indicator shows in chat UI | AGENT-02 | Visual/UX verification | Ask CribAI a query with no corpus matches, verify "Searching the web..." appears |
| Source citations display on ListingCards | DATA-07 | Visual/UX verification | View listings page, verify "via Craigslist", "via Zillow", "via web search" labels |
| Web results interleave with corpus results | AGENT-02 | Requires live Gemini + Tavily | Ask CribAI a mixed query, verify both corpus and web results appear together |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
