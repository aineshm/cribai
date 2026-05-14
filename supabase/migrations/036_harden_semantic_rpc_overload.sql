-- Migration 036: harden legacy semantic search RPC overload
--
-- Migration 035 pins the current geo-enabled match_listings_semantic overload.
-- Some environments may also retain the earlier 7-argument overload from
-- migration 009, so pin its search_path too when present.

DO $$
BEGIN
  IF to_regprocedure(
    'public.match_listings_semantic(extensions.vector, uuid, smallint, numeric, numeric, numeric, integer)'
  ) IS NOT NULL THEN
    EXECUTE
      'ALTER FUNCTION public.match_listings_semantic(extensions.vector, uuid, smallint, numeric, numeric, numeric, integer) SET search_path = public, extensions, pg_temp';
  END IF;
END;
$$;
