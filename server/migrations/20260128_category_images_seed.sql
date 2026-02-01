-- ============================================================================
-- Seed: Category Images for "Votre envie du moment"
-- Date: 2026-01-28
-- Description: Pre-populate category images for all universes
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- RESTAURANTS
-- ---------------------------------------------------------------------------
insert into public.category_images (universe, category_id, name, image_url, display_order) values
  ('restaurants', 'french', 'Français', 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=400&fit=crop', 1),
  ('restaurants', 'asian', 'Asiatique', 'https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=400&h=400&fit=crop', 2),
  ('restaurants', 'italian', 'Italien', 'https://images.unsplash.com/photo-1595295333158-4742f28fbd85?w=400&h=400&fit=crop', 3),
  ('restaurants', 'moroccan', 'Cuisine traditionnelle', 'https://images.unsplash.com/photo-1541518763669-27fef04b14ea?w=400&h=400&fit=crop', 4),
  ('restaurants', 'japanese', 'Japonais', 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400&h=400&fit=crop', 5),
  ('restaurants', 'oriental', 'Oriental', 'https://images.unsplash.com/photo-1547424850-a924f891a5ab?w=400&h=400&fit=crop', 6),
  ('restaurants', 'steakhouse', 'Steakhouse', 'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=400&h=400&fit=crop', 7),
  ('restaurants', 'brunch', 'Brunch', 'https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?w=400&h=400&fit=crop', 8),
  ('restaurants', 'cafe', 'Café', 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&h=400&fit=crop', 9),
  ('restaurants', 'turques', 'Turques', 'https://images.unsplash.com/photo-1530469912745-a215c6b256ea?w=400&h=400&fit=crop', 10)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order;

-- ---------------------------------------------------------------------------
-- SPORT (Bien-être)
-- ---------------------------------------------------------------------------
insert into public.category_images (universe, category_id, name, image_url, display_order) values
  ('sport', 'hammam', 'Hammam', 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=400&fit=crop', 1),
  ('sport', 'spa', 'Spa', 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=400&h=400&fit=crop', 2),
  ('sport', 'massage', 'Massage', 'https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=400&h=400&fit=crop', 3),
  ('sport', 'institut_beaute', 'Institut beauté', 'https://images.unsplash.com/photo-1560750588-73207b1ef5b8?w=400&h=400&fit=crop', 4),
  ('sport', 'barber', 'Coiffeur / Barber', 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&h=400&fit=crop', 5),
  ('sport', 'yoga_pilates', 'Yoga / Pilates', 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&h=400&fit=crop', 6),
  ('sport', 'salle_sport', 'Salle de sport', 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=400&fit=crop', 7),
  ('sport', 'padel', 'Padel', 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400&h=400&fit=crop', 8),
  ('sport', 'tennis', 'Tennis', 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400&h=400&fit=crop', 9)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order;

-- ---------------------------------------------------------------------------
-- LOISIRS
-- ---------------------------------------------------------------------------
insert into public.category_images (universe, category_id, name, image_url, display_order) values
  ('loisirs', 'escape_game', 'Escape game', 'https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?w=400&h=400&fit=crop', 1),
  ('loisirs', 'karting', 'Karting', 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop', 2),
  ('loisirs', 'quad_buggy', 'Quad / Buggy', 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=400&h=400&fit=crop', 3),
  ('loisirs', 'jet_ski_paddle', 'Jet ski / Paddle', 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&h=400&fit=crop', 4),
  ('loisirs', 'parachute_parapente', 'Parachute / Parapente', 'https://images.unsplash.com/photo-1503220317266-8ed5e8aaaf44?w=400&h=400&fit=crop', 5),
  ('loisirs', 'golf', 'Golf', 'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=400&h=400&fit=crop', 6),
  ('loisirs', 'bowling', 'Bowling', 'https://images.unsplash.com/photo-1545232979-8bf68ee9b1af?w=400&h=400&fit=crop', 7),
  ('loisirs', 'aquapark', 'Aquapark', 'https://images.unsplash.com/photo-1526909766119-fe11ee3d1c75?w=400&h=400&fit=crop', 8)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order;

-- ---------------------------------------------------------------------------
-- HEBERGEMENT
-- ---------------------------------------------------------------------------
insert into public.category_images (universe, category_id, name, image_url, display_order) values
  ('hebergement', 'hotel', 'Hôtel', 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&h=400&fit=crop', 1),
  ('hebergement', 'riad', 'Riad', 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=400&h=400&fit=crop', 2),
  ('hebergement', 'maison_hotes', 'Maison d''hôtes', 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=400&h=400&fit=crop', 3),
  ('hebergement', 'appartement', 'Appartement', 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400&h=400&fit=crop', 4),
  ('hebergement', 'villa', 'Villa', 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&h=400&fit=crop', 5),
  ('hebergement', 'resort', 'Resort', 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=400&h=400&fit=crop', 6)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order;

-- ---------------------------------------------------------------------------
-- CULTURE
-- ---------------------------------------------------------------------------
insert into public.category_images (universe, category_id, name, image_url, display_order) values
  ('culture', 'visite_guidee', 'Visite guidée', 'https://images.unsplash.com/photo-1569154941061-e231b4725ef1?w=400&h=400&fit=crop', 1),
  ('culture', 'musee_monument', 'Musée / Monument', 'https://images.unsplash.com/photo-1565060169194-19fabf63012c?w=400&h=400&fit=crop', 2),
  ('culture', 'theatre', 'Théâtre', 'https://images.unsplash.com/photo-1503095396549-807759245b35?w=400&h=400&fit=crop', 3),
  ('culture', 'concert', 'Concert', 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=400&fit=crop', 4),
  ('culture', 'expo', 'Expo', 'https://images.unsplash.com/photo-1531243269054-5ebf6f34081e?w=400&h=400&fit=crop', 5),
  ('culture', 'atelier', 'Atelier', 'https://images.unsplash.com/photo-1452860606245-08befc0ff44b?w=400&h=400&fit=crop', 6)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order;

-- ---------------------------------------------------------------------------
-- SHOPPING
-- ---------------------------------------------------------------------------
insert into public.category_images (universe, category_id, name, image_url, display_order) values
  ('shopping', 'mode', 'Mode', 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=400&h=400&fit=crop', 1),
  ('shopping', 'chaussures', 'Chaussures', 'https://images.unsplash.com/photo-1460353581641-37baddab0fa2?w=400&h=400&fit=crop', 2),
  ('shopping', 'beaute_parfumerie', 'Beauté / Parfumerie', 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&h=400&fit=crop', 3),
  ('shopping', 'bijoux', 'Bijoux', 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=400&h=400&fit=crop', 4),
  ('shopping', 'maison_deco', 'Maison / Déco', 'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=400&h=400&fit=crop', 5),
  ('shopping', 'artisanat', 'Artisanat', 'https://images.unsplash.com/photo-1528396518501-b53b655eb9b3?w=400&h=400&fit=crop', 6)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order;

commit;
