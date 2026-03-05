# Domain Pitfalls

**Domain:** AI-native student housing platform (semantic search, saved listings/alerts, roommate matching, multi-source scraping)
**Researched:** 2026-03-05

## Critical Pitfalls

Mistakes that cause rewrites, legal exposure, or platform-killing trust erosion.

### Pitfall 1: PageIndex Cannot Handle Semantic Search at Query Time

**What goes wrong:** The existing PageIndex RAG approach builds a hierarchical tree grouped by bedrooms and price tiers, then uses LLM reasoning to traverse it. This works for structured document retrieval but fundamentally cannot do what semantic search requires: matching qualitative user intent ("quiet neighborhood with natural light near the engineering building") against listing attributes. PageIndex is designed for navigating known document structures, not for similarity matching across hundreds of listings with fuzzy, subjective criteria.

**Why it happens:** PageIndex was a reasonable choice for the initial chat context retrieval -- it gives the LLM a structured overview of the listing landscape. But semantic search is a different problem: it requires encoding qualitative attributes into a comparable representation (embeddings) and performing nearest-neighbor lookup. Trying to force PageIndex into this role results in slow, expensive multi-LLM-call queries that still miss relevant results because the tree structure groups by price/bedrooms, not by qualitative features.

**Consequences:** Search results feel arbitrary. Students describe what they want in natural language and get results filtered only by numeric attributes (rent, bedrooms, fairness score) -- which is exactly what the current `search-listings.ts` does with SQL WHERE clauses. The "AI-native" differentiator becomes a marketing claim, not a real capability.

**Prevention:**
- Add pgvector to Supabase and generate embeddings for listings that encode qualitative attributes (neighborhood character, natural light, noise level, proximity descriptions, amenity quality).
- Use a hybrid approach: vector similarity for semantic ranking + SQL filters for hard constraints (max rent, min bedrooms).
- Keep PageIndex for what it does well: giving the CribAI chat engine a market overview for conversational context. Do not try to make it the search backend.
- Use Gemini's embedding model (`text-embedding-004`, 768 dimensions) to stay within the existing AI provider.

**Detection:** If search results only vary by numeric filters and never surface listings based on qualitative descriptions, semantic search is not actually working.

**Phase mapping:** Semantic Search phase -- this is the core architectural decision and must be addressed first.

**Confidence:** HIGH -- verified through official Supabase pgvector docs, PageIndex architecture analysis, and existing codebase review showing purely SQL-filter-based search.

---

### Pitfall 2: Stale Listing Data Destroys Student Trust Instantly

**What goes wrong:** Students find a listing through CampusNest, get excited, contact the landlord, and discover it was rented two weeks ago. This happens once and the student never comes back. In student housing, inventory moves fast -- leases for fall semester get signed months ahead, and desirable units near campus disappear within days.

**Why it happens:** The current scraper runs on a cron schedule (`scrape_cron` defaults to `0 2 * * *` -- daily at 2 AM). Daily scraping catches new listings but does not catch removals or status changes quickly enough. Apartments.com listings can go from available to leased within hours. The `is_active` flag on listings has no automated staleness check -- once scraped, a listing stays "active" until the next scrape explicitly marks it otherwise.

**Consequences:** Trust erosion is the number one killer of rental platforms. Students talk to each other. One bad experience ("CampusNest showed me a place that was already taken") spreads through dorm group chats and kills adoption at that campus. The platform's data quality reputation becomes its ceiling.

**Prevention:**
- Implement a `stale_after` threshold: listings not re-confirmed in 72 hours get a "may be unavailable" badge. After 7 days without re-confirmation, auto-deactivate.
- Add a "Report unavailable" button on listing cards so students can flag stale listings in real-time. This is cheap crowdsourced data quality.
- For saved/favorited listings, run targeted re-scrapes more frequently (every 6-12 hours) rather than waiting for the full campus scrape cycle.
- Track `last_seen_at` vs `first_seen_at` to calculate listing freshness and surface it in the UI ("Listed 2 days ago" vs "Listed 3 weeks ago").
- Consider webhook or API integrations where available (some listing aggregators offer feeds) instead of relying solely on scraping.

**Detection:** Monitor the ratio of listings that disappear between scrape cycles. If >15% of "active" listings vanish in a single scrape run, the data is going stale too fast for the scrape frequency.

**Phase mapping:** Multi-source Scraping phase -- freshness infrastructure must be part of the scraping pipeline, not bolted on later.

**Confidence:** HIGH -- data freshness is the most commonly cited trust issue in rental platform literature and user feedback.

---

### Pitfall 3: Fair Housing Act Violations Through AI Bias in Search and Matching

**What goes wrong:** The AI search or roommate matching inadvertently discriminates based on protected classes (race, familial status, disability, national origin, religion, sex). This can happen through: (a) embedding models that encode societal biases about neighborhoods, (b) roommate matching that uses proxies for protected characteristics, (c) search ranking that deprioritizes listings in certain neighborhoods.

**Why it happens:** HUD issued explicit guidance in 2024 on AI applications under the Fair Housing Act. Housing is one of the most legally sensitive domains for AI. Unlike e-commerce recommendations, housing search and tenant matching carry disparate impact liability. A roommate matching algorithm that factors in "lifestyle compatibility" can easily become a proxy for race, religion, or national origin. An embedding model trained on general text will encode neighborhood stereotypes.

**Consequences:** Legal liability under the Fair Housing Act (disparate impact claims do not require intent). Platform shutdown. Reputational destruction. The 2025 Fair Housing Trends Report documented 32,321 discrimination complaints filed in 2024 alone.

**Prevention:**
- Never include demographic data in embedding inputs or matching features. Roommate matching should use behavioral preferences (sleep schedule, noise tolerance, cleanliness, study habits) not identity characteristics.
- Do not use neighborhood names or ZIP codes as embedding features -- these are well-documented proxies for racial composition.
- Add a Fair Housing disclaimer to all AI-generated responses (the existing lease-terms knowledge base already has legal disclaimer patterns -- extend this).
- Audit search results periodically: do certain listing neighborhoods consistently rank lower? That is a red flag.
- For roommate matching, let users set their own preferences and show mutual matches. Do not use AI to infer "compatibility" beyond stated preferences.
- Log all AI-driven ranking decisions for auditability.

**Detection:** Run disparate impact analysis on search results: group listings by neighborhood demographics, check if any group is systematically ranked lower. For roommate matching, check if match rates vary by demographic proxies.

**Phase mapping:** Roommate Matching phase (primary) and Semantic Search phase (secondary). Must be designed in from the start, not audited after launch.

**Confidence:** HIGH -- HUD guidance is explicit, case law is active (Equal Rights Center v. Meta), and housing AI discrimination is a 2025-2026 enforcement priority.

---

### Pitfall 4: Scraper Fragility and Legal Exposure from Apartments.com

**What goes wrong:** Apartments.com changes their HTML structure, adds anti-bot protections (Cloudflare, TLS fingerprinting), or sends a cease-and-desist. The scraper breaks silently, listings stop updating, and the platform serves increasingly stale data without anyone noticing.

**Why it happens:** Single-source dependency. The existing scraper targets only Apartments.com. Modern anti-scraping defenses in 2025-2026 use TLS fingerprinting, behavioral signals, and bot reputation scoring -- not just IP blocking. Crawlee/Playwright can handle basic protections but not sophisticated bot detection. Additionally, Apartments.com's Terms of Service likely prohibit scraping, and while scraping public data has legal precedent (hiQ Labs v. LinkedIn), the legal landscape is nuanced and enforcement is increasing.

**Consequences:** Complete data pipeline failure. If the scraper breaks on a Friday and nobody checks until Monday, three days of listings are missed during peak leasing season. Legal cease-and-desist forces a scramble to find alternative data sources.

**Prevention:**
- Build multi-source scraping from the start: Apartments.com + Zillow Rentals + Craigslist + university housing boards. If one source breaks, others provide coverage.
- Implement scraper health monitoring: alert if a scrape run returns zero new listings or significantly fewer than the previous run.
- Add a manual listing submission flow for landlords/property managers as a scraping-independent data source.
- Respect robots.txt, rate-limit requests, and add reasonable delays. Store attribution (source field already exists in schema).
- Design the normalizer to handle source-specific failures gracefully -- a broken Apartments.com scraper should not crash the pipeline for other sources.
- Consider listing aggregator APIs (RentCast, Apartment List API) as paid but legally clean alternatives for critical markets.

**Detection:** Scrape run monitoring: track listings_added, listings_removed, listings_unchanged per run. Alert on zero-add runs or >50% drop from previous run.

**Phase mapping:** Multi-source Scraping phase -- this is the primary concern of that phase.

**Confidence:** HIGH -- verified through existing codebase (single Apartments.com scraper) and current anti-scraping landscape research.

---

## Moderate Pitfalls

### Pitfall 5: pgvector Performance Cliff on Supabase Free/Pro Tiers

**What goes wrong:** Vector search performance degrades dramatically when the HNSW index exceeds available shared memory. On Supabase's lower-tier plans, this happens sooner than expected, especially with 768+ dimension embeddings.

**Prevention:**
- Use Gemini's `text-embedding-004` (768 dimensions) rather than OpenAI's ada-002 (1536 dimensions) -- half the memory footprint.
- For a 3-5 campus launch with maybe 5,000-20,000 listings, pgvector on Supabase Pro is fine. But plan the index strategy upfront.
- Create HNSW indexes with appropriate `m` and `ef_construction` parameters. Start with `m=16, ef_construction=64` for small datasets.
- Monitor query latency. If vector searches exceed 200ms consistently, the index is being evicted from memory.

**Detection:** Track p95 latency on vector search queries. Sudden latency spikes (100ms to 2s+) indicate index eviction.

**Phase mapping:** Semantic Search phase -- index configuration is part of the embedding infrastructure.

**Confidence:** MEDIUM -- verified through Supabase pgvector docs; specific tier limitations depend on plan chosen.

---

### Pitfall 6: Saved Listings Alerts Become Notification Spam

**What goes wrong:** Students save 20 listings, enable price change alerts, and get bombarded with notifications every time the scraper re-ingests data with minor price variations, data normalization differences, or false-positive "changes." Students disable notifications entirely, defeating the feature's purpose.

**Prevention:**
- Define meaningful change thresholds: price changes >$25/month, availability status changes, new photos/descriptions. Ignore noise.
- Batch notifications: send a daily digest rather than real-time alerts for non-critical changes. Reserve real-time for "listing removed" or "price dropped >10%."
- Let students configure alert sensitivity (immediate for favorites, daily digest for saved).
- Use Supabase Realtime for in-app notifications but email/push only for significant events. Supabase Realtime's Postgres Changes listener processes on a single thread -- fine for notification volume at this scale but be aware of the bottleneck.
- Track notification engagement (open rate, click-through). If <5% of alerts get opened, the thresholds are too noisy.

**Detection:** Monitor alert-to-action ratio. If students receive alerts but never click through, noise is too high.

**Phase mapping:** Saved Listings/Alerts phase.

**Confidence:** MEDIUM -- common pattern from email marketing and notification system design literature.

---

### Pitfall 7: Roommate Matching Cold Start Problem

**What goes wrong:** With 3-5 campuses launching, the roommate pool at any given campus is tiny. A student creates a roommate profile and gets zero or one match. The feature feels broken, and students conclude it is useless before the network reaches critical mass.

**Prevention:**
- Do not launch roommate matching until a campus has a minimum viable pool (target: 50+ active roommate profiles per campus). Use waitlists with "notify me when matching is available at [campus]."
- Show "X students are looking for roommates at [university]" as social proof even before matching is live.
- Make the roommate profile creation valuable on its own -- let it feed into the AI chat ("based on your roommate preferences, here are listings that would work for sharing").
- Consider allowing cross-campus matching for students transferring or choosing between schools.
- Start with a simple compatibility score based on stated preferences rather than a complex ML model. Explainable matching ("85% compatible: you both prefer quiet, clean, and early sleep schedules") builds more trust than a black-box score.

**Detection:** Track profile creation rate and match-click rate per campus. If <20% of profiles ever view a match, the pool is too small.

**Phase mapping:** Roommate Matching phase -- this determines whether to launch the feature per-campus or hold it.

**Confidence:** MEDIUM -- standard two-sided marketplace cold start problem, well-documented in marketplace literature.

---

### Pitfall 8: Embedding Quality for Real Estate is Harder Than It Looks

**What goes wrong:** Generic text embeddings do not capture real estate semantics well. "Cozy" means small. "Up and coming neighborhood" means gentrifying. "Character" means old. Students and listing descriptions use different vocabularies for the same concepts. The semantic search returns results that are textually similar but not actually what the student wanted.

**Prevention:**
- Do not embed raw listing descriptions verbatim. Pre-process listings into a structured embedding input that includes: explicit attributes (sqft, amenities), computed attributes (distance to campus, transit score), and a normalized qualitative summary generated by Gemini from the raw description.
- Use Gemini to generate a "student-relevant summary" of each listing that translates real estate jargon into student language, then embed that summary.
- Build evaluation sets: 50-100 test queries with expected top-5 results, manually curated. Run these against your embedding search and measure recall. This is your quality gate for the search feature.
- Consider fine-tuning or using domain-adapted embeddings if generic models underperform, but start with the evaluation set first to quantify the gap.

**Detection:** Manual review of search results for qualitative queries. If "quiet studio near campus" returns a noisy apartment complex because the listing description mentions "quiet" once, the embedding is picking up keyword overlap, not semantic meaning.

**Phase mapping:** Semantic Search phase -- embedding pipeline design.

**Confidence:** MEDIUM -- NoBroker Engineering's neural property embeddings work confirms this challenge; Zillow's tech blog documents similar issues with real estate data complexity.

---

## Minor Pitfalls

### Pitfall 9: RLS Policy Gaps When Adding New Tables

**What goes wrong:** New tables for saved listings, alerts, and roommate matches get created without RLS policies, or with policies that are too permissive. Students can see other students' saved listings, alert preferences, or (worse) roommate profile data they should not have access to.

**Prevention:**
- Every migration that creates a table must include `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and at least a default-deny policy. The existing schema follows this pattern -- maintain it.
- Saved listings: `user_id = auth.uid()` for all operations.
- Roommate profiles: readable by other students at the same campus (for matching), but contact info / detailed preferences only visible after mutual match.
- Write a checklist for migration review: RLS enabled? Policies for SELECT/INSERT/UPDATE/DELETE? Service role bypass documented?

**Detection:** Supabase dashboard shows tables with RLS disabled. Check after every migration.

**Phase mapping:** All phases -- every schema change.

**Confidence:** HIGH -- directly observable in the existing codebase pattern.

---

### Pitfall 10: Campus-Scoped Multi-Tenancy Breaks with Cross-Campus Features

**What goes wrong:** The existing RLS policies scope everything to `campus_id` from the user's profile. Features like "compare listings across campuses" (for students choosing between schools) or cross-campus roommate matching break the tenancy model.

**Prevention:**
- Do not add cross-campus features in this milestone. The current model is clean -- keep it.
- If cross-campus features are needed later, add them as explicit opt-in queries that bypass the campus RLS using service-role calls with application-level authorization, not by loosening RLS policies.
- Document the campus-scoping assumption clearly so future developers do not accidentally create cross-campus data leaks.

**Detection:** Any feature request that says "across campuses" or "compare schools" is a flag to review the tenancy model impact.

**Phase mapping:** Out of scope for this milestone, but document the constraint.

**Confidence:** HIGH -- directly observable in schema design.

---

### Pitfall 11: Gemini API Cost Escalation with Embedding Generation

**What goes wrong:** Generating embeddings for every listing on every scrape cycle, plus per-query embeddings for search, plus PageIndex tree generation LLM calls adds up. With 5 campuses, 20,000 listings, daily scrapes, and hundreds of student queries, Gemini API costs grow faster than expected.

**Prevention:**
- Cache embeddings. Only regenerate when listing content actually changes (compare content hash, not just `last_seen_at`).
- Use `text-embedding-004` for embeddings (cheap) and `gemini-2.5-flash` for generation (also cheap). Do not use expensive models for embeddings.
- Set a per-campus, per-day API budget cap. Alert at 80% of budget.
- Batch embedding requests rather than one-at-a-time.
- The PageIndex tree rebuild does not need to happen on every scrape -- only when listing composition changes materially (>10% new/removed listings).

**Detection:** Track API cost per campus per day. Set alerts for anomalous spikes.

**Phase mapping:** Semantic Search phase (embedding costs) and Multi-source Scraping phase (increased scrape volume = more embeddings).

**Confidence:** MEDIUM -- cost depends on actual query volume and scrape frequency, but the pattern is well-known.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Semantic Search | PageIndex alone cannot do similarity search; need pgvector (#1) | Add pgvector + embeddings, keep PageIndex for chat context only |
| Semantic Search | Embedding quality for real estate jargon (#8) | Pre-process listings into student-friendly summaries before embedding |
| Semantic Search | pgvector memory limits on Supabase tiers (#5) | Use 768-dim embeddings, monitor query latency, configure HNSW properly |
| Saved Listings/Alerts | Notification spam from noisy data changes (#6) | Define meaningful change thresholds, batch non-critical alerts |
| Saved Listings/Alerts | RLS gaps on new tables (#9) | Follow existing RLS pattern, review every migration |
| Roommate Matching | Cold start with small campus pools (#7) | Waitlist until 50+ profiles, make profiles useful for search |
| Roommate Matching | Fair Housing discrimination via matching proxies (#3) | Behavioral preferences only, no identity or neighborhood proxies |
| Multi-source Scraping | Single-source fragility and legal risk (#4) | Build multi-source from day one, add scraper health monitoring |
| Multi-source Scraping | Stale listing data kills trust (#2) | Staleness badges, crowdsourced flagging, targeted re-scrapes for saved listings |
| All Phases | API cost escalation (#11) | Cache embeddings, batch requests, set budget caps |
| All Phases | Cross-campus feature requests break tenancy model (#10) | Defer cross-campus features, document the constraint |

## Sources

- [Supabase pgvector documentation](https://supabase.com/docs/guides/database/extensions/pgvector)
- [Supabase semantic search guide](https://supabase.com/docs/guides/ai/semantic-search)
- [Supabase HNSW index troubleshooting](https://supabase.com/docs/guides/troubleshooting/increase-vector-lookup-speeds-by-applying-an-hsnw-index-ohLHUM)
- [Optimizing Vector Search at Scale: pgvector & Supabase](https://medium.com/@dikhyantkrishnadalai/optimizing-vector-search-at-scale-lessons-from-pgvector-supabase-performance-tuning-ce4ada4ba2ed)
- [PageIndex: Promising but not production-ready](https://medium.com/@hr_77146/pageindex-a-promising-paradigm-shift-in-rag-architecture-that-isnt-quite-ready-for-production-9a3ce87dc1db)
- [PageIndex will not kill RAG](https://medium.com/@aldendorosario/no-pageindex-will-not-kill-rag-but-it-is-indeed-excellent-in-some-cases-11bc67473145)
- [NoBroker neural property embeddings](https://medium.com/nobroker-engineering/finding-your-next-home-with-neural-property-embeddings-c42d0bea9011)
- [Zillow: AI complexities and pitfalls in real estate data](https://www.zillow.com/tech/using-ai-to-understand-the-complexities-and-pitfalls-of-real-estate-data/)
- [Zillow home embeddings for recommendations](https://www.zillow.com/tech/embedding-similar-home-recommendation/)
- [HUD Fair Housing Act guidance on AI](https://archives.hud.gov/news/2024/pr24-098.cfm)
- [2025 Fair Housing Trends Report](https://nationalfairhousing.org/new-fair-housing-trends-report-finds-pervasive-discrimination-as-federal-government-rolls-back-civil-rights/)
- [Algorithmic bias in rental housing](https://www.dailyjournal.com/article/387067-how-algorithmic-bias-keeps-renters-out-and-puts-fair-housing-to-the-test)
- [Web scraping legal best practices 2026](https://www.scraperapi.com/web-scraping/is-web-scraping-legal/)
- [Data freshness in web scraping](https://shoppingscraper.com/blog/how-to-ensure-data-freshness-in-web-scraping)
- [Supabase Realtime documentation](https://supabase.com/docs/guides/realtime)
- [Diggz improved roommate matching algorithm](https://blog.diggz.co/the-new-and-improved-matching-algorithm/)
