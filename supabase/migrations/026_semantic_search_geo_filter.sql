-- Add geographic proximity filtering to semantic search RPC
-- When lat/lng/radius are provided, results are filtered by ST_DWithin
-- and boosted by distance (closer = higher ranking)

CREATE OR REPLACE FUNCTION match_listings_semantic(
  query_embedding extensions.vector(768),
  p_campus_id uuid,
  p_bedrooms smallint DEFAULT NULL,
  p_min_rent numeric DEFAULT NULL,
  p_max_rent numeric DEFAULT NULL,
  p_min_fairness numeric DEFAULT NULL,
  match_count int DEFAULT 5,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_radius_m double precision DEFAULT 1600
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
DECLARE
  geo_point geography;
BEGIN
  -- Build geography point if coordinates provided
  IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
    geo_point := ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography;
  END IF;

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
    CASE
      -- When geo filter is active, blend semantic similarity with distance proximity
      -- 70% semantic + 30% distance score (1.0 = on top, 0.0 = at radius edge)
      WHEN geo_point IS NOT NULL AND l.location IS NOT NULL THEN
        0.7 * (1 - (l.embedding <=> query_embedding))
        + 0.3 * (1.0 - LEAST(ST_Distance(l.location, geo_point) / p_radius_m, 1.0))
      ELSE
        1 - (l.embedding <=> query_embedding)
    END AS similarity,
    l.source
  FROM listings l
  WHERE l.campus_id = p_campus_id
    AND l.is_active = true
    AND l.embedding IS NOT NULL
    AND (p_bedrooms IS NULL OR l.bedrooms = p_bedrooms)
    AND (p_min_rent IS NULL OR l.rent_monthly >= p_min_rent)
    AND (p_max_rent IS NULL OR l.rent_monthly <= p_max_rent)
    AND (p_min_fairness IS NULL OR l.fairness_score >= p_min_fairness)
    -- Geographic proximity filter: only when coordinates are provided
    AND (geo_point IS NULL OR (l.location IS NOT NULL AND ST_DWithin(l.location, geo_point, p_radius_m)))
  ORDER BY
    CASE
      WHEN geo_point IS NOT NULL AND l.location IS NOT NULL THEN
        -- Blended ranking: semantic + distance
        0.7 * (l.embedding <=> query_embedding)
        + 0.3 * (ST_Distance(l.location, geo_point) / p_radius_m)
      ELSE
        l.embedding <=> query_embedding
    END
  LIMIT match_count;
END;
$$;
