# Research Summary: CampusNest Milestone 2

**Domain:** AI-native student housing platform -- adding semantic search, saved listings/alerts, roommate matching, multi-source scraping
**Researched:** 2026-03-05
**Overall confidence:** HIGH

## Executive Summary

The most important finding is that the existing CampusNest stack already contains nearly all the dependencies needed for Milestone 2. The `@google/genai` SDK already supports `embedContent()` for vector embeddings. The `@supabase/supabase-js` client already supports Realtime subscriptions. Crawlee already includes CheerioCrawler for lightweight scraping. The `BaseScraper` abstract class is designed for multi-source extension. The only new npm dependency is Resend (+ React Email) for transactional email alerts. The work is predominantly database migrations, Postgres functions, Edge Functions, and new application code -- not new technology adoption.

The core architectural addition is pgvector for semantic search. Supabase natively supports the pgvector extension, which stores vector embeddings alongside relational data in the same Postgres database. Combined with Gemini's `gemini-embedding-001` model (768-dimensional embeddings via Matryoshka Representation Learning), this enables hybrid search: vector cosine similarity for qualitative ranking ("quiet, near campus, natural light") with SQL WHERE clauses for hard constraints (price, bedrooms, campus). This hybrid approach is the key to making CampusNest's AI search genuinely semantic rather than just SQL filters wrapped in a chatbot.

Roommate matching at v1 scale is best served by weighted scoring on structured preferences rather than embeddings. The preference space is small and structured (enums, numbers, booleans), making weighted scoring simpler, fully explainable ("85% match: you both prefer quiet and clean"), and effective without any training data. Embeddings can be added later if free-text bios prove important for matching quality.

The highest-risk area is scraper fragility and data freshness. Student housing inventory moves fast, and stale listings destroy trust instantly. Multi-source scraping provides redundancy, but each source requires proxy management and anti-bot handling. The legal landscape around scraping rental sites is nuanced. A manual listing submission path provides a legally clean, scraping-independent data source.

## Key Findings

**Stack:** No new major dependencies. pgvector (Supabase extension), `gemini-embedding-001` (already in `@google/genai`), Supabase Realtime (already in client), Resend (only new npm package).

**Architecture:** Add `embedding vector(768)` column to listings table. Hybrid search via `match_listings()` Postgres RPC. Durable notifications table with Realtime for live delivery. pg_cron for batch alert processing. ScraperRegistry pattern for multi-source orchestration.

**Critical pitfall:** Fair Housing Act compliance in AI-powered search and matching. Housing is one of the most legally sensitive domains for AI. Never include demographic data or neighborhood names in embedding inputs or matching features.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Semantic Search Infrastructure** - Foundation for everything else
   - Addresses: pgvector setup, embedding pipeline, `match_listings` RPC, semantic search CribAI tool
   - Avoids: Pitfall 1 (embedding task type drift), Pitfall 3 (HNSW index missing in production)
   - Rationale: This is the product differentiator. Without semantic search, CribAI is just a chatbot with SQL filters.

2. **Saved Listings and Alerts** - User retention
   - Addresses: saved_listings table, price_history tracking, notifications inbox, Realtime delivery, email digests
   - Avoids: Pitfall 4 (Realtime fan-out), Pitfall 8 (alert fatigue)
   - Rationale: Depends on listings table changes from Phase 1. Price history tracking needs to start early to accumulate data.

3. **Multi-Source Scraping** - Data quality and resilience
   - Addresses: ScraperRegistry, new BaseScraper implementations, cross-source dedup, health monitoring
   - Avoids: Pitfall 2 (silent scraper failure), Pitfall 5 (address normalization for dedup)
   - Rationale: Existing single-source scraper works for initial launch. Multi-source adds resilience but requires the embedding pipeline (Phase 1) for new listing embeddings.

4. **Roommate Matching** - Differentiator with cold-start risk
   - Addresses: roommate_profiles schema extension, weighted compatibility scoring, CribAI tool, match UI
   - Avoids: Pitfall 7 (cold start with small pools)
   - Rationale: No dependency on other phases. Can be built in parallel with Phase 2/3 after Phase 1. Should launch only when campus has 50+ profiles.

**Phase ordering rationale:**
- Semantic search first because the embedding pipeline is a prerequisite for enriched listing data that other features benefit from.
- Saved listings second because price history needs time to accumulate before alerts are useful.
- Multi-source scraping third because the existing Apartments.com scraper works for launch; multi-source adds resilience, not core functionality.
- Roommate matching last because it has the cold-start problem and benefits from an established user base.

**Research flags for phases:**
- Phase 1 (Semantic Search): Needs evaluation set of 50-100 test queries to validate embedding quality for real estate domain. Real estate jargon ("cozy" = small, "character" = old) may degrade generic embedding quality.
- Phase 3 (Multi-Source Scraping): Each new source (Zillow, Craigslist) likely needs individual research into current anti-bot measures and DOM structure.
- Phase 4 (Roommate Matching): Fair Housing Act compliance needs legal review before launch. Weight tuning needs user feedback data.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified via Supabase docs, Gemini API docs, existing codebase. Only 1 new npm dependency. |
| Features | HIGH | Well-researched against competitor landscape. Clear table stakes vs differentiators. |
| Architecture | HIGH | All patterns verified against official Supabase documentation. Hybrid search is the documented pattern. |
| Pitfalls | HIGH | Critical pitfalls (Fair Housing, data freshness, scraper fragility) well-documented in domain literature. |

## Gaps to Address

- **Embedding quality evaluation:** No test suite exists yet for measuring semantic search relevance. Need to build an evaluation set before declaring semantic search "done."
- **Resend pricing at scale:** Free tier covers initial usage (100 emails/day). Need to evaluate costs if alert adoption exceeds this threshold.
- **Zillow anti-bot measures (2026):** Current anti-scraping defenses use TLS fingerprinting and behavioral signals. Crawlee/Playwright may need supplementary configuration. This needs source-specific research during Phase 3.
- **pg_cron on Supabase free tier:** Need to verify pg_cron availability on Supabase's free tier vs Pro. May require Pro plan for scheduled jobs.
- **Fair Housing Act compliance:** Legal review needed before launching roommate matching. This is flagged as a critical pitfall but needs actual legal counsel, not just engineering guardrails.
