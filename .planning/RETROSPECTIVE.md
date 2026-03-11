# Retrospective

## Milestone: v1.0 — CampusNest MVP

**Shipped:** 2026-03-10
**Phases:** 9 | **Plans:** 29 | **Timeline:** 7 days | **Commits:** 263

### What Was Built
- Full auth system with OTP, .edu validation, profiles
- Multi-source scraper pipeline with nightly automation
- Semantic search with pgvector embeddings and Mapbox maps
- Saved listings with real-time price change notifications
- CribAI agentic chat with 11 tools including live web search
- DB-backed conversation persistence with sidebar

### What Worked
- GSD workflow kept execution disciplined across 29 plans
- Phase verification caught real bugs (setIsLoading in Phase 6, contact_email data loss)
- Milestone audit → gap closure phases (8, 9) systematically addressed integration issues
- Yolo mode with auto-chaining maximized throughput

### What Was Inefficient
- Phase 7 (scraper-fix) was planned but abandoned — orphaned directory remains
- First milestone audit triggered 2 additional phases (8, 9) — audit earlier next time
- Some SUMMARY files missing requirements-completed frontmatter (Phase 7-9)
- Nyquist validation never completed for any phase (all draft)

### Patterns Established
- Dev auth bypass pattern: isDevAuthEnabled + DEV_USER_COOKIE + createSecretClient
- Placeholder tool pattern: helpful "coming soon" with alternative resource links
- Price detection before upsert pattern for change notifications
- Dual persistence: DB for auth users, sessionStorage fallback for guests

### Key Lessons
- Run milestone audit before declaring "done" — Phases 8-9 wouldn't exist without it
- Integration gaps between phases are the most common source of bugs
- Tool description steering is effective for Gemini behavior control

### Cost Observations
- Model mix: Primarily sonnet for execution, opus for auditing/verification
- 29 plans executed in ~7 days of calendar time
- Average plan execution: ~5 minutes

---

## Cross-Milestone Trends

| Metric | v1.0 |
|--------|------|
| Phases | 9 |
| Plans | 29 |
| Days | 7 |
| Commits | 263 |
| LOC | ~23,800 |
| Requirements | 27/27 |
| Audit status | tech_debt |
