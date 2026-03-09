-- Add source column to match_listings_semantic RPC return type
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
  similarity double precision,
  source text
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
    1 - (l.embedding <=> query_embedding) AS similarity,
    l.source
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
