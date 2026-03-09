-- =============================================================================
-- CampusNest Dev Seed Data
-- =============================================================================
-- Run against a Supabase project with all migrations (001-010) applied.
--
-- Usage:
--   psql $DATABASE_URL < scripts/seed-dev-data.sql
--
-- Or via Supabase Dashboard > SQL Editor.
--
-- IMPORTANT: This script uses the service_role (bypasses RLS).
-- The mock user UUIDs are deterministic and match apps/web/lib/dev-auth.ts.
-- =============================================================================

BEGIN;

-- ============================================================
-- 0. Ensure UW-Madison campus exists and capture its ID
-- ============================================================
INSERT INTO campus_configs (
  slug, name, university_name, edu_domains, timezone, scrape_cron, scrape_radius_km, config, is_public
) VALUES (
  'uw-madison',
  'UW-Madison',
  'University of Wisconsin-Madison',
  ARRAY['wisc.edu'],
  'America/Chicago',
  '0 3 * * *',
  8,
  '{}',
  true
) ON CONFLICT (slug) DO NOTHING;

-- Grab the campus ID for all subsequent inserts
DO $$
DECLARE
  v_campus_id uuid;
BEGIN
  SELECT id INTO v_campus_id FROM campus_configs WHERE slug = 'uw-madison';

  -- ============================================================
  -- 1. Mock Users (auth.users + profiles)
  -- ============================================================
  -- We insert directly into auth.users so profile trigger fires.
  -- The UUIDs match DEV_USERS in apps/web/lib/dev-auth.ts.

  -- User 1: Emma Chen (undergrad, free, verified)
  INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
  VALUES (
    'a0000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'emma.chen@wisc.edu',
    crypt('devpassword123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Emma Chen"}'::jsonb,
    'authenticated', 'authenticated', now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  UPDATE profiles SET
    campus_id = v_campus_id, display_name = 'Emma Chen', edu_email = 'emma.chen@wisc.edu',
    is_edu_verified = true, verification_status = 'verified', subscription_tier = 'free',
    graduation_year = 2027, major = 'Computer Science',
    profile_completed_at = now()
  WHERE id = 'a0000000-0000-4000-8000-000000000001';

  -- User 2: Raj Patel (grad, pro, verified)
  INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
  VALUES (
    'a0000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'raj.patel@wisc.edu',
    crypt('devpassword123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Raj Patel"}'::jsonb,
    'authenticated', 'authenticated', now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  UPDATE profiles SET
    campus_id = v_campus_id, display_name = 'Raj Patel', edu_email = 'raj.patel@wisc.edu',
    is_edu_verified = true, verification_status = 'verified', subscription_tier = 'pro',
    graduation_year = 2026, major = 'Biomedical Engineering',
    profile_completed_at = now()
  WHERE id = 'a0000000-0000-4000-8000-000000000002';

  -- User 3: Maria Garcia (international, premium, verified)
  INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
  VALUES (
    'a0000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'maria.garcia@wisc.edu',
    crypt('devpassword123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Maria Garcia"}'::jsonb,
    'authenticated', 'authenticated', now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  UPDATE profiles SET
    campus_id = v_campus_id, display_name = 'Maria Garcia', edu_email = 'maria.garcia@wisc.edu',
    is_edu_verified = true, verification_status = 'verified', subscription_tier = 'premium',
    graduation_year = 2028, major = 'Economics',
    profile_completed_at = now()
  WHERE id = 'a0000000-0000-4000-8000-000000000003';

  -- User 4: New Student (unverified)
  INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
  VALUES (
    'a0000000-0000-4000-8000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'unverified@wisc.edu',
    crypt('devpassword123', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"New Student"}'::jsonb,
    'authenticated', 'authenticated', now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  UPDATE profiles SET
    campus_id = v_campus_id, display_name = 'New Student', edu_email = 'unverified@wisc.edu',
    is_edu_verified = false, verification_status = 'unverified', subscription_tier = 'free'
  WHERE id = 'a0000000-0000-4000-8000-000000000004';

  -- Users 5-20: Additional mock users
  INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at)
  VALUES
    ('a0000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'jake.wilson@wisc.edu', crypt('devpassword123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Jake Wilson"}'::jsonb, 'authenticated', 'authenticated', now() - interval '30 days', now()),
    ('a0000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'priya.sharma@wisc.edu', crypt('devpassword123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Priya Sharma"}'::jsonb, 'authenticated', 'authenticated', now() - interval '25 days', now()),
    ('a0000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'tyler.johnson@wisc.edu', crypt('devpassword123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Tyler Johnson"}'::jsonb, 'authenticated', 'authenticated', now() - interval '20 days', now()),
    ('a0000000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'yuki.tanaka@wisc.edu', crypt('devpassword123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Yuki Tanaka"}'::jsonb, 'authenticated', 'authenticated', now() - interval '15 days', now()),
    ('a0000000-0000-4000-8000-000000000009', '00000000-0000-0000-0000-000000000000', 'carlos.mendez@wisc.edu', crypt('devpassword123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Carlos Mendez"}'::jsonb, 'authenticated', 'authenticated', now() - interval '12 days', now()),
    ('a0000000-0000-4000-8000-000000000010', '00000000-0000-0000-0000-000000000000', 'anna.kowalski@wisc.edu', crypt('devpassword123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Anna Kowalski"}'::jsonb, 'authenticated', 'authenticated', now() - interval '10 days', now()),
    ('a0000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'devon.smith@wisc.edu', crypt('devpassword123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Devon Smith"}'::jsonb, 'authenticated', 'authenticated', now() - interval '9 days', now()),
    ('a0000000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'mei.lin@wisc.edu', crypt('devpassword123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Mei Lin"}'::jsonb, 'authenticated', 'authenticated', now() - interval '8 days', now()),
    ('a0000000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'alex.nguyen@wisc.edu', crypt('devpassword123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Alex Nguyen"}'::jsonb, 'authenticated', 'authenticated', now() - interval '7 days', now()),
    ('a0000000-0000-4000-8000-000000000014', '00000000-0000-0000-0000-000000000000', 'sarah.anderson@wisc.edu', crypt('devpassword123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Sarah Anderson"}'::jsonb, 'authenticated', 'authenticated', now() - interval '6 days', now()),
    ('a0000000-0000-4000-8000-000000000015', '00000000-0000-0000-0000-000000000000', 'omar.hassan@wisc.edu', crypt('devpassword123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Omar Hassan"}'::jsonb, 'authenticated', 'authenticated', now() - interval '5 days', now()),
    ('a0000000-0000-4000-8000-000000000016', '00000000-0000-0000-0000-000000000000', 'lily.park@wisc.edu', crypt('devpassword123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Lily Park"}'::jsonb, 'authenticated', 'authenticated', now() - interval '4 days', now()),
    ('a0000000-0000-4000-8000-000000000017', '00000000-0000-0000-0000-000000000000', 'marcus.brown@wisc.edu', crypt('devpassword123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Marcus Brown"}'::jsonb, 'authenticated', 'authenticated', now() - interval '3 days', now()),
    ('a0000000-0000-4000-8000-000000000018', '00000000-0000-0000-0000-000000000000', 'elena.petrov@wisc.edu', crypt('devpassword123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Elena Petrov"}'::jsonb, 'authenticated', 'authenticated', now() - interval '2 days', now()),
    ('a0000000-0000-4000-8000-000000000019', '00000000-0000-0000-0000-000000000000', 'ben.taylor@wisc.edu', crypt('devpassword123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Ben Taylor"}'::jsonb, 'authenticated', 'authenticated', now() - interval '1 day', now()),
    ('a0000000-0000-4000-8000-000000000020', '00000000-0000-0000-0000-000000000000', 'fatima.ali@wisc.edu', crypt('devpassword123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"display_name":"Fatima Ali"}'::jsonb, 'authenticated', 'authenticated', now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- Update profiles for users 5-20
  UPDATE profiles SET campus_id = v_campus_id, display_name = 'Jake Wilson', edu_email = 'jake.wilson@wisc.edu', is_edu_verified = true, verification_status = 'verified', graduation_year = 2026, major = 'Political Science', profile_completed_at = now() WHERE id = 'a0000000-0000-4000-8000-000000000005';
  UPDATE profiles SET campus_id = v_campus_id, display_name = 'Priya Sharma', edu_email = 'priya.sharma@wisc.edu', is_edu_verified = true, verification_status = 'verified', graduation_year = 2027, major = 'Data Science', profile_completed_at = now() WHERE id = 'a0000000-0000-4000-8000-000000000006';
  UPDATE profiles SET campus_id = v_campus_id, display_name = 'Tyler Johnson', edu_email = 'tyler.johnson@wisc.edu', is_edu_verified = true, verification_status = 'verified', graduation_year = 2028, major = 'Nursing', profile_completed_at = now() WHERE id = 'a0000000-0000-4000-8000-000000000007';
  UPDATE profiles SET campus_id = v_campus_id, display_name = 'Yuki Tanaka', edu_email = 'yuki.tanaka@wisc.edu', is_edu_verified = true, verification_status = 'verified', graduation_year = 2026, major = 'Chemistry', profile_completed_at = now() WHERE id = 'a0000000-0000-4000-8000-000000000008';
  UPDATE profiles SET campus_id = v_campus_id, display_name = 'Carlos Mendez', edu_email = 'carlos.mendez@wisc.edu', is_edu_verified = true, verification_status = 'verified', graduation_year = 2027, major = 'Civil Engineering', profile_completed_at = now() WHERE id = 'a0000000-0000-4000-8000-000000000009';
  UPDATE profiles SET campus_id = v_campus_id, display_name = 'Anna Kowalski', edu_email = 'anna.kowalski@wisc.edu', is_edu_verified = true, verification_status = 'verified', graduation_year = 2028, major = 'Psychology', profile_completed_at = now() WHERE id = 'a0000000-0000-4000-8000-000000000010';
  UPDATE profiles SET campus_id = v_campus_id, display_name = 'Devon Smith', edu_email = 'devon.smith@wisc.edu', is_edu_verified = true, verification_status = 'verified', graduation_year = 2026, major = 'Business', profile_completed_at = now() WHERE id = 'a0000000-0000-4000-8000-000000000011';
  UPDATE profiles SET campus_id = v_campus_id, display_name = 'Mei Lin', edu_email = 'mei.lin@wisc.edu', is_edu_verified = true, verification_status = 'verified', graduation_year = 2027, major = 'Architecture', profile_completed_at = now() WHERE id = 'a0000000-0000-4000-8000-000000000012';
  UPDATE profiles SET campus_id = v_campus_id, display_name = 'Alex Nguyen', edu_email = 'alex.nguyen@wisc.edu', is_edu_verified = true, verification_status = 'verified', graduation_year = 2026, major = 'Electrical Engineering', profile_completed_at = now() WHERE id = 'a0000000-0000-4000-8000-000000000013';
  UPDATE profiles SET campus_id = v_campus_id, display_name = 'Sarah Anderson', edu_email = 'sarah.anderson@wisc.edu', is_edu_verified = true, verification_status = 'verified', graduation_year = 2028, major = 'Biology', profile_completed_at = now() WHERE id = 'a0000000-0000-4000-8000-000000000014';
  UPDATE profiles SET campus_id = v_campus_id, display_name = 'Omar Hassan', edu_email = 'omar.hassan@wisc.edu', is_edu_verified = true, verification_status = 'verified', graduation_year = 2027, major = 'Mathematics', profile_completed_at = now() WHERE id = 'a0000000-0000-4000-8000-000000000015';
  UPDATE profiles SET campus_id = v_campus_id, display_name = 'Lily Park', edu_email = 'lily.park@wisc.edu', is_edu_verified = true, verification_status = 'verified', graduation_year = 2026, major = 'Art History', profile_completed_at = now() WHERE id = 'a0000000-0000-4000-8000-000000000016';
  UPDATE profiles SET campus_id = v_campus_id, display_name = 'Marcus Brown', edu_email = 'marcus.brown@wisc.edu', is_edu_verified = true, verification_status = 'verified', graduation_year = 2028, major = 'Journalism', profile_completed_at = now() WHERE id = 'a0000000-0000-4000-8000-000000000017';
  UPDATE profiles SET campus_id = v_campus_id, display_name = 'Elena Petrov', edu_email = 'elena.petrov@wisc.edu', is_edu_verified = true, verification_status = 'verified', graduation_year = 2027, major = 'Physics', profile_completed_at = now() WHERE id = 'a0000000-0000-4000-8000-000000000018';
  UPDATE profiles SET campus_id = v_campus_id, display_name = 'Ben Taylor', edu_email = 'ben.taylor@wisc.edu', is_edu_verified = false, verification_status = 'pending', graduation_year = 2028, major = 'Music', profile_completed_at = now() WHERE id = 'a0000000-0000-4000-8000-000000000019';
  UPDATE profiles SET campus_id = v_campus_id, display_name = 'Fatima Ali', edu_email = 'fatima.ali@wisc.edu', is_edu_verified = true, verification_status = 'verified', graduation_year = 2026, major = 'Public Health', profile_completed_at = now() WHERE id = 'a0000000-0000-4000-8000-000000000020';

  -- ============================================================
  -- 2. Landlords (15+)
  -- ============================================================
  INSERT INTO landlords (id, name, company, scorecard) VALUES
    ('b0000000-0000-4000-8000-000000000001', 'Steve's Properties LLC', 'Steve''s Properties', '{"responsiveness": 8, "maintenance": 7, "fairness": 9, "overall": 8.0}'::jsonb),
    ('b0000000-0000-4000-8000-000000000002', 'Madison Student Housing Co', 'MSH Co', '{"responsiveness": 6, "maintenance": 5, "fairness": 6, "overall": 5.7}'::jsonb),
    ('b0000000-0000-4000-8000-000000000003', 'Mullins Apartments', 'Mullins Group', '{"responsiveness": 9, "maintenance": 9, "fairness": 8, "overall": 8.7}'::jsonb),
    ('b0000000-0000-4000-8000-000000000004', 'Campus Area Housing', NULL, '{"responsiveness": 4, "maintenance": 3, "fairness": 5, "overall": 4.0}'::jsonb),
    ('b0000000-0000-4000-8000-000000000005', 'Lakeview Realty', 'Lakeview Realty Inc', '{"responsiveness": 7, "maintenance": 8, "fairness": 7, "overall": 7.3}'::jsonb),
    ('b0000000-0000-4000-8000-000000000006', 'Forward Management', 'Forward Mgmt LLC', '{"responsiveness": 8, "maintenance": 8, "fairness": 9, "overall": 8.3}'::jsonb),
    ('b0000000-0000-4000-8000-000000000007', 'Badger Rentals', NULL, '{"responsiveness": 5, "maintenance": 4, "fairness": 6, "overall": 5.0}'::jsonb),
    ('b0000000-0000-4000-8000-000000000008', 'University Heights Properties', 'UH Properties', '{"responsiveness": 9, "maintenance": 8, "fairness": 8, "overall": 8.3}'::jsonb),
    ('b0000000-0000-4000-8000-000000000009', 'Capitol Neighborhoods', 'Capitol LLC', '{"responsiveness": 7, "maintenance": 6, "fairness": 7, "overall": 6.7}'::jsonb),
    ('b0000000-0000-4000-8000-000000000010', 'Eagle Heights Management', 'Eagle Heights', '{"responsiveness": 8, "maintenance": 7, "fairness": 8, "overall": 7.7}'::jsonb),
    ('b0000000-0000-4000-8000-000000000011', 'Isthmus Living', 'Isthmus LLC', '{"responsiveness": 6, "maintenance": 7, "fairness": 7, "overall": 6.7}'::jsonb),
    ('b0000000-0000-4000-8000-000000000012', 'State Street Apartments', NULL, '{"responsiveness": 5, "maintenance": 5, "fairness": 4, "overall": 4.7}'::jsonb),
    ('b0000000-0000-4000-8000-000000000013', 'Willy Street Housing', 'Willy St LLC', '{"responsiveness": 9, "maintenance": 9, "fairness": 9, "overall": 9.0}'::jsonb),
    ('b0000000-0000-4000-8000-000000000014', 'Park Street Realty', 'Park St Realty', '{"responsiveness": 6, "maintenance": 5, "fairness": 6, "overall": 5.7}'::jsonb),
    ('b0000000-0000-4000-8000-000000000015', 'Tenney Park Rentals', NULL, '{"responsiveness": 7, "maintenance": 7, "fairness": 8, "overall": 7.3}'::jsonb),
    ('b0000000-0000-4000-8000-000000000016', 'Monroe Street Properties', 'Monroe Props', '{"responsiveness": 8, "maintenance": 8, "fairness": 7, "overall": 7.7}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 3. Listings (50+) — realistic Madison, WI addresses
  -- ============================================================
  INSERT INTO listings (id, campus_id, external_id, source, raw_data, address, rent_monthly, bedrooms, bathrooms, sqft, amenities, available_date, fairness_score, is_active) VALUES
    -- State Street area
    ('c0000000-0000-4000-8000-000000000001', v_campus_id, 'dev-001', 'apartments_com', '{}'::jsonb, '401 State St, Madison, WI 53703', 1200, 1, 1, 550, '["in_unit_laundry","dishwasher","air_conditioning"]'::jsonb, '2026-08-15', 7.2, true),
    ('c0000000-0000-4000-8000-000000000002', v_campus_id, 'dev-002', 'apartments_com', '{}'::jsonb, '501 State St, Madison, WI 53703', 1650, 2, 1, 850, '["in_unit_laundry","dishwasher","gym","parking"]'::jsonb, '2026-08-15', 6.8, true),
    ('c0000000-0000-4000-8000-000000000003', v_campus_id, 'dev-003', 'apartments_com', '{}'::jsonb, '333 State St, Madison, WI 53703', 950, 1, 1, 420, '["dishwasher"]'::jsonb, '2026-06-01', 8.1, true),
    ('c0000000-0000-4000-8000-000000000004', v_campus_id, 'dev-004', 'apartments_com', '{}'::jsonb, '222 State St Apt 3, Madison, WI 53703', 1800, 3, 2, 1200, '["in_unit_laundry","dishwasher","air_conditioning","balcony","parking"]'::jsonb, '2026-08-15', 6.5, true),
    ('c0000000-0000-4000-8000-000000000005', v_campus_id, 'dev-005', 'apartments_com', '{}'::jsonb, '610 State St Unit B, Madison, WI 53703', 750, 1, 1, 380, '["shared_laundry"]'::jsonb, '2026-05-15', 9.0, true),

    -- Langdon Street area
    ('c0000000-0000-4000-8000-000000000006', v_campus_id, 'dev-006', 'apartments_com', '{}'::jsonb, '120 Langdon St, Madison, WI 53703', 1400, 2, 1, 780, '["in_unit_laundry","dishwasher","air_conditioning"]'::jsonb, '2026-08-15', 7.0, true),
    ('c0000000-0000-4000-8000-000000000007', v_campus_id, 'dev-007', 'apartments_com', '{}'::jsonb, '240 Langdon St, Madison, WI 53703', 1100, 1, 1, 520, '["dishwasher","air_conditioning","gym"]'::jsonb, '2026-08-15', 7.5, true),
    ('c0000000-0000-4000-8000-000000000008', v_campus_id, 'dev-008', 'apartments_com', '{}'::jsonb, '315 Langdon St, Madison, WI 53703', 2200, 4, 2, 1600, '["in_unit_laundry","dishwasher","air_conditioning","balcony","parking","gym"]'::jsonb, '2026-08-15', 5.8, true),
    ('c0000000-0000-4000-8000-000000000009', v_campus_id, 'dev-009', 'apartments_com', '{}'::jsonb, '150 Langdon St Apt 2A, Madison, WI 53703', 850, 1, 1, 400, '["shared_laundry","air_conditioning"]'::jsonb, '2026-06-01', 8.5, true),

    -- University Ave area
    ('c0000000-0000-4000-8000-000000000010', v_campus_id, 'dev-010', 'apartments_com', '{}'::jsonb, '1402 University Ave, Madison, WI 53715', 1050, 1, 1, 500, '["in_unit_laundry","dishwasher"]'::jsonb, '2026-08-15', 7.8, true),
    ('c0000000-0000-4000-8000-000000000011', v_campus_id, 'dev-011', 'apartments_com', '{}'::jsonb, '1510 University Ave, Madison, WI 53726', 1350, 2, 1, 750, '["in_unit_laundry","dishwasher","parking"]'::jsonb, '2026-08-15', 7.2, true),
    ('c0000000-0000-4000-8000-000000000012', v_campus_id, 'dev-012', 'apartments_com', '{}'::jsonb, '1620 University Ave, Madison, WI 53726', 600, 1, 1, 350, '["shared_laundry"]'::jsonb, '2026-06-01', 9.2, true),

    -- W Johnson / W Gorham area
    ('c0000000-0000-4000-8000-000000000013', v_campus_id, 'dev-013', 'apartments_com', '{}'::jsonb, '515 W Johnson St, Madison, WI 53703', 1150, 1, 1, 530, '["in_unit_laundry","dishwasher","air_conditioning"]'::jsonb, '2026-08-15', 7.4, true),
    ('c0000000-0000-4000-8000-000000000014', v_campus_id, 'dev-014', 'apartments_com', '{}'::jsonb, '420 W Gorham St, Madison, WI 53703', 1500, 2, 1, 800, '["in_unit_laundry","dishwasher","air_conditioning","gym"]'::jsonb, '2026-08-15', 6.9, true),
    ('c0000000-0000-4000-8000-000000000015', v_campus_id, 'dev-015', 'apartments_com', '{}'::jsonb, '302 W Johnson St, Madison, WI 53703', 700, 1, 1, 360, '["shared_laundry"]'::jsonb, '2026-05-15', 8.8, true),
    ('c0000000-0000-4000-8000-000000000016', v_campus_id, 'dev-016', 'apartments_com', '{}'::jsonb, '630 W Gorham St, Madison, WI 53703', 1750, 3, 2, 1100, '["in_unit_laundry","dishwasher","air_conditioning","balcony"]'::jsonb, '2026-08-15', 6.4, true),

    -- Eagle Heights area
    ('c0000000-0000-4000-8000-000000000017', v_campus_id, 'dev-017', 'apartments_com', '{}'::jsonb, '3401 Eagle Heights Dr, Madison, WI 53705', 800, 1, 1, 550, '["parking","laundry_room"]'::jsonb, '2026-08-15', 8.5, true),
    ('c0000000-0000-4000-8000-000000000018', v_campus_id, 'dev-018', 'apartments_com', '{}'::jsonb, '3501 Eagle Heights Dr, Madison, WI 53705', 1000, 2, 1, 750, '["parking","laundry_room","playground"]'::jsonb, '2026-08-15', 8.0, true),
    ('c0000000-0000-4000-8000-000000000019', v_campus_id, 'dev-019', 'apartments_com', '{}'::jsonb, '3601 Eagle Heights Dr, Madison, WI 53705', 1200, 3, 1, 950, '["parking","laundry_room","playground"]'::jsonb, '2026-08-15', 7.8, true),

    -- Regent St / Monroe St area
    ('c0000000-0000-4000-8000-000000000020', v_campus_id, 'dev-020', 'apartments_com', '{}'::jsonb, '702 Regent St, Madison, WI 53715', 1100, 1, 1, 480, '["in_unit_laundry","air_conditioning"]'::jsonb, '2026-08-15', 7.6, true),
    ('c0000000-0000-4000-8000-000000000021', v_campus_id, 'dev-021', 'apartments_com', '{}'::jsonb, '1820 Monroe St, Madison, WI 53711', 1450, 2, 1, 800, '["in_unit_laundry","dishwasher","parking"]'::jsonb, '2026-08-15', 7.0, true),
    ('c0000000-0000-4000-8000-000000000022', v_campus_id, 'dev-022', 'apartments_com', '{}'::jsonb, '925 Regent St, Madison, WI 53715', 650, 1, 1, 320, '["shared_laundry"]'::jsonb, '2026-06-01', 9.1, true),

    -- Park Street area
    ('c0000000-0000-4000-8000-000000000023', v_campus_id, 'dev-023', 'apartments_com', '{}'::jsonb, '530 S Park St, Madison, WI 53715', 900, 1, 1, 450, '["in_unit_laundry","parking"]'::jsonb, '2026-08-15', 8.0, true),
    ('c0000000-0000-4000-8000-000000000024', v_campus_id, 'dev-024', 'apartments_com', '{}'::jsonb, '402 S Park St, Madison, WI 53715', 1300, 2, 1, 750, '["in_unit_laundry","dishwasher","air_conditioning"]'::jsonb, '2026-08-15', 7.1, true),

    -- Willy Street / East side
    ('c0000000-0000-4000-8000-000000000025', v_campus_id, 'dev-025', 'apartments_com', '{}'::jsonb, '1150 Williamson St, Madison, WI 53703', 1050, 1, 1, 500, '["in_unit_laundry","dishwasher"]'::jsonb, '2026-08-15', 7.9, true),
    ('c0000000-0000-4000-8000-000000000026', v_campus_id, 'dev-026', 'apartments_com', '{}'::jsonb, '820 Williamson St, Madison, WI 53703', 1400, 2, 1, 800, '["in_unit_laundry","dishwasher","air_conditioning","balcony"]'::jsonb, '2026-08-15', 7.3, true),
    ('c0000000-0000-4000-8000-000000000027', v_campus_id, 'dev-027', 'apartments_com', '{}'::jsonb, '1250 Jenifer St, Madison, WI 53703', 850, 1, 1, 420, '["shared_laundry","parking"]'::jsonb, '2026-06-01', 8.4, true),

    -- W Dayton / W Mifflin area
    ('c0000000-0000-4000-8000-000000000028', v_campus_id, 'dev-028', 'apartments_com', '{}'::jsonb, '210 W Dayton St, Madison, WI 53703', 1250, 2, 1, 700, '["in_unit_laundry","dishwasher","air_conditioning"]'::jsonb, '2026-08-15', 7.0, true),
    ('c0000000-0000-4000-8000-000000000029', v_campus_id, 'dev-029', 'apartments_com', '{}'::jsonb, '425 W Mifflin St, Madison, WI 53703', 950, 1, 1, 450, '["dishwasher","air_conditioning"]'::jsonb, '2026-08-15', 7.8, true),
    ('c0000000-0000-4000-8000-000000000030', v_campus_id, 'dev-030', 'apartments_com', '{}'::jsonb, '320 W Mifflin St, Madison, WI 53703', 1600, 3, 1, 1000, '["in_unit_laundry","dishwasher","air_conditioning","parking"]'::jsonb, '2026-08-15', 6.6, true),

    -- N Frances / N Carroll
    ('c0000000-0000-4000-8000-000000000031', v_campus_id, 'dev-031', 'apartments_com', '{}'::jsonb, '125 N Frances St, Madison, WI 53703', 1550, 2, 2, 900, '["in_unit_laundry","dishwasher","air_conditioning","gym","rooftop"]'::jsonb, '2026-08-15', 6.2, true),
    ('c0000000-0000-4000-8000-000000000032', v_campus_id, 'dev-032', 'apartments_com', '{}'::jsonb, '210 N Carroll St, Madison, WI 53703', 1700, 2, 2, 950, '["in_unit_laundry","dishwasher","air_conditioning","gym","doorman"]'::jsonb, '2026-08-15', 5.9, true),

    -- Randall / Breeze Terrace
    ('c0000000-0000-4000-8000-000000000033', v_campus_id, 'dev-033', 'apartments_com', '{}'::jsonb, '1801 Randall Ave, Madison, WI 53726', 1100, 2, 1, 650, '["parking","shared_laundry"]'::jsonb, '2026-08-15', 7.8, true),
    ('c0000000-0000-4000-8000-000000000034', v_campus_id, 'dev-034', 'apartments_com', '{}'::jsonb, '430 Breeze Terrace, Madison, WI 53726', 750, 1, 1, 380, '["shared_laundry","parking"]'::jsonb, '2026-06-01', 8.7, true),

    -- Spring St / Mills St
    ('c0000000-0000-4000-8000-000000000035', v_campus_id, 'dev-035', 'apartments_com', '{}'::jsonb, '220 Spring St, Madison, WI 53715', 1350, 2, 1, 780, '["in_unit_laundry","dishwasher","air_conditioning"]'::jsonb, '2026-08-15', 7.1, true),
    ('c0000000-0000-4000-8000-000000000036', v_campus_id, 'dev-036', 'apartments_com', '{}'::jsonb, '502 Mills St, Madison, WI 53715', 900, 1, 1, 440, '["in_unit_laundry"]'::jsonb, '2026-08-15', 8.0, true),

    -- Luxury / high-end listings
    ('c0000000-0000-4000-8000-000000000037', v_campus_id, 'dev-037', 'apartments_com', '{}'::jsonb, '100 Wisconsin Ave, Madison, WI 53703', 2500, 2, 2, 1100, '["in_unit_laundry","dishwasher","air_conditioning","gym","rooftop","doorman","parking"]'::jsonb, '2026-08-15', 4.5, true),
    ('c0000000-0000-4000-8000-000000000038', v_campus_id, 'dev-038', 'apartments_com', '{}'::jsonb, '660 State St Penthouse, Madison, WI 53703', 3200, 3, 2, 1500, '["in_unit_laundry","dishwasher","air_conditioning","gym","rooftop","parking","balcony"]'::jsonb, '2026-08-15', 3.8, true),

    -- Budget-friendly
    ('c0000000-0000-4000-8000-000000000039', v_campus_id, 'dev-039', 'apartments_com', '{}'::jsonb, '1414 E Washington Ave, Madison, WI 53703', 625, 1, 1, 300, '["shared_laundry"]'::jsonb, '2026-05-15', 9.5, true),
    ('c0000000-0000-4000-8000-000000000040', v_campus_id, 'dev-040', 'apartments_com', '{}'::jsonb, '2010 Atwood Ave, Madison, WI 53704', 675, 1, 1, 340, '["shared_laundry","parking"]'::jsonb, '2026-06-01', 9.3, true),

    -- Additional mid-range
    ('c0000000-0000-4000-8000-000000000041', v_campus_id, 'dev-041', 'apartments_com', '{}'::jsonb, '1720 Vilas Ave, Madison, WI 53711', 1150, 2, 1, 700, '["in_unit_laundry","parking"]'::jsonb, '2026-08-15', 7.5, true),
    ('c0000000-0000-4000-8000-000000000042', v_campus_id, 'dev-042', 'apartments_com', '{}'::jsonb, '305 N Broom St, Madison, WI 53703', 1050, 1, 1, 480, '["dishwasher","air_conditioning"]'::jsonb, '2026-08-15', 7.6, true),
    ('c0000000-0000-4000-8000-000000000043', v_campus_id, 'dev-043', 'apartments_com', '{}'::jsonb, '515 N Lake St, Madison, WI 53703', 1300, 2, 1, 720, '["in_unit_laundry","dishwasher","air_conditioning"]'::jsonb, '2026-08-15', 7.0, true),
    ('c0000000-0000-4000-8000-000000000044', v_campus_id, 'dev-044', 'apartments_com', '{}'::jsonb, '130 E Gilman St, Madison, WI 53703', 1500, 2, 1, 820, '["in_unit_laundry","dishwasher","air_conditioning","gym"]'::jsonb, '2026-08-15', 6.8, true),
    ('c0000000-0000-4000-8000-000000000045', v_campus_id, 'dev-045', 'apartments_com', '{}'::jsonb, '25 N Bassett St, Madison, WI 53703', 1150, 1, 1, 520, '["in_unit_laundry","dishwasher"]'::jsonb, '2026-08-15', 7.5, true),

    -- Houses / larger units
    ('c0000000-0000-4000-8000-000000000046', v_campus_id, 'dev-046', 'apartments_com', '{}'::jsonb, '1415 Adams St, Madison, WI 53711', 2400, 5, 2, 2000, '["in_unit_laundry","dishwasher","parking","yard"]'::jsonb, '2026-08-15', 6.0, true),
    ('c0000000-0000-4000-8000-000000000047', v_campus_id, 'dev-047', 'apartments_com', '{}'::jsonb, '330 N Murray St, Madison, WI 53715', 2000, 4, 2, 1600, '["in_unit_laundry","dishwasher","parking","yard"]'::jsonb, '2026-08-15', 6.5, true),
    ('c0000000-0000-4000-8000-000000000048', v_campus_id, 'dev-048', 'apartments_com', '{}'::jsonb, '815 Clymer Pl, Madison, WI 53715', 1800, 4, 1, 1400, '["shared_laundry","parking","yard"]'::jsonb, '2026-08-15', 7.0, true),

    -- Studio / efficiency
    ('c0000000-0000-4000-8000-000000000049', v_campus_id, 'dev-049', 'apartments_com', '{}'::jsonb, '111 N Hamilton St, Madison, WI 53703', 1050, 1, 1, 400, '["in_unit_laundry","dishwasher","air_conditioning"]'::jsonb, '2026-08-15', 7.3, true),
    ('c0000000-0000-4000-8000-000000000050', v_campus_id, 'dev-050', 'apartments_com', '{}'::jsonb, '432 W Gilman St, Madison, WI 53703', 780, 1, 1, 350, '["shared_laundry"]'::jsonb, '2026-06-01', 8.6, true),

    -- Extra listings for variety
    ('c0000000-0000-4000-8000-000000000051', v_campus_id, 'dev-051', 'apartments_com', '{}'::jsonb, '525 W Wilson St, Madison, WI 53703', 1250, 2, 1, 700, '["in_unit_laundry","dishwasher","air_conditioning","parking"]'::jsonb, '2026-08-15', 7.2, true),
    ('c0000000-0000-4000-8000-000000000052', v_campus_id, 'dev-052', 'apartments_com', '{}'::jsonb, '1440 Monroe St, Madison, WI 53711', 1100, 1, 1, 500, '["in_unit_laundry","parking"]'::jsonb, '2026-08-15', 7.8, true),
    ('c0000000-0000-4000-8000-000000000053', v_campus_id, 'dev-053', 'apartments_com', '{}'::jsonb, '2100 Winnebago St, Madison, WI 53704', 850, 1, 1, 420, '["shared_laundry","parking"]'::jsonb, '2026-06-01', 8.3, true),
    ('c0000000-0000-4000-8000-000000000054', v_campus_id, 'dev-054', 'apartments_com', '{}'::jsonb, '733 Mound St, Madison, WI 53715', 950, 2, 1, 600, '["shared_laundry","parking","yard"]'::jsonb, '2026-08-15', 8.0, true),
    ('c0000000-0000-4000-8000-000000000055', v_campus_id, 'dev-055', 'apartments_com', '{}'::jsonb, '2215 Kendall Ave, Madison, WI 53726', 1500, 3, 1, 1000, '["in_unit_laundry","dishwasher","parking"]'::jsonb, '2026-08-15', 6.9, true)
  ON CONFLICT (external_id, source) DO NOTHING;

  -- ============================================================
  -- 4. Landlord Reviews (30+)
  -- ============================================================
  INSERT INTO landlord_reviews (id, landlord_id, user_id, listing_id, ratings, review_text, lease_verified, created_at) VALUES
    ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', '{"responsiveness": 8, "maintenance": 7, "overall": 7.5}'::jsonb, 'Steve was always responsive to maintenance requests. Fixed my heater within 24 hours in January.', true, now() - interval '90 days'),
    ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000002', '{"responsiveness": 9, "maintenance": 8, "overall": 8.5}'::jsonb, 'Great landlord, very fair lease terms. No surprise charges at move-out.', true, now() - interval '85 days'),
    ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000007', NULL, '{"responsiveness": 5, "maintenance": 4, "overall": 4.5}'::jsonb, 'Slow to fix things. Took 3 weeks to address a leak in the bathroom ceiling.', false, now() - interval '80 days'),
    ('d0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000008', NULL, '{"responsiveness": 6, "maintenance": 5, "overall": 5.5}'::jsonb, 'Okay overall but the building could use some updates. Appliances are aging.', false, now() - interval '75 days'),
    ('d0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000006', '{"responsiveness": 9, "maintenance": 9, "overall": 9.0}'::jsonb, 'Best landlord experience I have had in Madison. Everything is modern and well-maintained.', true, now() - interval '70 days'),
    ('d0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000010', 'c0000000-0000-4000-8000-000000000007', '{"responsiveness": 9, "maintenance": 8, "overall": 8.5}'::jsonb, 'Mullins is top tier. Quick maintenance, clear communication, fair deposit handling.', true, now() - interval '65 days'),
    ('d0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000011', NULL, '{"responsiveness": 3, "maintenance": 2, "overall": 2.5}'::jsonb, 'Terrible experience. Mold in the bathroom went unaddressed for months. Had to call the city.', false, now() - interval '60 days'),
    ('d0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000012', NULL, '{"responsiveness": 4, "maintenance": 3, "overall": 3.5}'::jsonb, 'Below average. Security deposit was unfairly withheld.', false, now() - interval '55 days'),
    ('d0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000013', 'c0000000-0000-4000-8000-000000000020', '{"responsiveness": 7, "maintenance": 8, "overall": 7.5}'::jsonb, 'Good location and well-maintained building. Parking is a bit tight though.', true, now() - interval '50 days'),
    ('d0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000014', 'c0000000-0000-4000-8000-000000000028', '{"responsiveness": 8, "maintenance": 8, "overall": 8.0}'::jsonb, 'Forward Management runs a tight ship. Very professional leasing process.', true, now() - interval '45 days'),
    ('d0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000015', 'c0000000-0000-4000-8000-000000000029', '{"responsiveness": 8, "maintenance": 9, "overall": 8.5}'::jsonb, 'Loved living here. The maintenance team is fast and friendly.', true, now() - interval '40 days'),
    ('d0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000016', NULL, '{"responsiveness": 5, "maintenance": 4, "overall": 4.5}'::jsonb, 'Average at best. Communication could be much better.', false, now() - interval '38 days'),
    ('d0000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000017', 'c0000000-0000-4000-8000-000000000010', '{"responsiveness": 9, "maintenance": 8, "overall": 8.5}'::jsonb, 'University Heights is a hidden gem. Quiet neighborhood, great for studying.', true, now() - interval '35 days'),
    ('d0000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000018', 'c0000000-0000-4000-8000-000000000011', '{"responsiveness": 8, "maintenance": 8, "overall": 8.0}'::jsonb, 'Solid landlord. Fair terms and honest about the condition of the unit.', true, now() - interval '30 days'),
    ('d0000000-0000-4000-8000-000000000015', 'b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000020', 'c0000000-0000-4000-8000-000000000031', '{"responsiveness": 7, "maintenance": 6, "overall": 6.5}'::jsonb, 'Decent management. The building is older but they keep it clean.', true, now() - interval '28 days'),
    ('d0000000-0000-4000-8000-000000000016', 'b0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000017', '{"responsiveness": 8, "maintenance": 7, "overall": 7.5}'::jsonb, 'Eagle Heights is perfect for grad students with families. Quiet and spacious.', true, now() - interval '25 days'),
    ('d0000000-0000-4000-8000-000000000017', 'b0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000018', '{"responsiveness": 8, "maintenance": 7, "overall": 7.5}'::jsonb, 'Great community feel. Management is responsive to concerns.', true, now() - interval '22 days'),
    ('d0000000-0000-4000-8000-000000000018', 'b0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000025', '{"responsiveness": 6, "maintenance": 7, "overall": 6.5}'::jsonb, 'Willy Street location is amazing for food and nightlife. Apartment itself is fine.', true, now() - interval '20 days'),
    ('d0000000-0000-4000-8000-000000000019', 'b0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000003', '{"responsiveness": 4, "maintenance": 5, "overall": 4.5}'::jsonb, 'Overpriced for what you get. State Street noise is brutal on weekends.', false, now() - interval '18 days'),
    ('d0000000-0000-4000-8000-000000000020', 'b0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000004', '{"responsiveness": 5, "maintenance": 5, "overall": 5.0}'::jsonb, 'Fine for the price, but do not expect quick maintenance turnaround.', false, now() - interval '15 days'),
    ('d0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000025', '{"responsiveness": 10, "maintenance": 9, "overall": 9.5}'::jsonb, 'The best landlord I have ever rented from. Treats tenants like family.', true, now() - interval '12 days'),
    ('d0000000-0000-4000-8000-000000000022', 'b0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000026', '{"responsiveness": 9, "maintenance": 9, "overall": 9.0}'::jsonb, 'Fantastic experience. Fixed a burst pipe within 2 hours on a Sunday.', true, now() - interval '10 days'),
    ('d0000000-0000-4000-8000-000000000023', 'b0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000023', '{"responsiveness": 6, "maintenance": 5, "overall": 5.5}'::jsonb, 'Park Street can be noisy. The apartment is okay but could use updates.', false, now() - interval '8 days'),
    ('d0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-000000000015', 'a0000000-0000-4000-8000-000000000010', NULL, '{"responsiveness": 7, "maintenance": 7, "overall": 7.0}'::jsonb, 'Good location near Tenney Park. Responsive to issues.', true, now() - interval '7 days'),
    ('d0000000-0000-4000-8000-000000000025', 'b0000000-0000-4000-8000-000000000015', 'a0000000-0000-4000-8000-000000000011', NULL, '{"responsiveness": 7, "maintenance": 7, "overall": 7.0}'::jsonb, 'Nice quiet neighborhood. The units are a bit dated but well maintained.', true, now() - interval '6 days'),
    ('d0000000-0000-4000-8000-000000000026', 'b0000000-0000-4000-8000-000000000016', 'a0000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000021', '{"responsiveness": 8, "maintenance": 8, "overall": 8.0}'::jsonb, 'Monroe Street is a wonderful neighborhood. Walking distance to everything.', true, now() - interval '5 days'),
    ('d0000000-0000-4000-8000-000000000027', 'b0000000-0000-4000-8000-000000000016', 'a0000000-0000-4000-8000-000000000013', 'c0000000-0000-4000-8000-000000000052', '{"responsiveness": 8, "maintenance": 7, "overall": 7.5}'::jsonb, 'Great local shops and restaurants nearby. Apartment was clean and modern.', true, now() - interval '4 days'),
    ('d0000000-0000-4000-8000-000000000028', 'b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000014', 'c0000000-0000-4000-8000-000000000022', '{"responsiveness": 7, "maintenance": 8, "overall": 7.5}'::jsonb, 'Affordable and clean. Lakeview does a good job for the price point.', true, now() - interval '3 days'),
    ('d0000000-0000-4000-8000-000000000029', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000015', 'c0000000-0000-4000-8000-000000000008', '{"responsiveness": 9, "maintenance": 9, "overall": 9.0}'::jsonb, 'Mullins is expensive but worth every penny. Premium living experience.', true, now() - interval '2 days'),
    ('d0000000-0000-4000-8000-000000000030', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000016', 'c0000000-0000-4000-8000-000000000005', '{"responsiveness": 8, "maintenance": 7, "overall": 7.5}'::jsonb, 'Budget-friendly and Steve is always available via text. No complaints.', true, now() - interval '1 day'),
    ('d0000000-0000-4000-8000-000000000031', 'b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000017', 'c0000000-0000-4000-8000-000000000032', '{"responsiveness": 7, "maintenance": 6, "overall": 6.5}'::jsonb, 'Downtown living is convenient but the building could use some updates.', true, now() - interval '12 hours'),
    ('d0000000-0000-4000-8000-000000000032', 'b0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000018', 'c0000000-0000-4000-8000-000000000027', '{"responsiveness": 6, "maintenance": 7, "overall": 6.5}'::jsonb, 'Jenifer Street is a great area. Apartment was cozy but a bit small.', true, now() - interval '6 hours')
  ON CONFLICT (landlord_id, user_id) DO NOTHING;

  -- ============================================================
  -- 5. Sublets & Roommate Posts (10+)
  -- ============================================================
  INSERT INTO sublets (id, user_id, campus_id, title, rent_monthly, available_from, available_to, status, created_at) VALUES
    ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', v_campus_id, 'Summer sublet on State St — 1BR, fully furnished', 900, '2026-05-15', '2026-08-15', 'active', now() - interval '10 days'),
    ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000006', v_campus_id, 'Langdon St 2BR, looking for summer subletter', 1200, '2026-06-01', '2026-08-31', 'active', now() - interval '8 days'),
    ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000007', v_campus_id, 'Eagle Heights 1BR — great for grad students', 750, '2026-05-20', '2026-12-31', 'active', now() - interval '7 days'),
    ('e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000008', v_campus_id, 'Room in 3BR house near Camp Randall', 650, '2026-06-01', '2026-08-15', 'active', now() - interval '5 days'),
    ('e0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000009', v_campus_id, 'Willy St studio, flexible dates', 800, '2026-07-01', '2026-09-30', 'active', now() - interval '3 days'),
    ('e0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000010', v_campus_id, 'Monroe St 1BR sublease, pet-friendly building', 950, '2026-06-15', '2026-08-15', 'active', now() - interval '2 days'),
    ('e0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000011', v_campus_id, 'Spring semester sublet, W Gorham', 1000, '2026-01-15', '2026-05-15', 'expired', now() - interval '60 days'),
    ('e0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000012', v_campus_id, 'Private room in 4BR, University Ave', 550, '2026-06-01', '2026-08-15', 'active', now() - interval '1 day'),
    ('e0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000013', v_campus_id, 'Downtown efficiency, walk to campus', 725, '2026-05-15', '2026-08-31', 'active', now() - interval '12 hours'),
    ('e0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000014', v_campus_id, '2BR on Regent, seeking 1 subletter', 700, '2026-06-01', '2026-08-15', 'active', now() - interval '6 hours'),
    ('e0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000015', v_campus_id, 'Furnished room, Park St, all utilities included', 850, '2026-05-20', '2026-08-20', 'active', now() - interval '3 hours')
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 6. Saved Listings (for dev users)
  -- ============================================================
  INSERT INTO saved_listings (user_id, listing_id) VALUES
    ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001'),
    ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000010'),
    ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000034'),
    ('a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000017'),
    ('a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000018'),
    ('a0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000037'),
    ('a0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000038')
  ON CONFLICT (user_id, listing_id) DO NOTHING;

  -- ============================================================
  -- 7. Tour Requests
  -- ============================================================
  INSERT INTO tour_requests (id, listing_id, campus_id, user_id, student_name, student_email, preferred_dates, notes, status, created_at) VALUES
    ('f0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', v_campus_id, 'a0000000-0000-4000-8000-000000000001', 'Emma Chen', 'emma.chen@wisc.edu', ARRAY['2026-03-15'::date, '2026-03-16'::date], 'Afternoons work best for me.', 'pending', now() - interval '2 days'),
    ('f0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000017', v_campus_id, 'a0000000-0000-4000-8000-000000000002', 'Raj Patel', 'raj.patel@wisc.edu', ARRAY['2026-03-20'::date], 'I would like to see the community spaces too.', 'confirmed', now() - interval '5 days'),
    ('f0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000037', v_campus_id, 'a0000000-0000-4000-8000-000000000003', 'Maria Garcia', 'maria.garcia@wisc.edu', ARRAY['2026-03-18'::date, '2026-03-19'::date, '2026-03-20'::date], 'Flexible schedule this week.', 'pending', now() - interval '1 day')
  ON CONFLICT DO NOTHING;

END $$;

COMMIT;
