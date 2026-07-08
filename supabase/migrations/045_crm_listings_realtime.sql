-- Migration 045: crm_listings Realtime (AIN-105)
--
-- Adds crm_listings to the `supabase_realtime` publication so the "My
-- Apartments" dashboard (BoardView / CrmCanvas) can subscribe to live
-- INSERT/UPDATE/DELETE changes instead of only refreshing on its own mount —
-- e.g. a save from the extension while the dashboard tab is already open, or
-- the background nickname-generation UPDATE (AIN-95) streaming in.
--
-- RLS already scopes crm_listings to `user_id = auth.uid()` (037), and the
-- consuming hook (use-crm-listings-realtime.ts) opens a per-user private
-- channel filtered `user_id=eq.${userId}` — mirrors the missions Realtime
-- setup (013).
--
-- NOTE: file-only in this commit. Applied via Supabase MCP under founder
-- supervision at the merge gate — adding a table to a publication is a
-- metadata-only change, no guard needed.

ALTER PUBLICATION supabase_realtime ADD TABLE crm_listings;
