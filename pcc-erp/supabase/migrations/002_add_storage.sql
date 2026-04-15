-- ============================================================
-- Create Storage Bucket for Worker Photos
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('job_photos', 'job_photos', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for public reading
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'job_photos' );

-- Policies for authenticated inserts
CREATE POLICY "Authenticated users can upload photos"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'job_photos' AND auth.role() = 'authenticated' );
