-- Tour requests table for scheduling property tours
CREATE TABLE tour_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      uuid REFERENCES listings(id) NOT NULL,
  campus_id       uuid REFERENCES campus_configs(id) NOT NULL,
  user_id         uuid REFERENCES auth.users(id) NOT NULL,
  student_name    text NOT NULL,
  student_email   text NOT NULL,
  preferred_dates date[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(preferred_dates) > 0),
  notes           text,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tour_requests_user ON tour_requests (user_id, created_at DESC);
CREATE INDEX idx_tour_requests_listing ON tour_requests (listing_id);

-- Dedup: one pending tour request per user+listing (7-day window handled app-side)
CREATE UNIQUE INDEX idx_tour_requests_dedup
  ON tour_requests (user_id, listing_id)
  WHERE status = 'pending';

ALTER TABLE tour_requests ENABLE ROW LEVEL SECURITY;

-- Users can read their own tour requests
CREATE POLICY "own_tours_select" ON tour_requests
  FOR SELECT USING (auth.uid() = user_id);

-- Authenticated users can insert (edu verification NOT required)
CREATE POLICY "own_tours_insert" ON tour_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);
