-- Seed campus configs for UW-Madison and UT Austin
INSERT INTO campus_configs (slug, name, university_name, edu_domains, location, timezone, config, is_public)
VALUES
  (
    'uw-madison',
    'Madison',
    'University of Wisconsin-Madison',
    ARRAY['wisc.edu'],
    ST_Point(-89.4012, 43.0766)::geography,
    'America/Chicago',
    '{
      "avgUtilities": 150,
      "avgParking": 75,
      "commuteHubs": [
        {"name": "Bascom Hall", "latitude": 43.0753, "longitude": -89.4034},
        {"name": "Engineering Hall", "latitude": 43.0712, "longitude": -89.4118}
      ]
    }'::jsonb,
    true
  ),
  (
    'ut-austin',
    'Austin',
    'University of Texas at Austin',
    ARRAY['utexas.edu'],
    ST_Point(-97.7341, 30.2849)::geography,
    'America/Chicago',
    '{
      "avgUtilities": 130,
      "avgParking": 100,
      "commuteHubs": [
        {"name": "UT Tower", "latitude": 30.2862, "longitude": -97.7394},
        {"name": "Engineering Center", "latitude": 30.2880, "longitude": -97.7355}
      ]
    }'::jsonb,
    true
  );
