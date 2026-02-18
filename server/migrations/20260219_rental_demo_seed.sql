-- =============================================================================
-- RENTAL DEMO SEED — 6 Loueurs + ~61 Véhicules + Options + Promos
-- Date: 2026-02-19
--
-- This migration inserts demo data for the rental module:
--   1. 6 rental establishments (loueurs)
--   2. ~61 vehicles across all categories
--   3. Rental options per establishment
--   4. 6 promo codes
--   5. Direct avg_rating / review_count updates
--
-- Companion script: server/scripts/seed-rental-demo.ts
--   (creates auth users, pro_profiles, memberships, reservations)
--
-- Idempotent: uses ON CONFLICT DO NOTHING everywhere.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. DETERMINISTIC UUIDs (for cross-reference with TypeScript seed script)
-- =============================================================================
-- Establishments
--   hertz:     11111111-aaaa-bbbb-cccc-000000000001
--   saharacar: 11111111-aaaa-bbbb-cccc-000000000002
--   casarent:  11111111-aaaa-bbbb-cccc-000000000003
--   atlantic:  11111111-aaaa-bbbb-cccc-000000000004
--   prestige:  11111111-aaaa-bbbb-cccc-000000000005
--   fesauto:   11111111-aaaa-bbbb-cccc-000000000006

-- =============================================================================
-- 1. ESTABLISHMENTS
-- =============================================================================

INSERT INTO public.establishments (
  id, name, slug, universe, category, subcategory, city, address, country, region,
  phone, description_short, description_long, hours,
  tags, amenities, status, is_online, verified, booking_enabled,
  avg_rating, review_count, lat, lng, extra,
  cover_url, logo_url
) VALUES

-- 1. HERTZ LOCATION MAROC
(
  '11111111-aaaa-bbbb-cccc-000000000001',
  'Hertz Location Maroc',
  'hertz-location-maroc-casablanca',
  'rentacar',
  'location-vehicules',
  'location-vehicules',
  'Casablanca',
  'Aéroport Mohammed V, Terminal 1, Nouaceur',
  'MA', 'Casablanca-Settat',
  '+212522539800',
  'Leader mondial de la location de véhicules, Hertz vous propose une flotte premium au Maroc avec un service irréprochable.',
  'Hertz Location Maroc vous accueille dans ses agences de Casablanca (Aéroport Mohammed V et Centre-ville) et Marrakech (Aéroport Menara). Flotte récente, véhicules parfaitement entretenus, et un service client disponible de 7h à 23h. Restitution inter-villes possible (Casablanca ↔ Marrakech, supplément 500 MAD). Caution standard : 5 000 MAD. Annulation flexible gratuite jusqu''à 24h avant.',
  '{"lundi":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]},"mardi":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]},"mercredi":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]},"jeudi":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]},"vendredi":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]},"samedi":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]},"dimanche":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]}}',
  ARRAY['location', 'voiture', 'aéroport', 'premium', 'hertz', 'loueur-vérifié', 'super-loueur'],
  ARRAY['parking', 'wifi', 'climatisation'],
  'active', true, true, true,
  4.3, 187,
  33.3675, -7.5898,
  '{"rental_commission_percent": 15, "cancellation_policy": "flexible", "default_deposit": 5000, "inter_city_return": true, "inter_city_supplement": 500}'::jsonb,
  'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=1200&h=600&fit=crop&q=80',
  '/hertz-logo.avif'
),

-- 2. SAHARACAR
(
  '11111111-aaaa-bbbb-cccc-000000000002',
  'SaharaCar',
  'saharacar-marrakech',
  'rentacar',
  'location-vehicules',
  'location-vehicules',
  'Marrakech',
  'Zone Industrielle Sidi Ghanem, Rue 7, Marrakech',
  'MA', 'Marrakech-Safi',
  '+212524336700',
  'Spécialiste de la location tout-terrain et aventure dans le Sud marocain. Partez à la découverte du désert en toute liberté.',
  'SaharaCar est votre partenaire pour explorer le Sud marocain. Agences à Marrakech, Ouarzazate et Errachidia. Spécialistes des 4x4 et véhicules tout-terrain, nous vous proposons aussi des citadines et SUV pour tous vos besoins. Restitution inter-villes possible (Marrakech ↔ Ouarzazate ↔ Errachidia, supplément 300 MAD). Caution : 3 000 MAD. Annulation modérée (gratuite jusqu''à 48h, 50% après).',
  '{"lundi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"mardi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"mercredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"jeudi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"vendredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"samedi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"dimanche":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]}}',
  ARRAY['location', '4x4', 'désert', 'aventure', 'tout-terrain', 'loueur-vérifié'],
  ARRAY['parking', 'climatisation'],
  'active', true, true, true,
  4.6, 94,
  31.6295, -7.9811,
  '{"rental_commission_percent": 15, "cancellation_policy": "moderate", "default_deposit": 3000, "inter_city_return": true, "inter_city_supplement": 300}'::jsonb,
  'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=1200&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=200&h=200&fit=crop&q=80'
),

-- 3. CASARENT
(
  '11111111-aaaa-bbbb-cccc-000000000003',
  'CasaRent',
  'casarent-casablanca',
  'rentacar',
  'location-vehicules',
  'location-vehicules',
  'Casablanca',
  '45 Rue Mohammed V, Centre-ville, Casablanca',
  'MA', 'Casablanca-Settat',
  '+212522267890',
  'Votre partenaire mobilité à Casablanca. Véhicules récents, prix compétitifs, service rapide.',
  'CasaRent est la référence de la location de véhicules à Casablanca. Trois points de retrait : Centre-ville, Aïn Diab et Aéroport Mohammed V. Flotte variée des citadines économiques aux SUV familiaux, en passant par des véhicules électriques. Prix compétitifs et service rapide garanti. Caution : 2 000 MAD. Annulation flexible gratuite jusqu''à 24h.',
  '{"lundi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"21:00"}]},"mardi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"21:00"}]},"mercredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"21:00"}]},"jeudi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"21:00"}]},"vendredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"21:00"}]},"samedi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"21:00"}]},"dimanche":{"ouvert":true,"plages":[{"debut":"09:00","fin":"18:00"}]}}',
  ARRAY['location', 'voiture', 'économique', 'casablanca', 'électrique', 'loueur-vérifié', 'super-loueur'],
  ARRAY['parking', 'wifi', 'climatisation', 'borne-recharge'],
  'active', true, true, true,
  4.1, 256,
  33.5731, -7.5898,
  '{"rental_commission_percent": 15, "cancellation_policy": "flexible", "default_deposit": 2000, "inter_city_return": false}'::jsonb,
  'https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=1200&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=200&h=200&fit=crop&q=80'
),

-- 4. ATLANTIC CARS
(
  '11111111-aaaa-bbbb-cccc-000000000004',
  'Atlantic Cars',
  'atlantic-cars-tanger',
  'rentacar',
  'location-vehicules',
  'location-vehicules',
  'Tanger',
  '12 Avenue Mohammed VI, Tanger',
  'MA', 'Tanger-Tétouan-Al Hoceïma',
  '+212539945600',
  'Location de véhicules sur tout le littoral atlantique nord. Service professionnel et véhicules bien entretenus.',
  'Atlantic Cars dessert les villes du nord du Maroc : Tanger, Rabat et Kénitra. Flotte diversifiée de la citadine au minibus, en passant par des SUV et utilitaires. Service professionnel avec livraison possible en gare ou à domicile. Restitution inter-villes (Tanger ↔ Rabat ↔ Kénitra, supplément 200 MAD). Caution : 3 000 MAD.',
  '{"lundi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"mardi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"mercredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"jeudi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"vendredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"samedi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"dimanche":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]}}',
  ARRAY['location', 'voiture', 'tanger', 'rabat', 'nord', 'loueur-vérifié'],
  ARRAY['parking', 'climatisation'],
  'active', true, true, true,
  4.0, 132,
  35.7595, -5.8340,
  '{"rental_commission_percent": 15, "cancellation_policy": "moderate", "default_deposit": 3000, "inter_city_return": true, "inter_city_supplement": 200}'::jsonb,
  'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1200&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=200&h=200&fit=crop&q=80'
),

-- 5. PRESTIGE AUTO MAROC
(
  '11111111-aaaa-bbbb-cccc-000000000005',
  'Prestige Auto Maroc',
  'prestige-auto-maroc-casablanca',
  'rentacar',
  'location-vehicules',
  'location-vehicules',
  'Casablanca',
  '88 Boulevard de la Corniche, Aïn Diab, Casablanca',
  'MA', 'Casablanca-Settat',
  '+212522797800',
  'Découvrez le Maroc au volant de véhicules d''exception. Mercedes, BMW, Porsche, Range Rover... Le luxe à portée de main.',
  'Prestige Auto Maroc est le spécialiste de la location de véhicules haut de gamme au Maroc. Présent à Casablanca, Marrakech et Tanger, nous mettons à votre disposition une flotte d''exception : Mercedes Classe S, BMW Série 7, Porsche 911, Range Rover Vogue et bien plus. GPS et WiFi inclus, livraison aéroport/hôtel offerte. Restitution inter-villes possible (supplément 800 MAD). Caution : 15 000 MAD. Annulation stricte (gratuite jusqu''à 72h, 100% après).',
  '{"lundi":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]},"mardi":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]},"mercredi":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]},"jeudi":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]},"vendredi":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]},"samedi":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]},"dimanche":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]}}',
  ARRAY['location', 'luxe', 'premium', 'mercedes', 'bmw', 'porsche', 'range-rover', 'loueur-vérifié', 'super-loueur'],
  ARRAY['parking', 'wifi', 'climatisation', 'chauffeur'],
  'active', true, true, true,
  4.8, 67,
  33.5920, -7.6700,
  '{"rental_commission_percent": 15, "cancellation_policy": "strict", "default_deposit": 15000, "inter_city_return": true, "inter_city_supplement": 800}'::jsonb,
  'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1555215695-3004980ad54e?w=200&h=200&fit=crop&q=80'
),

-- 6. FÈS AUTO LOCATION
(
  '11111111-aaaa-bbbb-cccc-000000000006',
  'Fès Auto Location',
  'fes-auto-location-fes',
  'rentacar',
  'location-vehicules',
  'location-vehicules',
  'Fès',
  '23 Avenue Hassan II, Ville Nouvelle, Fès',
  'MA', 'Fès-Meknès',
  '+212535654300',
  'Explorer le Maroc impérial et le Moyen Atlas à votre rythme. Véhicules fiables et service familial depuis 2010.',
  'Fès Auto Location vous accompagne dans la découverte du Maroc impérial et du Moyen Atlas. Agences à Fès, Meknès et Ifrane. Service familial et personnalisé depuis 2010. Véhicules fiables et bien entretenus, des citadines aux 4x4. Restitution inter-villes (Fès ↔ Meknès ↔ Ifrane, supplément 150 MAD). Caution : 2 500 MAD. Annulation flexible.',
  '{"lundi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"19:00"}]},"mardi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"19:00"}]},"mercredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"19:00"}]},"jeudi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"19:00"}]},"vendredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"19:00"}]},"samedi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"19:00"}]},"dimanche":{"ouvert":false,"plages":[]}}',
  ARRAY['location', 'voiture', 'fès', 'moyen-atlas', 'ifrane', 'familial', 'loueur-vérifié'],
  ARRAY['parking', 'climatisation'],
  'active', true, true, true,
  4.4, 78,
  34.0181, -5.0078,
  '{"rental_commission_percent": 15, "cancellation_policy": "flexible", "default_deposit": 2500, "inter_city_return": true, "inter_city_supplement": 150}'::jsonb,
  'https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=1200&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=200&h=200&fit=crop&q=80'
)

ON CONFLICT (id) DO NOTHING;


-- =============================================================================
-- 2. VEHICLES
-- =============================================================================

-- High season dates common to all vehicles
-- July-August + December holidays

-- ---------------------------------------------------------------------------
-- HERTZ LOCATION MAROC — 15 vehicles
-- ---------------------------------------------------------------------------

INSERT INTO public.rental_vehicles (id, establishment_id, category, brand, model, year, photos, specs, mileage_policy, mileage_limit_per_day, extra_km_cost, pricing, high_season_dates, quantity, similar_vehicle, status, sort_order) VALUES

-- H1: Renault Clio 5
('22222222-0001-0001-0001-000000000001', '11111111-aaaa-bbbb-cccc-000000000001', 'citadine', 'Renault', 'Clio 5', 2024,
 ARRAY['https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"essence","trunk_volume":"340L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":250,"weekend":290,"high_season":325,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 8, true, 'active', 1),

-- H2: Peugeot 208
('22222222-0001-0001-0001-000000000002', '11111111-aaaa-bbbb-cccc-000000000001', 'citadine', 'Peugeot', '208', 2024,
 ARRAY['https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"essence","trunk_volume":"311L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":280,"weekend":325,"high_season":365,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 5, true, 'active', 2),

-- H3: Volkswagen Golf 8
('22222222-0001-0001-0001-000000000003', '11111111-aaaa-bbbb-cccc-000000000001', 'compacte', 'Volkswagen', 'Golf 8', 2024,
 ARRAY['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"380L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":350,"weekend":405,"high_season":455,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 4, false, 'active', 3),

-- H4: Toyota Corolla
('22222222-0001-0001-0001-000000000004', '11111111-aaaa-bbbb-cccc-000000000001', 'compacte', 'Toyota', 'Corolla', 2023,
 ARRAY['https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"hybride","trunk_volume":"361L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":380,"weekend":440,"high_season":495,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, true, 'active', 4),

-- H5: Peugeot 508
('22222222-0001-0001-0001-000000000005', '11111111-aaaa-bbbb-cccc-000000000001', 'berline', 'Peugeot', '508', 2024,
 ARRAY['https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"487L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":500,"weekend":575,"high_season":650,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, false, 'active', 5),

-- H6: Mercedes Classe C
('22222222-0001-0001-0001-000000000006', '11111111-aaaa-bbbb-cccc-000000000001', 'berline', 'Mercedes-Benz', 'Classe C', 2024,
 ARRAY['https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"455L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":700,"weekend":805,"high_season":910,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 6),

-- H7: Dacia Duster
('22222222-0001-0001-0001-000000000007', '11111111-aaaa-bbbb-cccc-000000000001', 'suv', 'Dacia', 'Duster', 2024,
 ARRAY['https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"445L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":350,"weekend":405,"high_season":455,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 6, true, 'active', 7),

-- H8: Hyundai Tucson
('22222222-0001-0001-0001-000000000008', '11111111-aaaa-bbbb-cccc-000000000001', 'suv', 'Hyundai', 'Tucson', 2024,
 ARRAY['https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"hybride","trunk_volume":"546L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":500,"weekend":575,"high_season":650,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 4, true, 'active', 8),

-- H9: BMW X3
('22222222-0001-0001-0001-000000000009', '11111111-aaaa-bbbb-cccc-000000000001', 'suv', 'BMW', 'X3', 2024,
 ARRAY['https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"550L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":900,"weekend":1035,"high_season":1170,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 9),

-- H10: Toyota Land Cruiser
('22222222-0001-0001-0001-000000000010', '11111111-aaaa-bbbb-cccc-000000000001', '4x4', 'Toyota', 'Land Cruiser', 2023,
 ARRAY['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":7,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"553L"}'::jsonb,
 'limited', 300, 1.50,
 '{"standard":1200,"weekend":1380,"high_season":1560,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 10),

-- H11: Renault Kangoo
('22222222-0001-0001-0001-000000000011', '11111111-aaaa-bbbb-cccc-000000000001', 'utilitaire', 'Renault', 'Kangoo', 2023,
 ARRAY['https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop'],
 '{"seats":2,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"3.6m³"}'::jsonb,
 'limited', 200, 1.00,
 '{"standard":300,"weekend":345,"high_season":390,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 4, true, 'active', 11),

-- H12: Peugeot Expert
('22222222-0001-0001-0001-000000000012', '11111111-aaaa-bbbb-cccc-000000000001', 'utilitaire', 'Peugeot', 'Expert', 2023,
 ARRAY['https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop'],
 '{"seats":3,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"5.3m³"}'::jsonb,
 'limited', 200, 1.20,
 '{"standard":450,"weekend":520,"high_season":585,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, true, 'active', 12),

-- H13: Mercedes Classe E
('22222222-0001-0001-0001-000000000013', '11111111-aaaa-bbbb-cccc-000000000001', 'luxe', 'Mercedes-Benz', 'Classe E', 2025,
 ARRAY['https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"540L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":1100,"weekend":1265,"high_season":1430,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 13),

-- H14: BMW Série 5
('22222222-0001-0001-0001-000000000014', '11111111-aaaa-bbbb-cccc-000000000001', 'luxe', 'BMW', 'Série 5', 2025,
 ARRAY['https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"520L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":1050,"weekend":1210,"high_season":1365,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 14),

-- H15: Mercedes Vito (Minibus)
('22222222-0001-0001-0001-000000000015', '11111111-aaaa-bbbb-cccc-000000000001', 'monospace', 'Mercedes-Benz', 'Vito', 2024,
 ARRAY['https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":9,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"Grand"}'::jsonb,
 'limited', 250, 1.50,
 '{"standard":800,"weekend":920,"high_season":1040,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 15),


-- ---------------------------------------------------------------------------
-- SAHARACAR — 8 vehicles
-- ---------------------------------------------------------------------------

-- S1: Dacia Duster 4x4
('22222222-0002-0001-0001-000000000001', '11111111-aaaa-bbbb-cccc-000000000002', 'suv', 'Dacia', 'Duster 4x4', 2024,
 ARRAY['https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"445L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":400,"weekend":460,"high_season":520,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 8, true, 'active', 1),

-- S2: Toyota Hilux
('22222222-0002-0001-0001-000000000002', '11111111-aaaa-bbbb-cccc-000000000002', '4x4', 'Toyota', 'Hilux', 2023,
 ARRAY['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":4,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"Benne"}'::jsonb,
 'limited', 300, 1.00,
 '{"standard":800,"weekend":920,"high_season":1040,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 5, false, 'active', 2),

-- S3: Toyota Land Cruiser Prado
('22222222-0002-0001-0001-000000000003', '11111111-aaaa-bbbb-cccc-000000000002', '4x4', 'Toyota', 'Land Cruiser Prado', 2024,
 ARRAY['https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":7,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"550L"}'::jsonb,
 'limited', 250, 1.50,
 '{"standard":1300,"weekend":1495,"high_season":1690,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, false, 'active', 3),

-- S4: Mitsubishi Pajero
('22222222-0002-0001-0001-000000000004', '11111111-aaaa-bbbb-cccc-000000000002', '4x4', 'Mitsubishi', 'Pajero', 2023,
 ARRAY['https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop'],
 '{"seats":7,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"500L"}'::jsonb,
 'limited', 300, 1.20,
 '{"standard":1000,"weekend":1150,"high_season":1300,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, true, 'active', 4),

-- S5: Hyundai Tucson
('22222222-0002-0001-0001-000000000005', '11111111-aaaa-bbbb-cccc-000000000002', 'suv', 'Hyundai', 'Tucson', 2024,
 ARRAY['https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"essence","trunk_volume":"546L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":480,"weekend":555,"high_season":625,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 4, true, 'active', 5),

-- S6: Dacia Sandero Stepway
('22222222-0002-0001-0001-000000000006', '11111111-aaaa-bbbb-cccc-000000000002', 'compacte', 'Dacia', 'Sandero Stepway', 2024,
 ARRAY['https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"essence","trunk_volume":"328L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":250,"weekend":290,"high_season":325,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 5, true, 'active', 6),

-- S7: Fiat 500
('22222222-0002-0001-0001-000000000007', '11111111-aaaa-bbbb-cccc-000000000002', 'citadine', 'Fiat', '500', 2023,
 ARRAY['https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop'],
 '{"seats":4,"doors":3,"transmission":"automatique","ac":true,"fuel_type":"essence","trunk_volume":"185L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":220,"weekend":255,"high_season":290,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, true, 'active', 7),

-- S8: Toyota Hiace (Minibus)
('22222222-0002-0001-0001-000000000008', '11111111-aaaa-bbbb-cccc-000000000002', 'monospace', 'Toyota', 'Hiace', 2023,
 ARRAY['https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop'],
 '{"seats":12,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"Grand"}'::jsonb,
 'limited', 200, 1.50,
 '{"standard":900,"weekend":1035,"high_season":1170,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 8),


-- ---------------------------------------------------------------------------
-- CASARENT — 10 vehicles
-- ---------------------------------------------------------------------------

-- C1: Dacia Sandero
('22222222-0003-0001-0001-000000000001', '11111111-aaaa-bbbb-cccc-000000000003', 'citadine', 'Dacia', 'Sandero', 2024,
 ARRAY['https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"essence","trunk_volume":"328L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":180,"weekend":210,"high_season":235,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 10, true, 'active', 1),

-- C2: Renault Clio 5
('22222222-0003-0001-0001-000000000002', '11111111-aaaa-bbbb-cccc-000000000003', 'citadine', 'Renault', 'Clio 5', 2023,
 ARRAY['https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"essence","trunk_volume":"340L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":220,"weekend":255,"high_season":290,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 8, true, 'active', 2),

-- C3: Peugeot 308
('22222222-0003-0001-0001-000000000003', '11111111-aaaa-bbbb-cccc-000000000003', 'compacte', 'Peugeot', '308', 2024,
 ARRAY['https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"412L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":320,"weekend":370,"high_season":415,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 5, true, 'active', 3),

-- C4: Renault Megane
('22222222-0003-0001-0001-000000000004', '11111111-aaaa-bbbb-cccc-000000000003', 'compacte', 'Renault', 'Megane', 2023,
 ARRAY['https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"384L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":280,"weekend":325,"high_season":365,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 4, true, 'active', 4),

-- C5: Hyundai Sonata
('22222222-0003-0001-0001-000000000005', '11111111-aaaa-bbbb-cccc-000000000003', 'berline', 'Hyundai', 'Sonata', 2024,
 ARRAY['https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"essence","trunk_volume":"462L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":420,"weekend":485,"high_season":545,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, true, 'active', 5),

-- C6: Renault Kadjar
('22222222-0003-0001-0001-000000000006', '11111111-aaaa-bbbb-cccc-000000000003', 'suv', 'Renault', 'Kadjar', 2023,
 ARRAY['https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"472L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":400,"weekend":460,"high_season":520,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 4, true, 'active', 6),

-- C7: Dacia Duster
('22222222-0003-0001-0001-000000000007', '11111111-aaaa-bbbb-cccc-000000000003', 'suv', 'Dacia', 'Duster', 2024,
 ARRAY['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"445L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":300,"weekend":345,"high_season":390,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 6, true, 'active', 7),

-- C8: Dacia Dokker (Utilitaire)
('22222222-0003-0001-0001-000000000008', '11111111-aaaa-bbbb-cccc-000000000003', 'utilitaire', 'Dacia', 'Dokker', 2023,
 ARRAY['https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"800L"}'::jsonb,
 'limited', 200, 0.80,
 '{"standard":250,"weekend":290,"high_season":325,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 4, true, 'active', 8),

-- C9: Renault Master (Utilitaire)
('22222222-0003-0001-0001-000000000009', '11111111-aaaa-bbbb-cccc-000000000003', 'utilitaire', 'Renault', 'Master', 2023,
 ARRAY['https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop'],
 '{"seats":3,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"8m³"}'::jsonb,
 'limited', 150, 1.00,
 '{"standard":500,"weekend":575,"high_season":650,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 9),

-- C10: Renault Zoe (Électrique)
('22222222-0003-0001-0001-000000000010', '11111111-aaaa-bbbb-cccc-000000000003', 'electrique', 'Renault', 'Zoe', 2024,
 ARRAY['https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"electrique","trunk_volume":"338L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":300,"weekend":345,"high_season":390,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, false, 'active', 10),


-- ---------------------------------------------------------------------------
-- ATLANTIC CARS — 8 vehicles
-- ---------------------------------------------------------------------------

('22222222-0004-0001-0001-000000000001', '11111111-aaaa-bbbb-cccc-000000000004', 'citadine', 'Hyundai', 'i10', 2024,
 ARRAY['https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"essence","trunk_volume":"252L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":200,"weekend":230,"high_season":260,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 7, true, 'active', 1),

('22222222-0004-0001-0001-000000000002', '11111111-aaaa-bbbb-cccc-000000000004', 'citadine', 'Peugeot', '208', 2023,
 ARRAY['https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"essence","trunk_volume":"311L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":240,"weekend":275,"high_season":310,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 5, true, 'active', 2),

('22222222-0004-0001-0001-000000000003', '11111111-aaaa-bbbb-cccc-000000000004', 'compacte', 'Kia', 'Ceed', 2024,
 ARRAY['https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"395L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":330,"weekend":380,"high_season":430,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 4, true, 'active', 3),

('22222222-0004-0001-0001-000000000004', '11111111-aaaa-bbbb-cccc-000000000004', 'berline', 'Skoda', 'Octavia', 2024,
 ARRAY['https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"600L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":400,"weekend":460,"high_season":520,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, false, 'active', 4),

('22222222-0004-0001-0001-000000000005', '11111111-aaaa-bbbb-cccc-000000000004', 'suv', 'Kia', 'Sportage', 2024,
 ARRAY['https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"543L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":480,"weekend":555,"high_season":625,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 4, true, 'active', 5),

('22222222-0004-0001-0001-000000000006', '11111111-aaaa-bbbb-cccc-000000000004', 'suv', 'Peugeot', '3008', 2024,
 ARRAY['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"520L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":520,"weekend":600,"high_season":675,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, true, 'active', 6),

('22222222-0004-0001-0001-000000000007', '11111111-aaaa-bbbb-cccc-000000000004', 'monospace', 'Kia', 'Carnival', 2023,
 ARRAY['https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":7,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"627L"}'::jsonb,
 'limited', 250, 1.20,
 '{"standard":700,"weekend":805,"high_season":910,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 7),

('22222222-0004-0001-0001-000000000008', '11111111-aaaa-bbbb-cccc-000000000004', 'utilitaire', 'Peugeot', 'Partner', 2023,
 ARRAY['https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop'],
 '{"seats":2,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"3.3m³"}'::jsonb,
 'limited', 200, 0.90,
 '{"standard":280,"weekend":325,"high_season":365,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, true, 'active', 8),


-- ---------------------------------------------------------------------------
-- PRESTIGE AUTO MAROC — 12 vehicles
-- ---------------------------------------------------------------------------

('22222222-0005-0001-0001-000000000001', '11111111-aaaa-bbbb-cccc-000000000005', 'luxe', 'Mercedes-Benz', 'Classe S', 2025,
 ARRAY['https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"550L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":2500,"weekend":2875,"high_season":3250,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 1),

('22222222-0005-0001-0001-000000000002', '11111111-aaaa-bbbb-cccc-000000000005', 'luxe', 'BMW', 'Série 7', 2025,
 ARRAY['https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"515L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":2300,"weekend":2645,"high_season":2990,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 2),

('22222222-0005-0001-0001-000000000003', '11111111-aaaa-bbbb-cccc-000000000005', 'luxe', 'Audi', 'A8', 2024,
 ARRAY['https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"505L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":2200,"weekend":2530,"high_season":2860,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 1, false, 'active', 3),

('22222222-0005-0001-0001-000000000004', '11111111-aaaa-bbbb-cccc-000000000005', 'suv', 'Land Rover', 'Range Rover Vogue', 2025,
 ARRAY['https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"818L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":3000,"weekend":3450,"high_season":3900,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 4),

('22222222-0005-0001-0001-000000000005', '11111111-aaaa-bbbb-cccc-000000000005', 'suv', 'Porsche', 'Cayenne', 2024,
 ARRAY['https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"essence","trunk_volume":"770L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":2800,"weekend":3220,"high_season":3640,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 1, false, 'active', 5),

('22222222-0005-0001-0001-000000000006', '11111111-aaaa-bbbb-cccc-000000000005', 'suv', 'Mercedes-Benz', 'GLE', 2024,
 ARRAY['https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"630L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":1800,"weekend":2070,"high_season":2340,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 6),

('22222222-0005-0001-0001-000000000007', '11111111-aaaa-bbbb-cccc-000000000005', 'sport', 'Porsche', '911 Carrera', 2024,
 ARRAY['https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop'],
 '{"seats":2,"doors":2,"transmission":"automatique","ac":true,"fuel_type":"essence","trunk_volume":"132L"}'::jsonb,
 'limited', 200, 3.00,
 '{"standard":4000,"weekend":4600,"high_season":5200,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 1, false, 'active', 7),

('22222222-0005-0001-0001-000000000008', '11111111-aaaa-bbbb-cccc-000000000005', 'sport', 'Mercedes-Benz', 'AMG GT', 2024,
 ARRAY['https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop'],
 '{"seats":2,"doors":2,"transmission":"automatique","ac":true,"fuel_type":"essence","trunk_volume":"350L"}'::jsonb,
 'limited', 200, 3.50,
 '{"standard":4500,"weekend":5175,"high_season":5850,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 1, false, 'active', 8),

('22222222-0005-0001-0001-000000000009', '11111111-aaaa-bbbb-cccc-000000000005', 'cabriolet', 'BMW', 'Série 4 Cabriolet', 2024,
 ARRAY['https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop'],
 '{"seats":4,"doors":2,"transmission":"automatique","ac":true,"fuel_type":"essence","trunk_volume":"300L"}'::jsonb,
 'limited', 250, 2.50,
 '{"standard":2000,"weekend":2300,"high_season":2600,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 1, false, 'active', 9),

('22222222-0005-0001-0001-000000000010', '11111111-aaaa-bbbb-cccc-000000000005', 'berline', 'Mercedes-Benz', 'Classe E', 2025,
 ARRAY['https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"hybride","trunk_volume":"540L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":1500,"weekend":1725,"high_season":1950,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, false, 'active', 10),

('22222222-0005-0001-0001-000000000011', '11111111-aaaa-bbbb-cccc-000000000005', 'suv', 'BMW', 'X5', 2024,
 ARRAY['https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"650L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":1600,"weekend":1840,"high_season":2080,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 11),

('22222222-0005-0001-0001-000000000012', '11111111-aaaa-bbbb-cccc-000000000005', 'monospace', 'Mercedes-Benz', 'Classe V', 2024,
 ARRAY['https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":7,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"diesel","trunk_volume":"1030L"}'::jsonb,
 'limited', 300, 2.00,
 '{"standard":2000,"weekend":2300,"high_season":2600,"long_duration_discount":{"min_days":7,"discount_percent":15}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 1, false, 'active', 12),


-- ---------------------------------------------------------------------------
-- FÈS AUTO LOCATION — 8 vehicles
-- ---------------------------------------------------------------------------

('22222222-0006-0001-0001-000000000001', '11111111-aaaa-bbbb-cccc-000000000006', 'citadine', 'Dacia', 'Sandero', 2023,
 ARRAY['https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"essence","trunk_volume":"328L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":190,"weekend":220,"high_season":250,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 6, true, 'active', 1),

('22222222-0006-0001-0001-000000000002', '11111111-aaaa-bbbb-cccc-000000000006', 'citadine', 'Renault', 'Clio 4', 2022,
 ARRAY['https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"300L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":200,"weekend":230,"high_season":260,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 4, true, 'active', 2),

('22222222-0006-0001-0001-000000000003', '11111111-aaaa-bbbb-cccc-000000000006', 'compacte', 'Peugeot', '301', 2023,
 ARRAY['https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"506L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":250,"weekend":290,"high_season":325,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 5, true, 'active', 3),

('22222222-0006-0001-0001-000000000004', '11111111-aaaa-bbbb-cccc-000000000006', 'berline', 'Hyundai', 'Elantra', 2024,
 ARRAY['https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"essence","trunk_volume":"474L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":380,"weekend":440,"high_season":495,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, true, 'active', 4),

('22222222-0006-0001-0001-000000000005', '11111111-aaaa-bbbb-cccc-000000000006', 'suv', 'Dacia', 'Duster', 2024,
 ARRAY['https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"445L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":320,"weekend":370,"high_season":415,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 5, true, 'active', 5),

('22222222-0006-0001-0001-000000000006', '11111111-aaaa-bbbb-cccc-000000000006', 'suv', 'Hyundai', 'Creta', 2024,
 ARRAY['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":5,"transmission":"automatique","ac":true,"fuel_type":"essence","trunk_volume":"433L"}'::jsonb,
 'unlimited', NULL, NULL,
 '{"standard":400,"weekend":460,"high_season":520,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, true, 'active', 6),

('22222222-0006-0001-0001-000000000007', '11111111-aaaa-bbbb-cccc-000000000006', '4x4', 'Mitsubishi', 'L200', 2023,
 ARRAY['https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&h=600&fit=crop'],
 '{"seats":5,"doors":4,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"Benne"}'::jsonb,
 'limited', 250, 1.00,
 '{"standard":700,"weekend":805,"high_season":910,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 2, false, 'active', 7),

('22222222-0006-0001-0001-000000000008', '11111111-aaaa-bbbb-cccc-000000000006', 'utilitaire', 'Renault', 'Kangoo', 2022,
 ARRAY['https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=600&fit=crop','https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=800&h=600&fit=crop'],
 '{"seats":2,"doors":5,"transmission":"manuelle","ac":true,"fuel_type":"diesel","trunk_volume":"3.6m³"}'::jsonb,
 'limited', 200, 0.80,
 '{"standard":220,"weekend":255,"high_season":290,"long_duration_discount":{"min_days":7,"discount_percent":10}}'::jsonb,
 '[{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}]'::jsonb,
 3, true, 'active', 8)

ON CONFLICT (id) DO NOTHING;


-- =============================================================================
-- 3. RENTAL OPTIONS
-- =============================================================================

INSERT INTO public.rental_options (establishment_id, name, description, price, price_type, is_mandatory, sort_order, is_active) VALUES

-- HERTZ
('11111111-aaaa-bbbb-cccc-000000000001', 'Siège bébé', 'Siège auto pour bébé (0-12 mois)', 50, 'per_day', false, 1, true),
('11111111-aaaa-bbbb-cccc-000000000001', 'Siège enfant', 'Siège auto pour enfant (1-4 ans)', 50, 'per_day', false, 2, true),
('11111111-aaaa-bbbb-cccc-000000000001', 'Conducteur additionnel', 'Ajout d''un conducteur supplémentaire', 80, 'per_day', false, 3, true),
('11111111-aaaa-bbbb-cccc-000000000001', 'GPS', 'Navigation GPS portable', 60, 'per_day', false, 4, true),
('11111111-aaaa-bbbb-cccc-000000000001', 'WiFi embarqué', 'Hotspot WiFi portable 4G', 70, 'per_day', false, 5, true),
('11111111-aaaa-bbbb-cccc-000000000001', 'Livraison aéroport', 'Livraison du véhicule à l''aéroport', 200, 'fixed', false, 6, true),
('11111111-aaaa-bbbb-cccc-000000000001', 'Livraison hôtel', 'Livraison du véhicule à votre hôtel', 150, 'fixed', false, 7, true),
('11111111-aaaa-bbbb-cccc-000000000001', 'Plein de carburant', 'Réservoir plein au retour non obligatoire', 500, 'fixed', false, 8, true),

-- SAHARACAR
('11111111-aaaa-bbbb-cccc-000000000002', 'Siège bébé', 'Siège auto pour bébé', 40, 'per_day', false, 1, true),
('11111111-aaaa-bbbb-cccc-000000000002', 'Siège enfant', 'Siège auto pour enfant', 40, 'per_day', false, 2, true),
('11111111-aaaa-bbbb-cccc-000000000002', 'Conducteur additionnel', 'Conducteur supplémentaire', 60, 'per_day', false, 3, true),
('11111111-aaaa-bbbb-cccc-000000000002', 'GPS', 'Navigation GPS', 50, 'per_day', false, 4, true),
('11111111-aaaa-bbbb-cccc-000000000002', 'Chaînes neige', 'Chaînes neige (recommandé hiver)', 100, 'per_day', false, 5, true),
('11111111-aaaa-bbbb-cccc-000000000002', 'Livraison aéroport', 'Livraison aéroport Menara', 150, 'fixed', false, 6, true),
('11111111-aaaa-bbbb-cccc-000000000002', 'Livraison hôtel', 'Livraison à votre riad/hôtel', 100, 'fixed', false, 7, true),
('11111111-aaaa-bbbb-cccc-000000000002', 'Plein de carburant', 'Plein de carburant au retour', 400, 'fixed', false, 8, true),

-- CASARENT
('11111111-aaaa-bbbb-cccc-000000000003', 'Siège bébé', 'Siège auto bébé', 30, 'per_day', false, 1, true),
('11111111-aaaa-bbbb-cccc-000000000003', 'Siège enfant', 'Siège auto enfant', 30, 'per_day', false, 2, true),
('11111111-aaaa-bbbb-cccc-000000000003', 'Conducteur additionnel', 'Conducteur supplémentaire', 50, 'per_day', false, 3, true),
('11111111-aaaa-bbbb-cccc-000000000003', 'GPS', 'Navigation GPS', 40, 'per_day', false, 4, true),
('11111111-aaaa-bbbb-cccc-000000000003', 'Livraison aéroport', 'Livraison aéroport Mohammed V', 100, 'fixed', false, 5, true),
('11111111-aaaa-bbbb-cccc-000000000003', 'Livraison hôtel', 'Livraison hôtel Casablanca', 80, 'fixed', false, 6, true),
('11111111-aaaa-bbbb-cccc-000000000003', 'Plein de carburant', 'Plein de carburant', 350, 'fixed', false, 7, true),

-- ATLANTIC CARS
('11111111-aaaa-bbbb-cccc-000000000004', 'Siège bébé', 'Siège auto bébé', 40, 'per_day', false, 1, true),
('11111111-aaaa-bbbb-cccc-000000000004', 'Siège enfant', 'Siège auto enfant', 40, 'per_day', false, 2, true),
('11111111-aaaa-bbbb-cccc-000000000004', 'Conducteur additionnel', 'Conducteur supplémentaire', 60, 'per_day', false, 3, true),
('11111111-aaaa-bbbb-cccc-000000000004', 'GPS', 'Navigation GPS', 50, 'per_day', false, 4, true),
('11111111-aaaa-bbbb-cccc-000000000004', 'WiFi embarqué', 'Hotspot WiFi 4G', 50, 'per_day', false, 5, true),
('11111111-aaaa-bbbb-cccc-000000000004', 'Livraison aéroport', 'Livraison aéroport Tanger', 150, 'fixed', false, 6, true),
('11111111-aaaa-bbbb-cccc-000000000004', 'Livraison hôtel', 'Livraison hôtel', 100, 'fixed', false, 7, true),
('11111111-aaaa-bbbb-cccc-000000000004', 'Plein de carburant', 'Plein de carburant', 400, 'fixed', false, 8, true),

-- PRESTIGE AUTO MAROC (GPS et WiFi inclus = price 0, mandatory)
('11111111-aaaa-bbbb-cccc-000000000005', 'Siège bébé', 'Siège auto premium bébé', 80, 'per_day', false, 1, true),
('11111111-aaaa-bbbb-cccc-000000000005', 'Siège enfant', 'Siège auto premium enfant', 80, 'per_day', false, 2, true),
('11111111-aaaa-bbbb-cccc-000000000005', 'Conducteur additionnel', 'Conducteur supplémentaire', 150, 'per_day', false, 3, true),
('11111111-aaaa-bbbb-cccc-000000000005', 'GPS', 'Navigation GPS (inclus)', 0, 'per_day', true, 4, true),
('11111111-aaaa-bbbb-cccc-000000000005', 'WiFi embarqué', 'WiFi haut débit (inclus)', 0, 'per_day', true, 5, true),
('11111111-aaaa-bbbb-cccc-000000000005', 'Chaînes neige', 'Chaînes neige premium', 100, 'per_day', false, 6, true),
('11111111-aaaa-bbbb-cccc-000000000005', 'Livraison aéroport', 'Livraison aéroport (inclus)', 0, 'fixed', true, 7, true),
('11111111-aaaa-bbbb-cccc-000000000005', 'Livraison hôtel', 'Livraison hôtel/riad (inclus)', 0, 'fixed', true, 8, true),
('11111111-aaaa-bbbb-cccc-000000000005', 'Plein de carburant', 'Plein de carburant premium', 800, 'fixed', false, 9, true),

-- FÈS AUTO LOCATION
('11111111-aaaa-bbbb-cccc-000000000006', 'Siège bébé', 'Siège auto bébé', 30, 'per_day', false, 1, true),
('11111111-aaaa-bbbb-cccc-000000000006', 'Siège enfant', 'Siège auto enfant', 30, 'per_day', false, 2, true),
('11111111-aaaa-bbbb-cccc-000000000006', 'Conducteur additionnel', 'Conducteur supplémentaire', 40, 'per_day', false, 3, true),
('11111111-aaaa-bbbb-cccc-000000000006', 'GPS', 'Navigation GPS', 40, 'per_day', false, 4, true),
('11111111-aaaa-bbbb-cccc-000000000006', 'Chaînes neige', 'Chaînes neige (recommandé Ifrane)', 80, 'per_day', false, 5, true),
('11111111-aaaa-bbbb-cccc-000000000006', 'Livraison hôtel', 'Livraison à votre hôtel/riad', 80, 'fixed', false, 6, true),
('11111111-aaaa-bbbb-cccc-000000000006', 'Plein de carburant', 'Plein de carburant', 300, 'fixed', false, 7, true);


-- =============================================================================
-- 4. PROMO CODES
-- =============================================================================

INSERT INTO public.consumer_promo_codes (code, description, discount_bps, applies_to_establishment_ids, active, is_public, starts_at, ends_at) VALUES
('HERTZ20',   'Réduction 20% Hertz Location — Mars 2026',    2000, ARRAY['11111111-aaaa-bbbb-cccc-000000000001']::uuid[], true, true, '2026-03-01'::timestamptz, '2026-03-31 23:59:59'::timestamptz),
('DESERT100', 'Réduction 10% SaharaCar — Printemps 2026',    1000, ARRAY['11111111-aaaa-bbbb-cccc-000000000002']::uuid[], true, true, '2026-03-01'::timestamptz, '2026-04-15 23:59:59'::timestamptz),
('BIENVENUE', 'Réduction 15% CasaRent — Bienvenue',          1500, ARRAY['11111111-aaaa-bbbb-cccc-000000000003']::uuid[], true, true, '2026-01-01'::timestamptz, '2027-12-31 23:59:59'::timestamptz),
('LUXE500',   'Réduction 20% Prestige Auto — Printemps 2026', 2000, ARRAY['11111111-aaaa-bbbb-cccc-000000000005']::uuid[], true, true, '2026-03-01'::timestamptz, '2026-06-30 23:59:59'::timestamptz),
('TANGER10',  'Réduction 10% Atlantic Cars — Tanger',         1000, ARRAY['11111111-aaaa-bbbb-cccc-000000000004']::uuid[], true, true, '2026-04-01'::timestamptz, '2026-05-31 23:59:59'::timestamptz),
('FES25',     'Réduction 25% Fès Auto — Printemps 2026',      2500, ARRAY['11111111-aaaa-bbbb-cccc-000000000006']::uuid[], true, true, '2026-03-15'::timestamptz, '2026-04-15 23:59:59'::timestamptz)
ON CONFLICT (code) DO NOTHING;


COMMIT;
