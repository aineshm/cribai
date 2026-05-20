<!-- Updated: 2026-04-22 | Runtime rebuild data map -->
# Data

## Schema (supabase/migrations/001_initial_schema.sql)

```
campus_configs
  id uuid PK, slug text UNIQUE, name, university_name, edu_domains text[],
  latitude, longitude, timezone, scrape_cron, scrape_radius_km,
  config jsonb, is_public bool

profiles (1:1 with auth.users via trigger)
  id uuid PK FK→auth.users, campus_id FK→campus_configs,
  display_name, edu_email, is_edu_verified bool, verification_status,
  subscription_tier (free|pro|premium), stripe_customer_id

listings
  id uuid PK, campus_id FK, external_id+source UNIQUE,
  raw_data jsonb, address, location geography(Point),
  rent_monthly int, bedrooms, bathrooms, sqft, amenities text[],
  available_date, true_cost jsonb, true_cost_total numeric,
  fairness_score numeric, fairness_data jsonb,
  is_active bool, first_seen_at, last_seen_at

pageindex_trees
  id uuid PK, campus_id FK, entity_type, tree jsonb,
  leaf_count int, built_at timestamp

ai_query_logs (rate limiting)
  id uuid PK, user_id FK, query_text, tokens_used, created_at

conversations
  id uuid PK, user_id FK, title, context jsonb legacy,
  conversation_state jsonb default durable chat working memory

missions
  id uuid PK, user_id FK, type, status, input jsonb, state jsonb, result jsonb,
  current_step_index int, attempt_count int, leased_until timestamptz,
  last_heartbeat_at timestamptz, last_error text, step_attempts jsonb

landlords
  id uuid PK, name, company, scorecard jsonb

landlord_reviews
  id uuid PK, landlord_id FK, user_id FK, listing_id FK,
  ratings jsonb, review_text, lease_verified bool, lease_doc_path

sublets
  id uuid PK, user_id FK, campus_id FK, title, rent_monthly,
  available_from, available_to, photos text[], status
```

## Key Indexes

- idx_listings_campus_rent (campus_id, rent_monthly)
- idx_listings_location GIST (location)
- idx_listings_campus_active (campus_id, is_active)
- idx_ai_logs_user_date (user_id, created_at)
- idx_missions_queue_claim (status, leased_until, updated_at) for queued worker pickup

## Queue Helpers

- `claim_next_mission_job(p_lease_seconds)` atomically claims one queued/retrying/stale-running mission with `FOR UPDATE SKIP LOCKED`

## RLS: Enabled on all tables

## Seed: supabase/seed/001_campus_configs.sql (UW-Madison, UT Austin)
