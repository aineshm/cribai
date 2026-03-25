-- Add generic "Campus" landmark for "near campus" proximity queries.
-- The landmark resolver needs a DB entry for campus-scoped searches
-- that don't match a specific building name.

DO $$
DECLARE
  uw_campus_id uuid;
BEGIN
  SELECT id INTO uw_campus_id FROM campus_configs WHERE slug = 'uw-madison';

  IF uw_campus_id IS NULL THEN
    RAISE NOTICE 'UW-Madison campus not found, skipping campus center landmark';
    RETURN;
  END IF;

  INSERT INTO campus_landmarks (campus_id, name, aliases, latitude, longitude, category)
  VALUES (
    uw_campus_id,
    'UW-Madison Campus Center',
    ARRAY['campus', 'main campus', 'uw campus', 'uw-madison campus', 'the campus'],
    43.0731,
    -89.4012,
    'landmark'
  )
  ON CONFLICT (campus_id, name) DO NOTHING;
END;
$$;
