-- Fix re-embedding loop caused by updated_at trigger firing on embedding writes.
--
-- The original trigger fired updated_at = now() on every UPDATE, including the
-- write that sets embedding/embedding_text/last_embedded_at. This made
-- updated_at always slightly newer than last_embedded_at, so embed-listings.ts
-- would treat every row as changed and re-embed every listing on every run.
--
-- Fix: only bump updated_at when a content column actually changes.
-- Embedding columns (embedding, embedding_text, last_embedded_at) are excluded
-- from the change check so they never cause updated_at to advance.

CREATE OR REPLACE FUNCTION update_listings_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Skip updated_at bump if only embedding columns changed
  IF (
    NEW.address           IS NOT DISTINCT FROM OLD.address           AND
    NEW.rent_monthly      IS NOT DISTINCT FROM OLD.rent_monthly      AND
    NEW.bedrooms          IS NOT DISTINCT FROM OLD.bedrooms          AND
    NEW.bathrooms         IS NOT DISTINCT FROM OLD.bathrooms         AND
    NEW.sqft              IS NOT DISTINCT FROM OLD.sqft              AND
    NEW.amenities         IS NOT DISTINCT FROM OLD.amenities         AND
    NEW.photo_urls        IS NOT DISTINCT FROM OLD.photo_urls        AND
    NEW.is_active         IS NOT DISTINCT FROM OLD.is_active         AND
    NEW.source            IS NOT DISTINCT FROM OLD.source            AND
    NEW.source_url        IS NOT DISTINCT FROM OLD.source_url        AND
    NEW.location          IS NOT DISTINCT FROM OLD.location          AND
    NEW.campus_id         IS NOT DISTINCT FROM OLD.campus_id         AND
    NEW.available_date    IS NOT DISTINCT FROM OLD.available_date    AND
    NEW.true_cost         IS NOT DISTINCT FROM OLD.true_cost         AND
    NEW.true_cost_total   IS NOT DISTINCT FROM OLD.true_cost_total   AND
    NEW.fairness_score    IS NOT DISTINCT FROM OLD.fairness_score    AND
    NEW.fairness_data     IS NOT DISTINCT FROM OLD.fairness_data     AND
    NEW.raw_data          IS NOT DISTINCT FROM OLD.raw_data          AND
    NEW.last_seen_at      IS NOT DISTINCT FROM OLD.last_seen_at
  ) THEN
    RETURN NEW;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
