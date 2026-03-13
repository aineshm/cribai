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
    NEW.address             IS NOT DISTINCT FROM OLD.address AND
    NEW.unit                IS NOT DISTINCT FROM OLD.unit AND
    NEW.city                IS NOT DISTINCT FROM OLD.city AND
    NEW.state               IS NOT DISTINCT FROM OLD.state AND
    NEW.zip                 IS NOT DISTINCT FROM OLD.zip AND
    NEW.rent_monthly        IS NOT DISTINCT FROM OLD.rent_monthly AND
    NEW.bedrooms            IS NOT DISTINCT FROM OLD.bedrooms AND
    NEW.bathrooms           IS NOT DISTINCT FROM OLD.bathrooms AND
    NEW.sqft                IS NOT DISTINCT FROM OLD.sqft AND
    NEW.available_date      IS NOT DISTINCT FROM OLD.available_date AND
    NEW.lease_term_months   IS NOT DISTINCT FROM OLD.lease_term_months AND
    NEW.pet_friendly        IS NOT DISTINCT FROM OLD.pet_friendly AND
    NEW.furnished           IS NOT DISTINCT FROM OLD.furnished AND
    NEW.utilities_included  IS NOT DISTINCT FROM OLD.utilities_included AND
    NEW.parking             IS NOT DISTINCT FROM OLD.parking AND
    NEW.laundry             IS NOT DISTINCT FROM OLD.laundry AND
    NEW.description         IS NOT DISTINCT FROM OLD.description AND
    NEW.amenities           IS NOT DISTINCT FROM OLD.amenities AND
    NEW.images              IS NOT DISTINCT FROM OLD.images AND
    NEW.source_url          IS NOT DISTINCT FROM OLD.source_url AND
    NEW.source              IS NOT DISTINCT FROM OLD.source AND
    NEW.campus_id           IS NOT DISTINCT FROM OLD.campus_id AND
    NEW.landlord_name       IS NOT DISTINCT FROM OLD.landlord_name AND
    NEW.landlord_email      IS NOT DISTINCT FROM OLD.landlord_email AND
    NEW.landlord_phone      IS NOT DISTINCT FROM OLD.landlord_phone AND
    NEW.is_active           IS NOT DISTINCT FROM OLD.is_active AND
    NEW.last_seen_at        IS NOT DISTINCT FROM OLD.last_seen_at
  ) THEN
    RETURN NEW;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
