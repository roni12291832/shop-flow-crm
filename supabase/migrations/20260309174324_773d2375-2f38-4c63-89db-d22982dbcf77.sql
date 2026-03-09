
-- Create storage bucket for tenant logos
INSERT INTO storage.buckets (id, name, public) VALUES ('logos', 'logos', true);

-- Allow authenticated users to upload logos
CREATE POLICY "Authenticated users can upload logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'logos');

-- Allow public read access to logos
CREATE POLICY "Public can view logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'logos');

-- Allow authenticated users to update their logos
CREATE POLICY "Authenticated users can update logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'logos');

-- Allow authenticated users to delete logos
CREATE POLICY "Authenticated users can delete logos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'logos');
