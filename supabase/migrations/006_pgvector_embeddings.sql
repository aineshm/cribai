-- Phase 3: pgvector embedding infrastructure
-- Adds vector embeddings to listings for semantic search

-- Enable pgvector extension in extensions schema (Supabase convention)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Add updated_at column for change detection (listings lacked this)
ALTER TABLE listings
  ADD COLUMN updated_at timestamptz DEFAULT now();

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_listings_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION update_listings_updated_at();

-- Add embedding columns to listings
ALTER TABLE listings
  ADD COLUMN embedding extensions.vector(768),
  ADD COLUMN embedding_text text,
  ADD COLUMN last_embedded_at timestamptz;

-- HNSW index for fast cosine similarity search
-- m=16 connections per node, ef_construction=64 for build quality
CREATE INDEX idx_listings_embedding
  ON listings USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Partial index for active embedded listings (campus-scoped queries)
CREATE INDEX idx_listings_active_embedded
  ON listings (campus_id)
  WHERE is_active = true AND embedding IS NOT NULL;

-- Hybrid search RPC: semantic similarity + hard filters
-- Returns listings ranked by cosine similarity with optional filters
CREATE OR REPLACE FUNCTION match_listings_semantic(
  query_embedding extensions.vector(768),
  p_campus_id uuid,
  p_bedrooms smallint DEFAULT NULL,
  p_min_rent numeric DEFAULT NULL,
  p_max_rent numeric DEFAULT NULL,
  p_min_fairness numeric DEFAULT NULL,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  address text,
  rent_monthly numeric,
  bedrooms smallint,
  bathrooms numeric,
  sqft numeric,
  fairness_score numeric,
  true_cost_total numeric,
  amenities jsonb,
  photo_urls text[],
  latitude double precision,
  longitude double precision,
  similarity double precision
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.address,
    l.rent_monthly,
    l.bedrooms,
    l.bathrooms,
    l.sqft,
    l.fairness_score,
    l.true_cost_total,
    l.amenities,
    l.photo_urls,
    ST_Y(l.location::geometry) AS latitude,
    ST_X(l.location::geometry) AS longitude,
    1 - (l.embedding <=> query_embedding) AS similarity
  FROM listings l
  WHERE l.campus_id = p_campus_id
    AND l.is_active = true
    AND l.embedding IS NOT NULL
    AND (p_bedrooms IS NULL OR l.bedrooms = p_bedrooms)
    AND (p_min_rent IS NULL OR l.rent_monthly >= p_min_rent)
    AND (p_max_rent IS NULL OR l.rent_monthly <= p_max_rent)
    AND (p_min_fairness IS NULL OR l.fairness_score >= p_min_fairness)
  ORDER BY l.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
