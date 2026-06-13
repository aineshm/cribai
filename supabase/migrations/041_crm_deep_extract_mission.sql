-- 041: allow the crm_deep_extract mission type (AIN-71).
-- Deep extraction for low-confidence CRM saves: crawl source site,
-- Places lookup, LLM synthesis, update crm_listings row, re-analyze.

ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_type_check;
ALTER TABLE missions ADD CONSTRAINT missions_type_check CHECK (type IN (
  'tour_booking', 'lease_review', 'landlord_outreach',
  'price_negotiation', 'listing_comparison',
  'housing_search', 'tour_outreach',
  'listing_deep_dive', 'sublease_post',
  'crm_deep_extract'
));
