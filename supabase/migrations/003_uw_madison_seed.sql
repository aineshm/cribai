-- Seed UW-Madison as the primary campus
INSERT INTO campus_configs (
  slug,
  name,
  university_name,
  edu_domains,
  latitude,
  longitude,
  timezone,
  scrape_cron,
  scrape_radius_km,
  config,
  is_public
) VALUES (
  'uw-madison',
  'UW-Madison',
  'University of Wisconsin-Madison',
  ARRAY['wisc.edu'],
  43.0766,
  -89.4125,
  'America/Chicago',
  '0 3 * * *',
  8,
  '{}',
  true
) ON CONFLICT (slug) DO NOTHING;
