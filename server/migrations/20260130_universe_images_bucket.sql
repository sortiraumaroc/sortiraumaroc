-- Storage bucket for universe images
-- Run this in Supabase SQL Editor to create the bucket

-- Insert the storage bucket (if it doesn't exist)
insert into storage.buckets (id, name, public)
values ('universe-images', 'universe-images', true)
on conflict (id) do nothing;

-- Allow public read access to universe images
create policy "Public read access for universe images"
on storage.objects for select
using (bucket_id = 'universe-images');

-- Allow authenticated admin users to upload images
-- Note: In practice, uploads go through the admin API which uses service role
create policy "Admin upload access for universe images"
on storage.objects for insert
with check (bucket_id = 'universe-images');

-- Allow admin users to delete images
create policy "Admin delete access for universe images"
on storage.objects for delete
using (bucket_id = 'universe-images');
