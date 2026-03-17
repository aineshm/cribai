-- Campus landmarks table for geographic proximity search
-- Stores key buildings/locations per campus with coordinates for PostGIS distance filtering

CREATE TABLE campus_landmarks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id  uuid REFERENCES campus_configs(id) NOT NULL,
  name       text NOT NULL,
  aliases    text[] NOT NULL DEFAULT '{}',
  latitude   double precision NOT NULL,
  longitude  double precision NOT NULL,
  location   geography(POINT, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ) STORED,
  category   text NOT NULL DEFAULT 'academic'
    CHECK (category IN ('academic', 'library', 'recreation', 'dining', 'residence_hall', 'landmark', 'sports', 'medical')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(campus_id, name)
);

-- Spatial index for proximity queries
CREATE INDEX idx_campus_landmarks_location ON campus_landmarks USING GIST (location);

-- Index for campus-scoped lookups
CREATE INDEX idx_campus_landmarks_campus ON campus_landmarks (campus_id);

-- ============================================================
-- Seed UW-Madison landmarks (~30 key buildings)
-- Coordinates sourced from official campus maps
-- ============================================================

-- Get the UW-Madison campus_id dynamically
DO $$
DECLARE
  uw_campus_id uuid;
BEGIN
  SELECT id INTO uw_campus_id FROM campus_configs WHERE slug = 'uw-madison';

  IF uw_campus_id IS NULL THEN
    RAISE NOTICE 'UW-Madison campus not found, skipping landmark seed';
    RETURN;
  END IF;

  INSERT INTO campus_landmarks (campus_id, name, aliases, latitude, longitude, category) VALUES
    -- Academic buildings
    (uw_campus_id, 'Engineering Hall', ARRAY['EH', 'College of Engineering', 'engineering'], 43.0715, -89.4115, 'academic'),
    (uw_campus_id, 'Bascom Hall', ARRAY['Bascom', 'bascom hill'], 43.0753, -89.4050, 'academic'),
    (uw_campus_id, 'Van Vleck Hall', ARRAY['Van Vleck', 'Math Department'], 43.0743, -89.4060, 'academic'),
    (uw_campus_id, 'Science Hall', ARRAY['Science'], 43.0764, -89.4035, 'academic'),
    (uw_campus_id, 'Humanities Building', ARRAY['Humanities', 'HUM'], 43.0746, -89.4030, 'academic'),
    (uw_campus_id, 'Computer Sciences', ARRAY['CS Building', 'CS', 'Computer Science', 'computer sciences building'], 43.0716, -89.4089, 'academic'),
    (uw_campus_id, 'Grainger Hall', ARRAY['Grainger', 'Business School', 'School of Business', 'Wisconsin School of Business'], 43.0729, -89.3986, 'academic'),
    (uw_campus_id, 'Educational Sciences', ARRAY['Ed Sci', 'Education Building'], 43.0751, -89.4078, 'academic'),
    (uw_campus_id, 'Chemistry Building', ARRAY['Chemistry', 'Chem'], 43.0723, -89.4102, 'academic'),
    (uw_campus_id, 'Biochemistry Building', ARRAY['Biochem'], 43.0739, -89.4128, 'academic'),
    (uw_campus_id, 'Law School', ARRAY['Law Building', 'UW Law'], 43.0757, -89.3989, 'academic'),
    (uw_campus_id, 'Mechanical Engineering', ARRAY['ME Building', 'Mech E'], 43.0710, -89.4105, 'academic'),
    (uw_campus_id, 'Wendt Commons', ARRAY['Wendt', 'Engineering Library'], 43.0712, -89.4098, 'academic'),

    -- Libraries
    (uw_campus_id, 'Memorial Library', ARRAY['Mem Lib', 'Memorial Lib'], 43.0748, -89.3983, 'library'),
    (uw_campus_id, 'College Library', ARRAY['College Lib', 'Helen C. White Hall'], 43.0770, -89.3993, 'library'),
    (uw_campus_id, 'Steenbock Library', ARRAY['Steenbock'], 43.0734, -89.4130, 'library'),

    -- Recreation / Student Life
    (uw_campus_id, 'Memorial Union', ARRAY['The Union', 'Terrace', 'Union Terrace', 'Memorial Union Terrace'], 43.0766, -89.3999, 'recreation'),
    (uw_campus_id, 'Union South', ARRAY['South Union'], 43.0714, -89.4079, 'recreation'),
    (uw_campus_id, 'Nicholas Recreation Center', ARRAY['Nick', 'The Nick', 'SERF'], 43.0697, -89.4080, 'recreation'),
    (uw_campus_id, 'Bakke Recreation Center', ARRAY['Bakke', 'Bakke Center'], 43.0780, -89.4225, 'recreation'),

    -- Dining / Landmarks
    (uw_campus_id, 'State Street', ARRAY['State St'], 43.0745, -89.3965, 'landmark'),
    (uw_campus_id, 'Capitol Square', ARRAY['The Capitol', 'Wisconsin State Capitol', 'Capitol'], 43.0747, -89.3844, 'landmark'),
    (uw_campus_id, 'Library Mall', ARRAY['Lib Mall'], 43.0758, -89.3998, 'landmark'),

    -- Sports
    (uw_campus_id, 'Camp Randall Stadium', ARRAY['Camp Randall', 'The Camp'], 43.0700, -89.4128, 'sports'),
    (uw_campus_id, 'Kohl Center', ARRAY['Kohl', 'The Kohl'], 43.0698, -89.4095, 'sports'),
    (uw_campus_id, 'Field House', ARRAY['Natatorium', 'UW Field House'], 43.0697, -89.4116, 'sports'),

    -- Residence Halls
    (uw_campus_id, 'Sellery Hall', ARRAY['Sellery'], 43.0713, -89.3981, 'residence_hall'),
    (uw_campus_id, 'Witte Hall', ARRAY['Witte'], 43.0709, -89.3989, 'residence_hall'),
    (uw_campus_id, 'Chadbourne Hall', ARRAY['Chad', 'Chadbourne'], 43.0761, -89.4028, 'residence_hall'),
    (uw_campus_id, 'Lakeshore Residence Halls', ARRAY['Lakeshore', 'Lakeshore dorms'], 43.0780, -89.4160, 'residence_hall'),

    -- Medical
    (uw_campus_id, 'UW Hospital', ARRAY['University Hospital', 'UW Health', 'UWHC'], 43.0777, -89.4288, 'medical')

  ON CONFLICT (campus_id, name) DO NOTHING;
END;
$$;
