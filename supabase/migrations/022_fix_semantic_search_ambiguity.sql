-- Drop the geo-enabled overload that was added directly to the DB (not via migration).
-- The handler in packages/ai/src/tools/handlers/search-listings.ts only calls
-- the 7-param version, so this overload is unused and causes PostgREST ambiguity.
DROP FUNCTION IF EXISTS match_listings_semantic(
  extensions.vector,
  uuid,
  smallint,
  numeric,
  numeric,
  numeric,
  integer,
  double precision,
  double precision,
  double precision
);
