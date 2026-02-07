-- Add logo_title and logo_description to contact_forms
alter table public.contact_forms 
add column if not exists logo_title text null,
add column if not exists logo_description text null;
