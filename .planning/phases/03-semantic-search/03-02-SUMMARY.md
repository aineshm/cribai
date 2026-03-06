---
phase: 03-semantic-search
plan: 02
subsystem: ai, ci
tags: [semantic-search, hybrid-search, vector-similarity, pgvector, embeddings, github-actions, sse]

requires:
  - phase: 03-semantic-search
    plan: 01
    provides: "pgvector embedding pipeline, match_listings_semantic RPC, MapBlock type"
provides:
  - "Hybrid search in search_listings: SQL filters + vector similarity ranking"
  - "semantic_query parameter and relevance sort in CRIBAI_TOOLS schema"
  - "MapBlock emission for 3+ semantic results via SSE"
  - "Embedding generation step in nightly scrape pipeline"
  - "CLI embed.ts entry point for GitHub Actions"
affects: [03-03-map-display, nightly-scrape-workflow, chat-ui]

tech-stack:
  added: []
  patterns: [hybrid-search-rpc-fallback, optional-mapblock-in-toolresult, cli-entry-point-for-ci]

key-files:
  created:
    - packages/ai/src/cli/embed.ts
    - packages/ai/src/tools/__tests__/search-listings-semantic.test.ts
  modified:
    - packages/ai/src/tools/schemas.ts
    - packages/ai/src/tools/handlers/search-listings.ts
    - packages/ai/src/tools/types.ts
    - packages/ai/src/cribai.ts
    - packages/ai/src/embeddings/generate-embedding.ts
    - .github/workflows/nightly-scrape.yml

key-decisions:
  - "Optional mapBlock field on ToolResult (backward compatible, no breaking changes)"
  - "Map block threshold: 3+ results with lat/lng triggers map display"
  - "Map center computed as average of result lat/lngs, zoom 14"
  - "No numeric similarity scores in modelContext (per user decision)"
  - "CLI embed.ts entry point run via npx tsx in GH Actions"

patterns-established:
  - "Hybrid search pattern: semantic_query present -> RPC path, absent -> SQL path"
  - "ToolResult mapBlock: optional secondary block emitted as separate SSE event"
  - "CI embedding pipeline: scrape -> fairness -> embeddings (sequential gating)"

requirements-completed: [SRCH-02, SRCH-04]

duration: 7min
completed: 2026-03-06
---

# Phase 3 Plan 2: Hybrid Search Integration Summary

**Semantic search_listings with vector similarity RPC, mapBlock for 3+ results, and embedding generation in nightly CI pipeline**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-06T03:44:59Z
- **Completed:** 2026-03-06T03:51:29Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- search_listings now supports hybrid search: semantic_query triggers vector similarity via match_listings_semantic RPC, while non-semantic queries use existing SQL path unchanged
- MapBlock returned for 3+ semantic results with lat/lng (center = average coords, zoom 14)
- Nightly scrape pipeline extended: scrape -> fairness recalculation -> embedding generation (sequential gating)
- ToolResult interface extended with optional mapBlock, emitted as separate SSE event by CribAI

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Semantic search failing tests** - `318e918` (test)
2. **Task 1 (GREEN): Hybrid search implementation** - `4aec66a` (feat)
3. **Task 2: Embedding pipeline + mapBlock SSE** - `708b5a7` (feat)

## Files Created/Modified
- `packages/ai/src/tools/__tests__/search-listings-semantic.test.ts` - 8 tests for semantic search: RPC path, backward compat, mapBlock, amenity filter, no scores
- `packages/ai/src/tools/schemas.ts` - Added semantic_query param and relevance sort to search_listings FunctionDeclaration
- `packages/ai/src/tools/handlers/search-listings.ts` - Semantic search path with RPC, map block generation, SQL fallback
- `packages/ai/src/tools/types.ts` - Added optional mapBlock to ToolResult interface
- `packages/ai/src/cribai.ts` - Emit mapBlock as separate SSE tool_result event
- `packages/ai/src/cli/embed.ts` - CLI entry point for embedding generation in GH Actions
- `packages/ai/src/embeddings/generate-embedding.ts` - Fixed to support both old/new Gemini API shapes
- `.github/workflows/nightly-scrape.yml` - Added embedding generation step after fairness recalculation

## Decisions Made
- Optional mapBlock field on ToolResult keeps the interface backward compatible (no breaking changes to existing handlers)
- Map block returned only for 3+ results (fewer results don't warrant a map view)
- Map center computed as average of all result lat/lngs with zoom 14 (campus-level view)
- No numeric similarity scores in modelContext per user decision from planning phase
- CLI embed.ts uses npx tsx for direct execution in GH Actions (no build step needed)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed Gemini embedding API shape change**
- **Found during:** Task 2 (build verification)
- **Issue:** pnpm install --force pulled newer @google/genai that changed response.embedding to response.embeddings[0]
- **Fix:** Updated generate-embedding.ts to support both old and new API shapes with fallback
- **Files modified:** packages/ai/src/embeddings/generate-embedding.ts
- **Verification:** Build passes, all 51 tests pass
- **Committed in:** 708b5a7 (Task 2 commit)

**2. [Rule 3 - Blocking] Fixed broken pnpm symlinks for zod**
- **Found during:** Task 1 (test execution)
- **Issue:** zod module not resolvable from packages/ai due to broken pnpm symlinks (iCloud path issue)
- **Fix:** Ran pnpm install --force to rebuild symlinks
- **Verification:** All existing and new tests run successfully
- **Not committed:** Infrastructure fix, no code changes

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for test/build infrastructure. No scope creep.

## Issues Encountered
- Pre-existing pnpm symlink issue in iCloud-synced workspace required --force reinstall
- @google/genai API breaking change (embedding -> embeddings) was introduced by the forced reinstall

## User Setup Required
- Add GEMINI_API_KEY as a GitHub repository secret for the embedding generation step in nightly scrape workflow

## Next Phase Readiness
- Hybrid search fully operational: semantic_query + hard filters -> RPC -> similarity-ranked results
- MapBlock type and SSE emission ready for 03-03 (map display UI component)
- Nightly pipeline: scrape -> fairness -> embeddings (complete chain)
- All 51 tests pass, build green

## Self-Check: PASSED

- All 8 created/modified files verified on disk
- All 3 task commits verified in git log (318e918, 4aec66a, 708b5a7)
- AI package build passes
- 51/51 tests pass (10 test files)

---
*Phase: 03-semantic-search*
*Completed: 2026-03-06*
