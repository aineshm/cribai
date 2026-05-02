-- Migration 034: harden SECURITY DEFINER functions
--
-- Locks down privileged RPC execution and pins search_path so function bodies
-- cannot be influenced by caller-controlled schemas.

ALTER FUNCTION claim_next_mission_job(INTEGER)
  SECURITY DEFINER
  SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION claim_next_mission_job(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_next_mission_job(INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION claim_next_mission_job(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION claim_next_mission_job(INTEGER) TO service_role;

ALTER FUNCTION get_listing_view_stats(uuid)
  SECURITY DEFINER
  SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION get_listing_view_stats(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_listing_view_stats(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION get_listing_view_stats(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION get_listing_view_stats(uuid) TO service_role;

ALTER FUNCTION set_draft_not_current()
  SECURITY DEFINER
  SET search_path = public, pg_temp;

ALTER FUNCTION handle_new_user()
  SECURITY DEFINER
  SET search_path = public, pg_temp;

ALTER FUNCTION auth.custom_claims(uuid)
  SECURITY DEFINER
  SET search_path = public, pg_temp;
