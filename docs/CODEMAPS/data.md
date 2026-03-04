# Data Codemap

**Last Updated:** 2026-03-04
**Source:** `supabase/migrations/001_initial_schema.sql`
**Extensions:** `postgis` (geography/GIST index)

## Tables

### `campus_configs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| slug | text UNIQUE | URL segment, e.g. `uw-madison` |
| name | text | Display name |
| university_name | text | |
| edu_domains | text[] | e.g. `{wisc.edu}` |
| location | geography(POINT) | PostGIS — campus coordinates |
| timezone | text | Default `America/Chicago` |
| scrape_cron | text | Default `0 2 * * *` |
| scrape_radius_km | numeric | Default 5 |
| config | jsonb | `avgUtilities`, `avgParking`, `commuteHubs` |
| is_public | boolean | Gates visibility + RLS |

Seed: `supabase/seed/001_campus_configs.sql` — UW-Madison, UT Austin

---

### `profiles`
Extends `auth.users` 1-to-1 (auto-created via trigger on signup).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK → auth.users | |
| campus_id | uuid → campus_configs | Set on edu verification |
| edu_email | text | Submitted .edu address |
| is_edu_verified | boolean | Gates campus listing access |
| verification_status | text | `unverified` / `pending` / `verified` / `rejected` |
| subscription_tier | text | `free` / `pro` / `premium` — controls AI rate limits |
| stripe_customer_id | text | Phase 2 |

---

### `listings`
Core scraped + enriched listing records.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| campus_id | uuid → campus_configs | |
| external_id | text | Source-specific ID |
| source | text | e.g. `apartments.com` |
| raw_data | jsonb | Original scraped payload |
| address | text | |
| location | geography(POINT) | PostGIS |
| rent_monthly | numeric | |
| bedrooms | smallint | nullable |
| bathrooms | numeric | nullable |
| sqft | numeric | nullable |
| amenities | jsonb | Array of strings |
| available_date | date | |
| true_cost | jsonb | `TrueCost` shape |
| true_cost_total | numeric | Denormalized for sorting |
| fairness_score | numeric 1–10 | Computed by `recalculate-fairness` |
| fairness_data | jsonb | `FairnessData` shape |
| is_active | boolean | Set false when listing disappears |
| first_seen_at / last_seen_at | timestamptz | |

Unique constraint: `(external_id, source)` — dedup key for upserts.
Indexes: `(campus_id, rent_monthly) WHERE is_active`, GIST on `location`, `(campus_id) WHERE is_active`.

---

### `pageindex_trees`
Hierarchical RAG trees for CribAI. One tree per `(campus_id, entity_type)`.

| Column | Type | Notes |
|--------|------|-------|
| campus_id | uuid | |
| entity_type | text | e.g. `listings`, `landlords` |
| tree | jsonb | Nested `PageIndexNode` |
| leaf_count | integer | |
| built_at | timestamptz | |

---

### `ai_query_logs`
Rolling window counter for AI rate limiting.

| Column | Type |
|--------|------|
| user_id | uuid → auth.users |
| query_text | text |
| tokens_used | integer |
| created_at | timestamptz |

Index: `(user_id, created_at DESC)` for efficient window queries.

---

### `landlords` + `landlord_reviews`
Landlord scorecard and user reviews. Reviews require `is_edu_verified=true` to insert.

---

### `sublets` (Phase 2)
User-posted sublets. Campus-scoped reads, own writes.

### `roommate_profiles` (Phase 2)
Preference matching data.

## RLS Summary

| Table | Read | Write |
|-------|------|-------|
| campus_configs | public where `is_public` | service role only |
| profiles | own row only | own row only |
| listings | campus-match only (same campus_id as profile) | service role only |
| landlords | public | service role only |
| landlord_reviews | public | edu-verified users only |
| sublets | campus-match | own rows only |
| ai_query_logs | own rows | own rows |

## Custom JWT Claims
`auth.custom_claims(uid)` returns `{ campus_id, is_edu_verified, subscription_tier }` embedded in JWT for use in RLS policies without extra profile lookups.

## Related Codemaps
- [backend.md](./backend.md) — which functions write to which tables
- [architecture.md](./architecture.md) — data flow overview
