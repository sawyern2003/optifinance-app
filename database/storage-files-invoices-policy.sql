-- Allow authenticated users to read from the "files" bucket (e.g. invoice PDFs).
-- Required for "Download PDF" to work when the bucket is private (signed URLs need this).
-- Run in Supabase → SQL Editor.

-- If the bucket doesn't exist yet, create it (e.g. via Dashboard → Storage → New bucket "files").
-- Then run:

DROP POLICY IF EXISTS "Authenticated can read files bucket" ON storage.objects;
CREATE POLICY "Authenticated can read files bucket"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'files');
