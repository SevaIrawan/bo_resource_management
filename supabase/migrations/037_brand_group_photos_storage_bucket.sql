-- Bucket Supabase Storage untuk brand group photos.
-- Satu file = satu kebenaran per brand per user: {user_id}/{brand}.jpg
-- Public read (semua installer bisa resolve), authenticated write (upload/replace).

BEGIN;

-- 1) Buat bucket (public read agar URL bisa diakses tanpa auth token oleh worker)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brand-group-photos',
  'brand-group-photos',
  true,
  5242880, -- 5 MB max
  ARRAY['image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) Policy: authenticated users bisa upload/update/delete file dalam folder mereka sendiri
CREATE POLICY "Users can upload brand photos to own folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'brand-group-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own brand photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'brand-group-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'brand-group-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own brand photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'brand-group-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3) Policy: public read (bucket sudah public, tapi perlu SELECT policy juga)
CREATE POLICY "Anyone can read brand photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'brand-group-photos');

COMMIT;
