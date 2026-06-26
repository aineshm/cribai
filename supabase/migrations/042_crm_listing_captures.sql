-- Migration 042: Extension-captured HTML store for crm_deep_extract (AIN-78)
--
-- The Chrome extension's ingest route (POST /api/crm/ingest) captures the
-- user's real browser HTML and persists it here so the crm_deep_extract
-- mission's crawl_source step can reuse it as the landing-page source instead
-- of re-fetching the URL server-side (which anti-bot sites like Zillow block).
--
-- Design decisions:
--   - One row per listing (listing_id is the PK). On re-ingest of the same
--     URL the row is upserted — the freshest capture wins.
--   - html is stored as plain text. The 4 MiB cap is enforced at the ingest
--     route boundary before the row is written; no DB-level CHECK needed.
--   - RLS: owners manage their own captures. The mission worker runs under the
--     service role and bypasses RLS — it reads the capture then deletes it.
--   - Self-consuming: crawl_source deletes the row after reading it so storage
--     never accumulates. captured_at lets the index cover temporal scans.
--   - file-only: not applied to any Supabase project by this commit. Apply via
--     Supabase MCP under user supervision before deploying the code that uses it.

create table if not exists public.crm_listing_captures (
  listing_id  uuid primary key references public.crm_listings(id) on delete cascade,
  user_id     uuid not null,
  html        text not null,
  captured_at timestamptz not null default now()
);

alter table public.crm_listing_captures enable row level security;

-- Owners manage their own captures (defense-in-depth; the service-role worker
-- bypasses RLS when running the crm_deep_extract mission steps).
create policy "crm_listing_captures_owner_all" on public.crm_listing_captures
  for all to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Temporal index: lets a future cleanup job find stale captures efficiently.
create index if not exists crm_listing_captures_captured_at_idx
  on public.crm_listing_captures (captured_at);

-- Grants pinned explicitly (migration 034 pattern) so DROP/CREATE cycles
-- never silently revert to default privileges.
grant select, insert, update, delete
  on public.crm_listing_captures
  to authenticated, service_role;
