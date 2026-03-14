-- Migration: Create listing-photos storage bucket with RLS policies
-- Enables photo uploads for sublease listings via PostWizard

-- 1. Create a public bucket for listing photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-photos', 'listing-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow authenticated users to upload to their own folder
CREATE POLICY "Authenticated users can upload to own folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'listing-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. Allow anyone to read listing photos (public bucket)
CREATE POLICY "Anyone can read listing photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'listing-photos');

-- 4. Allow authenticated users to delete their own photos
CREATE POLICY "Users can delete own listing photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'listing-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
