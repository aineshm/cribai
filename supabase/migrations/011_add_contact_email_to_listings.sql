-- Add contact_email column to listings table
-- INT-01: persist contact_email from submit-listing form (was silently dropped)
ALTER TABLE listings ADD COLUMN IF NOT EXISTS contact_email text;
