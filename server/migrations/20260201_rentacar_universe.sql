-- Add "Se déplacer" (Transportation) universe with full taxonomy
--
-- This migration adds:
-- 1. Alters the CHECK constraint on category_images to include 'rentacar'
-- 2. The rentacar universe to the universes table
-- 3. Category images for vehicle types

begin;

-- ---------------------------------------------------------------------------
-- 1. Alter CHECK constraint on category_images to include 'rentacar'
-- ---------------------------------------------------------------------------
alter table public.category_images drop constraint if exists category_images_universe_check;
alter table public.category_images add constraint category_images_universe_check
  check (universe in ('restaurants', 'sport', 'loisirs', 'hebergement', 'culture', 'shopping', 'rentacar'));

-- ---------------------------------------------------------------------------
-- 2. Add rentacar universe
-- ---------------------------------------------------------------------------
insert into public.universes (slug, label_fr, label_en, icon_name, color, sort_order, is_active, image_url)
values (
  'rentacar',
  'Se déplacer',
  'Car rental',
  'Car',
  '#a3001d',
  7,
  true,
  'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&h=400&fit=crop&q=80&auto=format'
)
on conflict (slug) do update set
  label_fr = excluded.label_fr,
  label_en = excluded.label_en,
  icon_name = excluded.icon_name,
  is_active = excluded.is_active,
  image_url = excluded.image_url;

-- ---------------------------------------------------------------------------
-- 3. Add category images for vehicle types
-- ---------------------------------------------------------------------------
insert into public.category_images (universe, category_id, name, image_url, display_order, is_active)
values
  -- Citadine (City car)
  ('rentacar', 'citadine', 'Citadine',
   'https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=400&h=400&fit=crop&q=80&auto=format',
   1, true),

  -- Compacte (Compact)
  ('rentacar', 'compacte', 'Compacte',
   'https://images.unsplash.com/photo-1590362891991-f776e747a588?w=400&h=400&fit=crop&q=80&auto=format',
   2, true),

  -- Berline (Sedan)
  ('rentacar', 'berline', 'Berline',
   'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=400&h=400&fit=crop&q=80&auto=format',
   3, true),

  -- SUV
  ('rentacar', 'suv', 'SUV',
   'https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=400&h=400&fit=crop&q=80&auto=format',
   4, true),

  -- 4x4 / Tout-terrain
  ('rentacar', '4x4', '4x4 / Tout-terrain',
   'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=400&h=400&fit=crop&q=80&auto=format',
   5, true),

  -- Monospace (Minivan)
  ('rentacar', 'monospace', 'Monospace',
   'https://images.unsplash.com/photo-1559416523-140ddc3d238c?w=400&h=400&fit=crop&q=80&auto=format',
   6, true),

  -- Utilitaire (Van/Utility)
  ('rentacar', 'utilitaire', 'Utilitaire',
   'https://images.unsplash.com/photo-1566008885218-90abf9200ddb?w=400&h=400&fit=crop&q=80&auto=format',
   7, true),

  -- Luxe (Luxury)
  ('rentacar', 'luxe', 'Luxe',
   'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=400&h=400&fit=crop&q=80&auto=format',
   8, true),

  -- Cabriolet (Convertible)
  ('rentacar', 'cabriolet', 'Cabriolet',
   'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=400&h=400&fit=crop&q=80&auto=format',
   9, true),

  -- Électrique (Electric)
  ('rentacar', 'electrique', 'Électrique',
   'https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=400&h=400&fit=crop&q=80&auto=format',
   10, true)

on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

commit;
