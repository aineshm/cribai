-- Migration 035: fix security advisor gaps
--
-- Keeps public-schema tables behind explicit RLS policies, removes broad
-- storage object listing for the public listing-photo bucket, and prevents
-- direct Data API execution of internal SECURITY DEFINER trigger helpers.

-- ============================================================
-- RLS policies for public tables that intentionally use default-deny
-- ============================================================

DO $$
BEGIN
  IF to_regclass('public.agent_runs') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'agent_runs'
         AND policyname = 'service_role_agent_runs'
     ) THEN
    CREATE POLICY "service_role_agent_runs" ON public.agent_runs
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF to_regclass('public.api_cache') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'api_cache'
         AND policyname = 'service_role_api_cache'
     ) THEN
    CREATE POLICY "service_role_api_cache" ON public.api_cache
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF to_regclass('public.campus_landmarks') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = 'campus_landmarks'
         AND policyname = 'Campus landmarks are publicly readable'
     ) THEN
    CREATE POLICY "Campus landmarks are publicly readable"
      ON public.campus_landmarks
      FOR SELECT TO authenticated, anon
      USING (true);
  END IF;
END;
$$;

-- PostGIS metadata is non-sensitive reference data, but tables in public
-- still need RLS enabled when the public schema is exposed through PostgREST.
DO $$
BEGIN
  IF to_regclass('public.spatial_ref_sys') IS NOT NULL THEN
    BEGIN
      ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'spatial_ref_sys'
          AND policyname = 'Spatial reference systems are publicly readable'
      ) THEN
        CREATE POLICY "Spatial reference systems are publicly readable"
          ON public.spatial_ref_sys
          FOR SELECT TO authenticated, anon
          USING (true);
      END IF;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'Skipping spatial_ref_sys RLS; table is PostGIS-extension owned and not writable from this migration role.';
    END;
  END IF;
END;
$$;

-- Public buckets serve object URLs without a broad storage.objects SELECT
-- policy. Keeping the policy lets clients list every object in the bucket.
DROP POLICY IF EXISTS "Anyone can read listing photos" ON storage.objects;

-- ============================================================
-- Function hardening
-- ============================================================

ALTER FUNCTION public.update_listings_updated_at()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.get_listing_view_stats(uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.update_missions_updated_at()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.update_conversations_updated_at()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.match_listings_semantic(
  extensions.vector, uuid, smallint, numeric, numeric, numeric, integer,
  double precision, double precision, double precision
)
  SET search_path = public, extensions, pg_temp;

ALTER FUNCTION public.set_draft_not_current()
  SECURITY DEFINER
  SET search_path = public, pg_temp;

ALTER FUNCTION public.handle_new_user()
  SECURITY DEFINER
  SET search_path = public, pg_temp;

DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    ALTER FUNCTION public.rls_auto_enable()
      SET search_path = pg_catalog;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.set_draft_not_current()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.set_draft_not_current() FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.set_draft_not_current() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.set_draft_not_current() FROM authenticated;
  END IF;

  IF to_regprocedure('public.handle_new_user()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
  END IF;

  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated;
  END IF;
END;
$$;

-- These PostGIS helper overloads are SECURITY DEFINER in public when PostGIS
-- is installed there. The application does not call them through PostgREST.
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS identity, pg_get_userbyid(p.proowner) AS owner
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'st_estimatedextent'
      AND pg_get_function_identity_arguments(p.oid) IN (
        'text, text',
        'text, text, text',
        'text, text, text, boolean'
      )
  LOOP
    IF fn.owner = current_user THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn.identity);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn.identity);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn.identity);
    ELSE
      RAISE NOTICE 'Skipping % EXECUTE revoke; function is owned by %, not current migration role %.',
        fn.identity, fn.owner, current_user;
    END IF;
  END LOOP;
END;
$$;
