-- Migration 007: saved_listings + notifications tables
-- Phase 4: Saved Listings and Alerts

-- ============================================================
-- saved_listings: junction table for user favorites
-- ============================================================

CREATE TABLE saved_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, listing_id)
);

ALTER TABLE saved_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own saves" ON saved_listings
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_saved_listings_user ON saved_listings(user_id);
CREATE INDEX idx_saved_listings_user_listing ON saved_listings(user_id, listing_id);

-- ============================================================
-- notifications: in-app alerts (price changes, listing removal)
-- ============================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('price_change', 'listing_inactive')),
  listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications" ON notifications
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE NOT is_read;
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- Enable Realtime for notifications (bell icon live updates)
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
