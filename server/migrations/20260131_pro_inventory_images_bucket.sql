-- Migration: Create bucket for pro inventory images
-- Date: 2026-01-31

-- Create the bucket for inventory product/service images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pro-inventory-images',
  'pro-inventory-images',
  true,
  5242880, -- 5MB max
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Storage policies for pro-inventory-images bucket

-- Allow authenticated users to upload images to their establishment folder
CREATE POLICY "pro_inventory_images_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'pro-inventory-images'
);

-- Allow public read access (images are public)
CREATE POLICY "pro_inventory_images_select"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'pro-inventory-images');

-- Allow authenticated users to delete their images
CREATE POLICY "pro_inventory_images_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'pro-inventory-images');

-- Allow authenticated users to update their images
CREATE POLICY "pro_inventory_images_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'pro-inventory-images');
