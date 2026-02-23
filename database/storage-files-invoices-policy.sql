-- Policies for the "files" bucket (invoice PDFs).
-- Run in Supabase → SQL Editor.
-- Ensure the bucket exists: Dashboard → Storage → New bucket "files" (private or public).

-- Read: required for Download PDF (signed URLs)
DROP POLICY IF EXISTS "Authenticated can read files bucket" ON storage.objects;
CREATE POLICY "Authenticated can read files bucket"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'files');

-- Insert/Update: required for generate-invoice-pdf to upload PDFs (without this you get 400)
DROP POLICY IF EXISTS "Authenticated can insert files bucket" ON storage.objects;
CREATE POLICY "Authenticated can insert files bucket"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'files');

DROP POLICY IF EXISTS "Authenticated can update files bucket" ON storage.objects;
CREATE POLICY "Authenticated can update files bucket"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'files');
