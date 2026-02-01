-- ============================================================================
-- Seed: Categories & Subcategories Hierarchy
-- Date: 2026-01-28
-- Description: Pre-populate categories (level 2) and update subcategories
--              Focus on establishments requiring reservations and supporting packs
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- CATEGORIES (Level 2) - by Universe
-- ---------------------------------------------------------------------------

-- BOIRE ET MANGER (restaurants)
insert into public.categories (universe_slug, slug, name_fr, name_en, display_order, requires_booking, supports_packs) values
  ('restaurants', 'restaurant', 'Restaurant', 'Restaurant', 1, true, true),
  ('restaurants', 'cafe_salon_the', 'Café / Salon de thé', 'Café / Tea Room', 2, true, true),
  ('restaurants', 'bar_lounge', 'Bar / Lounge', 'Bar / Lounge', 3, true, true),
  ('restaurants', 'rooftop', 'Rooftop', 'Rooftop', 4, true, true),
  ('restaurants', 'brunch_spot', 'Brunch Spot', 'Brunch Spot', 5, true, true),
  ('restaurants', 'fast_food_gourmet', 'Fast Food Gourmet', 'Gourmet Fast Food', 6, true, true)
on conflict (universe_slug, slug) do update set
  name_fr = excluded.name_fr,
  name_en = excluded.name_en,
  display_order = excluded.display_order,
  requires_booking = excluded.requires_booking,
  supports_packs = excluded.supports_packs;

-- BIEN-ÊTRE (sport)
insert into public.categories (universe_slug, slug, name_fr, name_en, display_order, requires_booking, supports_packs) values
  ('sport', 'spa_hammam', 'Spa & Hammam', 'Spa & Hammam', 1, true, true),
  ('sport', 'institut_beaute', 'Institut de beauté', 'Beauty Institute', 2, true, true),
  ('sport', 'coiffure_barber', 'Coiffure / Barber', 'Hair Salon / Barber', 3, true, true),
  ('sport', 'massage', 'Massage & Bien-être', 'Massage & Wellness', 4, true, true),
  ('sport', 'fitness', 'Fitness & Sport', 'Fitness & Sport', 5, true, true),
  ('sport', 'soins_corps', 'Soins du corps', 'Body Care', 6, true, true)
on conflict (universe_slug, slug) do update set
  name_fr = excluded.name_fr,
  name_en = excluded.name_en,
  display_order = excluded.display_order,
  requires_booking = excluded.requires_booking,
  supports_packs = excluded.supports_packs;

-- LOISIRS
insert into public.categories (universe_slug, slug, name_fr, name_en, display_order, requires_booking, supports_packs) values
  ('loisirs', 'activites_indoor', 'Activités Indoor', 'Indoor Activities', 1, true, true),
  ('loisirs', 'activites_outdoor', 'Activités Outdoor', 'Outdoor Activities', 2, true, true),
  ('loisirs', 'sports_nautiques', 'Sports Nautiques', 'Water Sports', 3, true, true),
  ('loisirs', 'sports_mecaniques', 'Sports Mécaniques', 'Motor Sports', 4, true, true),
  ('loisirs', 'aventure', 'Aventure & Sensations', 'Adventure & Thrills', 5, true, true),
  ('loisirs', 'detente', 'Détente & Divertissement', 'Relaxation & Entertainment', 6, true, true)
on conflict (universe_slug, slug) do update set
  name_fr = excluded.name_fr,
  name_en = excluded.name_en,
  display_order = excluded.display_order,
  requires_booking = excluded.requires_booking,
  supports_packs = excluded.supports_packs;

-- HÉBERGEMENT
insert into public.categories (universe_slug, slug, name_fr, name_en, display_order, requires_booking, supports_packs) values
  ('hebergement', 'hotel', 'Hôtel', 'Hotel', 1, true, true),
  ('hebergement', 'riad', 'Riad', 'Riad', 2, true, true),
  ('hebergement', 'maison_hotes', 'Maison d''hôtes', 'Guest House', 3, true, true),
  ('hebergement', 'resort', 'Resort & Club', 'Resort & Club', 4, true, true),
  ('hebergement', 'location_vacances', 'Location de vacances', 'Vacation Rental', 5, true, true),
  ('hebergement', 'glamping', 'Glamping & Insolite', 'Glamping & Unique', 6, true, true)
on conflict (universe_slug, slug) do update set
  name_fr = excluded.name_fr,
  name_en = excluded.name_en,
  display_order = excluded.display_order,
  requires_booking = excluded.requires_booking,
  supports_packs = excluded.supports_packs;

-- CULTURE
insert into public.categories (universe_slug, slug, name_fr, name_en, display_order, requires_booking, supports_packs) values
  ('culture', 'visite_guidee', 'Visite guidée', 'Guided Tour', 1, true, true),
  ('culture', 'musee', 'Musée', 'Museum', 2, true, true),
  ('culture', 'spectacle', 'Spectacle & Théâtre', 'Show & Theater', 3, true, true),
  ('culture', 'atelier', 'Atelier & Cours', 'Workshop & Class', 4, true, true),
  ('culture', 'evenement', 'Événement & Concert', 'Event & Concert', 5, true, true)
on conflict (universe_slug, slug) do update set
  name_fr = excluded.name_fr,
  name_en = excluded.name_en,
  display_order = excluded.display_order,
  requires_booking = excluded.requires_booking,
  supports_packs = excluded.supports_packs;

-- ---------------------------------------------------------------------------
-- SUBCATEGORIES (Level 3) - Update category_images with category_slug
-- ---------------------------------------------------------------------------

-- BOIRE ET MANGER > Restaurant
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('restaurants', 'francais', 'Français', 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=400&h=400&fit=crop', 1, 'restaurant', true),
  ('restaurants', 'italien', 'Italien', 'https://images.unsplash.com/photo-1595295333158-4742f28fbd85?w=400&h=400&fit=crop', 2, 'restaurant', true),
  ('restaurants', 'asiatique', 'Asiatique', 'https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=400&h=400&fit=crop', 3, 'restaurant', true),
  ('restaurants', 'japonais', 'Japonais', 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400&h=400&fit=crop', 4, 'restaurant', true),
  ('restaurants', 'marocain', 'Marocain traditionnel', 'https://images.unsplash.com/photo-1541518763669-27fef04b14ea?w=400&h=400&fit=crop', 5, 'restaurant', true),
  ('restaurants', 'oriental', 'Oriental', 'https://images.unsplash.com/photo-1547424850-a924f891a5ab?w=400&h=400&fit=crop', 6, 'restaurant', true),
  ('restaurants', 'libanais', 'Libanais', 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=400&fit=crop', 7, 'restaurant', true),
  ('restaurants', 'turc', 'Turc', 'https://images.unsplash.com/photo-1530469912745-a215c6b256ea?w=400&h=400&fit=crop', 8, 'restaurant', true),
  ('restaurants', 'indien', 'Indien', 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400&h=400&fit=crop', 9, 'restaurant', true),
  ('restaurants', 'mexicain', 'Mexicain', 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&h=400&fit=crop', 10, 'restaurant', true),
  ('restaurants', 'steakhouse', 'Steakhouse', 'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=400&h=400&fit=crop', 11, 'restaurant', true),
  ('restaurants', 'seafood', 'Fruits de mer', 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=400&h=400&fit=crop', 12, 'restaurant', true),
  ('restaurants', 'vegetarien', 'Végétarien / Vegan', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=400&fit=crop', 13, 'restaurant', true),
  ('restaurants', 'gastronomique', 'Gastronomique', 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=400&fit=crop', 14, 'restaurant', true),
  ('restaurants', 'fusion', 'Fusion', 'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=400&h=400&fit=crop', 15, 'restaurant', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- BOIRE ET MANGER > Café / Salon de thé
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('restaurants', 'cafe_classique', 'Café classique', 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&h=400&fit=crop', 1, 'cafe_salon_the', true),
  ('restaurants', 'salon_the', 'Salon de thé', 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&h=400&fit=crop', 2, 'cafe_salon_the', true),
  ('restaurants', 'coffee_shop', 'Coffee Shop', 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&h=400&fit=crop', 3, 'cafe_salon_the', true),
  ('restaurants', 'patisserie', 'Pâtisserie', 'https://images.unsplash.com/photo-1558326567-98ae2405596b?w=400&h=400&fit=crop', 4, 'cafe_salon_the', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- BOIRE ET MANGER > Bar / Lounge
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('restaurants', 'bar_cocktails', 'Bar à cocktails', 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=400&h=400&fit=crop', 1, 'bar_lounge', true),
  ('restaurants', 'bar_vins', 'Bar à vins', 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=400&h=400&fit=crop', 2, 'bar_lounge', true),
  ('restaurants', 'lounge', 'Lounge', 'https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=400&h=400&fit=crop', 3, 'bar_lounge', true),
  ('restaurants', 'pub', 'Pub', 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=400&h=400&fit=crop', 4, 'bar_lounge', true),
  ('restaurants', 'chicha_lounge', 'Chicha Lounge', 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?w=400&h=400&fit=crop', 5, 'bar_lounge', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- BOIRE ET MANGER > Rooftop
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('restaurants', 'rooftop_bar', 'Rooftop Bar', 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=400&fit=crop', 1, 'rooftop', true),
  ('restaurants', 'rooftop_restaurant', 'Rooftop Restaurant', 'https://images.unsplash.com/photo-1559329007-40df8a9345d8?w=400&h=400&fit=crop', 2, 'rooftop', true),
  ('restaurants', 'rooftop_lounge', 'Rooftop Lounge', 'https://images.unsplash.com/photo-1544148103-0773bf10d330?w=400&h=400&fit=crop', 3, 'rooftop', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- BOIRE ET MANGER > Brunch Spot
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('restaurants', 'brunch_classique', 'Brunch classique', 'https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?w=400&h=400&fit=crop', 1, 'brunch_spot', true),
  ('restaurants', 'brunch_oriental', 'Brunch oriental', 'https://images.unsplash.com/photo-1533089860892-a9b969df67a3?w=400&h=400&fit=crop', 2, 'brunch_spot', true),
  ('restaurants', 'brunch_healthy', 'Brunch healthy', 'https://images.unsplash.com/photo-1494390248081-4e521a5940db?w=400&h=400&fit=crop', 3, 'brunch_spot', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- BIEN-ÊTRE > Spa & Hammam
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('sport', 'hammam_traditionnel', 'Hammam traditionnel', 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=400&fit=crop', 1, 'spa_hammam', true),
  ('sport', 'spa_luxe', 'Spa de luxe', 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=400&h=400&fit=crop', 2, 'spa_hammam', true),
  ('sport', 'bain_vapeur', 'Bain de vapeur', 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?w=400&h=400&fit=crop', 3, 'spa_hammam', true),
  ('sport', 'jacuzzi_sauna', 'Jacuzzi & Sauna', 'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=400&h=400&fit=crop', 4, 'spa_hammam', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- BIEN-ÊTRE > Institut de beauté
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('sport', 'soins_visage', 'Soins du visage', 'https://images.unsplash.com/photo-1560750588-73207b1ef5b8?w=400&h=400&fit=crop', 1, 'institut_beaute', true),
  ('sport', 'epilation', 'Épilation', 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=400&h=400&fit=crop', 2, 'institut_beaute', true),
  ('sport', 'manucure_pedicure', 'Manucure / Pédicure', 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=400&h=400&fit=crop', 3, 'institut_beaute', true),
  ('sport', 'maquillage', 'Maquillage', 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=400&h=400&fit=crop', 4, 'institut_beaute', true),
  ('sport', 'extensions_cils', 'Extensions cils', 'https://images.unsplash.com/photo-1583001931096-959e9a1a6223?w=400&h=400&fit=crop', 5, 'institut_beaute', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- BIEN-ÊTRE > Coiffure / Barber
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('sport', 'salon_coiffure', 'Salon de coiffure', 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&h=400&fit=crop', 1, 'coiffure_barber', true),
  ('sport', 'barber_shop', 'Barber Shop', 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&h=400&fit=crop', 2, 'coiffure_barber', true),
  ('sport', 'coiffure_coloration', 'Coloration', 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400&h=400&fit=crop', 3, 'coiffure_barber', true),
  ('sport', 'coiffure_mariage', 'Coiffure mariage', 'https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?w=400&h=400&fit=crop', 4, 'coiffure_barber', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- BIEN-ÊTRE > Massage & Bien-être
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('sport', 'massage_relaxant', 'Massage relaxant', 'https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=400&h=400&fit=crop', 1, 'massage', true),
  ('sport', 'massage_thai', 'Massage thaï', 'https://images.unsplash.com/photo-1519824145371-296894a0daa9?w=400&h=400&fit=crop', 2, 'massage', true),
  ('sport', 'massage_sportif', 'Massage sportif', 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=400&fit=crop', 3, 'massage', true),
  ('sport', 'reflexologie', 'Réflexologie', 'https://images.unsplash.com/photo-1559599101-f09722fb4948?w=400&h=400&fit=crop', 4, 'massage', true),
  ('sport', 'massage_duo', 'Massage duo', 'https://images.unsplash.com/photo-1591343395082-e120087004b4?w=400&h=400&fit=crop', 5, 'massage', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- BIEN-ÊTRE > Fitness & Sport
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('sport', 'salle_musculation', 'Salle de musculation', 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&h=400&fit=crop', 1, 'fitness', true),
  ('sport', 'yoga', 'Yoga', 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&h=400&fit=crop', 2, 'fitness', true),
  ('sport', 'pilates', 'Pilates', 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&h=400&fit=crop', 3, 'fitness', true),
  ('sport', 'crossfit', 'CrossFit', 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400&h=400&fit=crop', 4, 'fitness', true),
  ('sport', 'boxe', 'Boxe / Arts martiaux', 'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=400&h=400&fit=crop', 5, 'fitness', true),
  ('sport', 'natation', 'Natation', 'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=400&h=400&fit=crop', 6, 'fitness', true),
  ('sport', 'padel', 'Padel', 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=400&h=400&fit=crop', 7, 'fitness', true),
  ('sport', 'tennis', 'Tennis', 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=400&h=400&fit=crop', 8, 'fitness', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- LOISIRS > Activités Indoor
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('loisirs', 'escape_game', 'Escape Game', 'https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?w=400&h=400&fit=crop', 1, 'activites_indoor', true),
  ('loisirs', 'bowling', 'Bowling', 'https://images.unsplash.com/photo-1545232979-8bf68ee9b1af?w=400&h=400&fit=crop', 2, 'activites_indoor', true),
  ('loisirs', 'laser_game', 'Laser Game', 'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=400&h=400&fit=crop', 3, 'activites_indoor', true),
  ('loisirs', 'trampoline_park', 'Trampoline Park', 'https://images.unsplash.com/photo-1626716493137-b67fe9501e76?w=400&h=400&fit=crop', 4, 'activites_indoor', true),
  ('loisirs', 'billard', 'Billard', 'https://images.unsplash.com/photo-1611816055460-618287c870bd?w=400&h=400&fit=crop', 5, 'activites_indoor', true),
  ('loisirs', 'realite_virtuelle', 'Réalité virtuelle', 'https://images.unsplash.com/photo-1622979135225-d2ba269cf1ac?w=400&h=400&fit=crop', 6, 'activites_indoor', true),
  ('loisirs', 'karaoke', 'Karaoké', 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&h=400&fit=crop', 7, 'activites_indoor', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- LOISIRS > Activités Outdoor
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('loisirs', 'golf', 'Golf', 'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=400&h=400&fit=crop', 1, 'activites_outdoor', true),
  ('loisirs', 'equitation', 'Équitation', 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop', 2, 'activites_outdoor', true),
  ('loisirs', 'paintball', 'Paintball', 'https://images.unsplash.com/photo-1560088939-60f6fd7b7f2d?w=400&h=400&fit=crop', 3, 'activites_outdoor', true),
  ('loisirs', 'accrobranche', 'Accrobranche', 'https://images.unsplash.com/photo-1497290756760-23ac55edf36f?w=400&h=400&fit=crop', 4, 'activites_outdoor', true),
  ('loisirs', 'randonnee', 'Randonnée guidée', 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=400&h=400&fit=crop', 5, 'activites_outdoor', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- LOISIRS > Sports Nautiques
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('loisirs', 'jet_ski', 'Jet Ski', 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&h=400&fit=crop', 1, 'sports_nautiques', true),
  ('loisirs', 'paddle', 'Paddle', 'https://images.unsplash.com/photo-1526188717906-ab4a2f949f2d?w=400&h=400&fit=crop', 2, 'sports_nautiques', true),
  ('loisirs', 'surf', 'Surf', 'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=400&h=400&fit=crop', 3, 'sports_nautiques', true),
  ('loisirs', 'plongee', 'Plongée', 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&h=400&fit=crop', 4, 'sports_nautiques', true),
  ('loisirs', 'wakeboard', 'Wakeboard', 'https://images.unsplash.com/photo-1560269507-c27f0ac3a58f?w=400&h=400&fit=crop', 5, 'sports_nautiques', true),
  ('loisirs', 'kayak', 'Kayak', 'https://images.unsplash.com/photo-1472745942893-4b9f730c7668?w=400&h=400&fit=crop', 6, 'sports_nautiques', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- LOISIRS > Sports Mécaniques
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('loisirs', 'karting', 'Karting', 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop', 1, 'sports_mecaniques', true),
  ('loisirs', 'quad', 'Quad', 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=400&h=400&fit=crop', 2, 'sports_mecaniques', true),
  ('loisirs', 'buggy', 'Buggy', 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=400&h=400&fit=crop', 3, 'sports_mecaniques', true),
  ('loisirs', 'moto_cross', 'Moto cross', 'https://images.unsplash.com/photo-1558981852-426c6c22a060?w=400&h=400&fit=crop', 4, 'sports_mecaniques', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- LOISIRS > Aventure & Sensations
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('loisirs', 'parachute', 'Parachute', 'https://images.unsplash.com/photo-1503220317266-8ed5e8aaaf44?w=400&h=400&fit=crop', 1, 'aventure', true),
  ('loisirs', 'parapente', 'Parapente', 'https://images.unsplash.com/photo-1601024445121-e5b82f020549?w=400&h=400&fit=crop', 2, 'aventure', true),
  ('loisirs', 'saut_elastique', 'Saut à l''élastique', 'https://images.unsplash.com/photo-1567148680-a80eabab97ed?w=400&h=400&fit=crop', 3, 'aventure', true),
  ('loisirs', 'vol_montgolfiere', 'Vol en montgolfière', 'https://images.unsplash.com/photo-1507608616759-54f48f0af0ee?w=400&h=400&fit=crop', 4, 'aventure', true),
  ('loisirs', 'escalade', 'Escalade', 'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=400&h=400&fit=crop', 5, 'aventure', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- LOISIRS > Détente & Divertissement
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('loisirs', 'aquapark', 'Aquapark', 'https://images.unsplash.com/photo-1526909766119-fe11ee3d1c75?w=400&h=400&fit=crop', 1, 'detente', true),
  ('loisirs', 'parc_attractions', 'Parc d''attractions', 'https://images.unsplash.com/photo-1513106021000-168e5f56609d?w=400&h=400&fit=crop', 2, 'detente', true),
  ('loisirs', 'cinema', 'Cinéma', 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&h=400&fit=crop', 3, 'detente', true),
  ('loisirs', 'zoo_parc_animalier', 'Zoo / Parc animalier', 'https://images.unsplash.com/photo-1534567153574-2b12153a87f0?w=400&h=400&fit=crop', 4, 'detente', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- HÉBERGEMENT > Hôtel
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('hebergement', 'hotel_luxe', 'Hôtel de luxe', 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&h=400&fit=crop', 1, 'hotel', true),
  ('hebergement', 'hotel_boutique', 'Hôtel boutique', 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=400&h=400&fit=crop', 2, 'hotel', true),
  ('hebergement', 'hotel_affaires', 'Hôtel d''affaires', 'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=400&h=400&fit=crop', 3, 'hotel', true),
  ('hebergement', 'hotel_familial', 'Hôtel familial', 'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=400&h=400&fit=crop', 4, 'hotel', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- HÉBERGEMENT > Riad
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('hebergement', 'riad_traditionnel', 'Riad traditionnel', 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=400&h=400&fit=crop', 1, 'riad', true),
  ('hebergement', 'riad_luxe', 'Riad de luxe', 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400&h=400&fit=crop', 2, 'riad', true),
  ('hebergement', 'riad_charme', 'Riad de charme', 'https://images.unsplash.com/photo-1590073242678-70ee3fc28e8e?w=400&h=400&fit=crop', 3, 'riad', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- HÉBERGEMENT > Maison d'hôtes
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('hebergement', 'maison_hotes_charme', 'Maison d''hôtes de charme', 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=400&h=400&fit=crop', 1, 'maison_hotes', true),
  ('hebergement', 'maison_hotes_campagne', 'Maison d''hôtes de campagne', 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&h=400&fit=crop', 2, 'maison_hotes', true),
  ('hebergement', 'maison_hotes_mer', 'Maison d''hôtes bord de mer', 'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=400&h=400&fit=crop', 3, 'maison_hotes', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- HÉBERGEMENT > Resort & Club
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('hebergement', 'resort_plage', 'Resort de plage', 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=400&h=400&fit=crop', 1, 'resort', true),
  ('hebergement', 'resort_golf', 'Resort golf', 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&h=400&fit=crop', 2, 'resort', true),
  ('hebergement', 'resort_spa', 'Resort spa', 'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?w=400&h=400&fit=crop', 3, 'resort', true),
  ('hebergement', 'club_vacances', 'Club de vacances', 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=400&h=400&fit=crop', 4, 'resort', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- HÉBERGEMENT > Location de vacances
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('hebergement', 'villa', 'Villa', 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&h=400&fit=crop', 1, 'location_vacances', true),
  ('hebergement', 'appartement', 'Appartement', 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400&h=400&fit=crop', 2, 'location_vacances', true),
  ('hebergement', 'chalet', 'Chalet', 'https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=400&h=400&fit=crop', 3, 'location_vacances', true),
  ('hebergement', 'studio', 'Studio', 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&h=400&fit=crop', 4, 'location_vacances', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- HÉBERGEMENT > Glamping & Insolite
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('hebergement', 'glamping_tente', 'Tente de luxe', 'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=400&h=400&fit=crop', 1, 'glamping', true),
  ('hebergement', 'cabane_arbre', 'Cabane dans les arbres', 'https://images.unsplash.com/photo-1520637836993-a071674bb068?w=400&h=400&fit=crop', 2, 'glamping', true),
  ('hebergement', 'yourte', 'Yourte', 'https://images.unsplash.com/photo-1534174607289-f118e1c4a0b9?w=400&h=400&fit=crop', 3, 'glamping', true),
  ('hebergement', 'dome', 'Dôme', 'https://images.unsplash.com/photo-1563299796-17596ed6b017?w=400&h=400&fit=crop', 4, 'glamping', true),
  ('hebergement', 'bateau', 'Bateau', 'https://images.unsplash.com/photo-1544551763-77ef2d0cfc6c?w=400&h=400&fit=crop', 5, 'glamping', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- CULTURE > Visite guidée
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('culture', 'visite_ville', 'Visite de ville', 'https://images.unsplash.com/photo-1569154941061-e231b4725ef1?w=400&h=400&fit=crop', 1, 'visite_guidee', true),
  ('culture', 'visite_medina', 'Visite de médina', 'https://images.unsplash.com/photo-1539020140153-e479b8c22e70?w=400&h=400&fit=crop', 2, 'visite_guidee', true),
  ('culture', 'visite_desert', 'Excursion désert', 'https://images.unsplash.com/photo-1509023464722-18d996393ca8?w=400&h=400&fit=crop', 3, 'visite_guidee', true),
  ('culture', 'visite_gastronomique', 'Visite gastronomique', 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=400&fit=crop', 4, 'visite_guidee', true),
  ('culture', 'visite_privee', 'Visite privée', 'https://images.unsplash.com/photo-1531058020387-3be344556be6?w=400&h=400&fit=crop', 5, 'visite_guidee', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- CULTURE > Musée
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('culture', 'musee_art', 'Musée d''art', 'https://images.unsplash.com/photo-1565060169194-19fabf63012c?w=400&h=400&fit=crop', 1, 'musee', true),
  ('culture', 'musee_histoire', 'Musée d''histoire', 'https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=400&h=400&fit=crop', 2, 'musee', true),
  ('culture', 'monument_historique', 'Monument historique', 'https://images.unsplash.com/photo-1548636700-a46c1b8fd16b?w=400&h=400&fit=crop', 3, 'musee', true),
  ('culture', 'galerie_art', 'Galerie d''art', 'https://images.unsplash.com/photo-1531243269054-5ebf6f34081e?w=400&h=400&fit=crop', 4, 'musee', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- CULTURE > Spectacle & Théâtre
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('culture', 'theatre', 'Théâtre', 'https://images.unsplash.com/photo-1503095396549-807759245b35?w=400&h=400&fit=crop', 1, 'spectacle', true),
  ('culture', 'spectacle_folklorique', 'Spectacle folklorique', 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop', 2, 'spectacle', true),
  ('culture', 'comedy_club', 'Comedy club', 'https://images.unsplash.com/photo-1527224538127-2104bb71c51b?w=400&h=400&fit=crop', 3, 'spectacle', true),
  ('culture', 'diner_spectacle', 'Dîner spectacle', 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=400&fit=crop', 4, 'spectacle', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- CULTURE > Atelier & Cours
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('culture', 'cours_cuisine', 'Cours de cuisine', 'https://images.unsplash.com/photo-1452860606245-08befc0ff44b?w=400&h=400&fit=crop', 1, 'atelier', true),
  ('culture', 'atelier_poterie', 'Atelier poterie', 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=400&h=400&fit=crop', 2, 'atelier', true),
  ('culture', 'cours_photo', 'Cours de photo', 'https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=400&h=400&fit=crop', 3, 'atelier', true),
  ('culture', 'atelier_peinture', 'Atelier peinture', 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400&h=400&fit=crop', 4, 'atelier', true),
  ('culture', 'cours_danse', 'Cours de danse', 'https://images.unsplash.com/photo-1508807526345-15e9b5f4eaff?w=400&h=400&fit=crop', 5, 'atelier', true),
  ('culture', 'cours_langue', 'Cours de langue', 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=400&h=400&fit=crop', 6, 'atelier', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

-- CULTURE > Événement & Concert
insert into public.category_images (universe, category_id, name, image_url, display_order, category_slug, is_active) values
  ('culture', 'concert', 'Concert', 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=400&fit=crop', 1, 'evenement', true),
  ('culture', 'festival', 'Festival', 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=400&h=400&fit=crop', 2, 'evenement', true),
  ('culture', 'soiree_privee', 'Soirée privée', 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=400&h=400&fit=crop', 3, 'evenement', true),
  ('culture', 'vernissage', 'Vernissage', 'https://images.unsplash.com/photo-1531058020387-3be344556be6?w=400&h=400&fit=crop', 4, 'evenement', true)
on conflict (universe, category_id) do update set
  name = excluded.name,
  image_url = excluded.image_url,
  display_order = excluded.display_order,
  category_slug = excluded.category_slug,
  is_active = excluded.is_active;

commit;
