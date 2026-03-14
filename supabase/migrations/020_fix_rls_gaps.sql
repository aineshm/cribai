-- Migration 020: Fix RLS gaps on 3 tables
-- pageindex_trees: RLS not enabled, no policies
-- api_cache: RLS enabled but no policies
-- roommate_profiles: RLS not enabled, no policies

-- ============================================================
-- Fix 1: pageindex_trees — RLS not enabled, no policies
-- Authenticated users should only read their campus's RAG trees
-- ============================================================
ALTER TABLE pageindex_trees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campus_pageindex_select" ON pageindex_trees
  FOR SELECT TO authenticated
  USING (
    campus_id = (SELECT campus_id FROM profiles WHERE id = auth.uid())
  );

-- ============================================================
-- Fix 2: api_cache — RLS enabled but no policies
-- Only service role should access cached API responses
-- ============================================================
CREATE POLICY "service_role_api_cache" ON api_cache
  FOR ALL TO service_role
  USING (true);

-- ============================================================
-- Fix 3: roommate_profiles — RLS not enabled, no policies
-- Note: PK is `id` (references auth.users), not a separate user_id column
-- ============================================================
ALTER TABLE roommate_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_roommate_profile_select" ON roommate_profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "own_roommate_profile_insert" ON roommate_profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "own_roommate_profile_update" ON roommate_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "own_roommate_profile_delete" ON roommate_profiles
  FOR DELETE TO authenticated
  USING (auth.uid() = id);
