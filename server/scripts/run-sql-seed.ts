/**
 * Script to insert rental demo data via Supabase REST API
 * Handles: establishments, vehicles, options, promo codes
 *
 * Usage: npx tsx server/scripts/run-sql-seed.ts
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing env vars"); process.exit(1); }

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ========== 1. ESTABLISHMENTS ==========
const ESTABLISHMENTS = [
  {
    id: "11111111-aaaa-bbbb-cccc-000000000001",
    name: "Hertz Location Maroc",
    slug: "hertz-location-maroc-casablanca",
    universe: "rentacar",
    category: "location-vehicules",
    subcategory: "location-vehicules",
    city: "Casablanca",
    address: "Aéroport Mohammed V, Terminal 1, Nouaceur",
    country: "MA",
    region: "Casablanca-Settat",
    phone: "+212522539800",
    description_short: "Leader mondial de la location de véhicules, Hertz vous propose une flotte premium au Maroc avec un service irréprochable.",
    description_long: "Hertz Location Maroc vous accueille dans ses agences de Casablanca (Aéroport Mohammed V et Centre-ville) et Marrakech (Aéroport Menara). Flotte récente, véhicules parfaitement entretenus, et un service client disponible de 7h à 23h. Restitution inter-villes possible (Casablanca ↔ Marrakech, supplément 500 MAD). Caution standard : 5 000 MAD. Annulation flexible gratuite jusqu'à 24h avant.",
    hours: {"lundi":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]},"mardi":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]},"mercredi":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]},"jeudi":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]},"vendredi":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]},"samedi":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]},"dimanche":{"ouvert":true,"plages":[{"debut":"07:00","fin":"23:00"}]}},
    tags: ["location", "voiture", "aéroport", "premium", "hertz", "loueur-vérifié", "super-loueur"],
    amenities: ["parking", "wifi", "climatisation"],
    status: "active",
    is_online: true,
    verified: true,
    booking_enabled: true,
    avg_rating: 4.3,
    review_count: 187,
    lat: 33.3675,
    lng: -7.5898,
    extra: {"rental_commission_percent": 15, "cancellation_policy": "flexible", "default_deposit": 5000, "inter_city_return": true, "inter_city_supplement": 500},
    cover_url: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=1200&h=600&fit=crop&q=80",
    logo_url: "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=200&h=200&fit=crop&q=80",
  },
  {
    id: "11111111-aaaa-bbbb-cccc-000000000002",
    name: "SaharaCar",
    slug: "saharacar-marrakech",
    universe: "rentacar",
    category: "location-vehicules",
    subcategory: "location-vehicules",
    city: "Marrakech",
    address: "Zone Industrielle Sidi Ghanem, Rue 7, Marrakech",
    country: "MA",
    region: "Marrakech-Safi",
    phone: "+212524336700",
    description_short: "Spécialiste de la location tout-terrain et aventure dans le Sud marocain.",
    description_long: "SaharaCar est votre partenaire pour explorer le Sud marocain. Agences à Marrakech, Ouarzazate et Errachidia. Spécialistes des 4x4 et véhicules tout-terrain. Restitution inter-villes possible. Caution : 3 000 MAD.",
    hours: {"lundi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"mardi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"mercredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"jeudi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"vendredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"samedi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"dimanche":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]}},
    tags: ["location", "4x4", "désert", "aventure", "tout-terrain", "loueur-vérifié"],
    amenities: ["parking", "climatisation"],
    status: "active", is_online: true, verified: true, booking_enabled: true,
    avg_rating: 4.6, review_count: 94,
    lat: 31.6295, lng: -7.9811,
    extra: {"rental_commission_percent": 15, "cancellation_policy": "moderate", "default_deposit": 3000, "inter_city_return": true, "inter_city_supplement": 300},
    cover_url: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=1200&h=600&fit=crop&q=80",
    logo_url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=200&h=200&fit=crop&q=80",
  },
  {
    id: "11111111-aaaa-bbbb-cccc-000000000003",
    name: "CasaRent",
    slug: "casarent-casablanca",
    universe: "rentacar",
    category: "location-vehicules",
    subcategory: "location-vehicules",
    city: "Casablanca",
    address: "45 Rue Mohammed V, Centre-ville, Casablanca",
    country: "MA", region: "Casablanca-Settat",
    phone: "+212522267890",
    description_short: "Votre partenaire mobilité à Casablanca. Véhicules récents, prix compétitifs, service rapide.",
    description_long: "CasaRent est la référence de la location de véhicules à Casablanca. Trois points de retrait : Centre-ville, Aïn Diab et Aéroport Mohammed V. Caution : 2 000 MAD.",
    hours: {"lundi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"21:00"}]},"mardi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"21:00"}]},"mercredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"21:00"}]},"jeudi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"21:00"}]},"vendredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"21:00"}]},"samedi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"21:00"}]},"dimanche":{"ouvert":true,"plages":[{"debut":"09:00","fin":"18:00"}]}},
    tags: ["location", "voiture", "économique", "casablanca", "électrique", "loueur-vérifié", "super-loueur"],
    amenities: ["parking", "wifi", "climatisation", "borne-recharge"],
    status: "active", is_online: true, verified: true, booking_enabled: true,
    avg_rating: 4.1, review_count: 256,
    lat: 33.5731, lng: -7.5898,
    extra: {"rental_commission_percent": 15, "cancellation_policy": "flexible", "default_deposit": 2000, "inter_city_return": false},
    cover_url: "https://images.unsplash.com/photo-1485291571150-772bcfc10da5?w=1200&h=600&fit=crop&q=80",
    logo_url: "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=200&h=200&fit=crop&q=80",
  },
  {
    id: "11111111-aaaa-bbbb-cccc-000000000004",
    name: "Atlantic Cars",
    slug: "atlantic-cars-tanger",
    universe: "rentacar",
    category: "location-vehicules",
    subcategory: "location-vehicules",
    city: "Tanger",
    address: "12 Avenue Mohammed VI, Tanger",
    country: "MA", region: "Tanger-Tétouan-Al Hoceïma",
    phone: "+212539945600",
    description_short: "Location de véhicules sur tout le littoral atlantique nord.",
    description_long: "Atlantic Cars dessert les villes du nord du Maroc : Tanger, Rabat et Kénitra. Caution : 3 000 MAD.",
    hours: {"lundi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"mardi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"mercredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"jeudi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"vendredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"samedi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]},"dimanche":{"ouvert":true,"plages":[{"debut":"08:00","fin":"20:00"}]}},
    tags: ["location", "voiture", "tanger", "rabat", "nord", "loueur-vérifié"],
    amenities: ["parking", "climatisation"],
    status: "active", is_online: true, verified: true, booking_enabled: true,
    avg_rating: 4.0, review_count: 132,
    lat: 35.7595, lng: -5.834,
    extra: {"rental_commission_percent": 15, "cancellation_policy": "moderate", "default_deposit": 3000, "inter_city_return": true, "inter_city_supplement": 200},
    cover_url: "https://images.unsplash.com/photo-1502877338535-766e1452684a?w=1200&h=600&fit=crop&q=80",
    logo_url: "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=200&h=200&fit=crop&q=80",
  },
  {
    id: "11111111-aaaa-bbbb-cccc-000000000005",
    name: "Prestige Auto Maroc",
    slug: "prestige-auto-maroc-casablanca",
    universe: "rentacar",
    category: "location-vehicules",
    subcategory: "location-vehicules",
    city: "Casablanca",
    address: "88 Boulevard de la Corniche, Aïn Diab, Casablanca",
    country: "MA", region: "Casablanca-Settat",
    phone: "+212522797800",
    description_short: "Découvrez le Maroc au volant de véhicules d'exception.",
    description_long: "Prestige Auto Maroc est le spécialiste de la location de véhicules haut de gamme au Maroc. Mercedes Classe S, BMW Série 7, Porsche 911, Range Rover. Caution : 15 000 MAD.",
    hours: {"lundi":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]},"mardi":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]},"mercredi":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]},"jeudi":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]},"vendredi":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]},"samedi":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]},"dimanche":{"ouvert":true,"plages":[{"debut":"09:00","fin":"21:00"}]}},
    tags: ["location", "luxe", "premium", "mercedes", "bmw", "porsche", "range-rover", "loueur-vérifié", "super-loueur"],
    amenities: ["parking", "wifi", "climatisation", "chauffeur"],
    status: "active", is_online: true, verified: true, booking_enabled: true,
    avg_rating: 4.8, review_count: 67,
    lat: 33.592, lng: -7.67,
    extra: {"rental_commission_percent": 15, "cancellation_policy": "strict", "default_deposit": 15000, "inter_city_return": true, "inter_city_supplement": 800},
    cover_url: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&h=600&fit=crop&q=80",
    logo_url: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=200&h=200&fit=crop&q=80",
  },
  {
    id: "11111111-aaaa-bbbb-cccc-000000000006",
    name: "Fès Auto Location",
    slug: "fes-auto-location-fes",
    universe: "rentacar",
    category: "location-vehicules",
    subcategory: "location-vehicules",
    city: "Fès",
    address: "23 Avenue Hassan II, Ville Nouvelle, Fès",
    country: "MA", region: "Fès-Meknès",
    phone: "+212535654300",
    description_short: "Explorer le Maroc impérial et le Moyen Atlas à votre rythme.",
    description_long: "Fès Auto Location vous accompagne dans la découverte du Maroc impérial et du Moyen Atlas. Agences à Fès, Meknès et Ifrane. Caution : 2 500 MAD.",
    hours: {"lundi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"19:00"}]},"mardi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"19:00"}]},"mercredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"19:00"}]},"jeudi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"19:00"}]},"vendredi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"19:00"}]},"samedi":{"ouvert":true,"plages":[{"debut":"08:00","fin":"19:00"}]},"dimanche":{"ouvert":false,"plages":[]}},
    tags: ["location", "voiture", "fès", "moyen-atlas", "ifrane", "familial", "loueur-vérifié"],
    amenities: ["parking", "climatisation"],
    status: "active", is_online: true, verified: true, booking_enabled: true,
    avg_rating: 4.4, review_count: 78,
    lat: 34.0181, lng: -5.0078,
    extra: {"rental_commission_percent": 15, "cancellation_policy": "flexible", "default_deposit": 2500, "inter_city_return": true, "inter_city_supplement": 150},
    cover_url: "https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=1200&h=600&fit=crop&q=80",
    logo_url: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=200&h=200&fit=crop&q=80",
  },
];

async function main() {
  // ========== STEP 1: ESTABLISHMENTS ==========
  console.log("=== ÉTAPE 1/4 : Insertion des 6 établissements ===\n");

  const { data: estData, error: estErr } = await supabase
    .from("establishments")
    .upsert(ESTABLISHMENTS, { onConflict: "id" })
    .select("id, name");

  if (estErr) {
    console.error("❌ Erreur établissements:", estErr.message);
    console.error("   Détails:", JSON.stringify(estErr, null, 2));
    process.exit(1);
  }

  console.log(`✅ ${estData?.length || 0} établissements insérés/mis à jour:`);
  estData?.forEach((e: any) => console.log(`   - ${e.name} (${e.id})`));
  console.log("");

  // ========== STEP 2: VEHICLES ==========
  console.log("=== ÉTAPE 2/4 : Insertion des véhicules ===\n");

  const HIGH_SEASON = [{"start":"2026-07-01","end":"2026-08-31"},{"start":"2026-12-15","end":"2027-01-05"}];

  const VEHICLES: any[] = [];

  // Helper
  const v = (estId: string, vId: string, cat: string, brand: string, model: string, year: number, specs: any, pricing: any, opts: any = {}) => {
    VEHICLES.push({
      id: vId,
      establishment_id: estId,
      category: cat,
      brand, model, year,
      photos: opts.photos || [
        "https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=500&fit=crop&q=80",
        "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=500&fit=crop&q=80",
        "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=500&fit=crop&q=80",
      ],
      specs,
      mileage_policy: opts.mileage_policy || "unlimited",
      mileage_limit_per_day: opts.mileage_limit_per_day || null,
      extra_km_cost: opts.extra_km_cost || null,
      pricing,
      high_season_dates: HIGH_SEASON,
      quantity: opts.quantity || 3,
      similar_vehicle: opts.similar_vehicle ?? false,
      similar_models: opts.similar_models || null,
      status: "active",
      sort_order: VEHICLES.length,
    });
  };

  const HERTZ = "11111111-aaaa-bbbb-cccc-000000000001";
  const SAHARA = "11111111-aaaa-bbbb-cccc-000000000002";
  const CASA = "11111111-aaaa-bbbb-cccc-000000000003";
  const ATLANTIC = "11111111-aaaa-bbbb-cccc-000000000004";
  const PRESTIGE = "11111111-aaaa-bbbb-cccc-000000000005";
  const FES = "11111111-aaaa-bbbb-cccc-000000000006";

  // ---- HERTZ (15 vehicles) ----
  v(HERTZ, "22222222-0001-0001-0001-000000000001", "citadine", "Dacia", "Sandero", 2024,
    {seats:5, doors:5, transmission:"manuelle", ac:true, fuel_type:"essence", trunk_volume:"328L"},
    {standard:250, weekend:300, high_season:325, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:5, similar_vehicle:true, similar_models:["Renault Clio","Peugeot 208"], photos:["https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=500&fit=crop&q=80","https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=500&fit=crop&q=80","https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=500&fit=crop&q=80"]});
  v(HERTZ, "22222222-0001-0001-0001-000000000002", "citadine", "Renault", "Clio 5", 2024,
    {seats:5, doors:5, transmission:"manuelle", ac:true, fuel_type:"essence", trunk_volume:"340L"},
    {standard:280, weekend:340, high_season:365, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:4, photos:["https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&h=500&fit=crop&q=80","https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=500&fit=crop&q=80","https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=500&fit=crop&q=80"]});
  v(HERTZ, "22222222-0001-0001-0001-000000000003", "compacte", "Volkswagen", "Golf 8", 2024,
    {seats:5, doors:5, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"380L"},
    {standard:400, weekend:480, high_season:520, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:3, photos:["https://images.unsplash.com/photo-1502877338535-766e1452684a?w=800&h=500&fit=crop&q=80","https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=500&fit=crop&q=80","https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=500&fit=crop&q=80"]});
  v(HERTZ, "22222222-0001-0001-0001-000000000004", "compacte", "Peugeot", "308", 2023,
    {seats:5, doors:5, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"412L"},
    {standard:380, weekend:450, high_season:495, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:3});
  v(HERTZ, "22222222-0001-0001-0001-000000000005", "berline", "Renault", "Megane", 2024,
    {seats:5, doors:4, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"445L"},
    {standard:450, weekend:540, high_season:585, long_duration_discount:{min_days:7, discount_percent:15}},
    {quantity:2});
  v(HERTZ, "22222222-0001-0001-0001-000000000006", "berline", "Peugeot", "508", 2024,
    {seats:5, doors:4, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"487L"},
    {standard:550, weekend:660, high_season:715, long_duration_discount:{min_days:7, discount_percent:15}},
    {quantity:2});
  v(HERTZ, "22222222-0001-0001-0001-000000000007", "suv", "Dacia", "Duster", 2024,
    {seats:5, doors:5, transmission:"manuelle", ac:true, fuel_type:"diesel", trunk_volume:"445L"},
    {standard:400, weekend:480, high_season:520, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:4, similar_vehicle:true, similar_models:["Hyundai Tucson"]});
  v(HERTZ, "22222222-0001-0001-0001-000000000008", "suv", "Hyundai", "Tucson", 2024,
    {seats:5, doors:5, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"510L"},
    {standard:500, weekend:600, high_season:650, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:3});
  v(HERTZ, "22222222-0001-0001-0001-000000000009", "suv", "Toyota", "RAV4", 2024,
    {seats:5, doors:5, transmission:"automatique", ac:true, fuel_type:"hybride", trunk_volume:"580L"},
    {standard:600, weekend:720, high_season:780, long_duration_discount:{min_days:7, discount_percent:15}},
    {quantity:2});
  v(HERTZ, "22222222-0001-0001-0001-000000000010", "4x4", "Toyota", "Land Cruiser", 2023,
    {seats:7, doors:5, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"620L"},
    {standard:900, weekend:1080, high_season:1170, long_duration_discount:{min_days:7, discount_percent:15}},
    {quantity:2});
  v(HERTZ, "22222222-0001-0001-0001-000000000011", "monospace", "Renault", "Grand Scénic", 2023,
    {seats:7, doors:5, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"596L"},
    {standard:550, weekend:660, high_season:715, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:2});
  v(HERTZ, "22222222-0001-0001-0001-000000000012", "utilitaire", "Renault", "Kangoo", 2024,
    {seats:2, doors:4, transmission:"manuelle", ac:true, fuel_type:"diesel", trunk_volume:"3300L"},
    {standard:350, weekend:420, high_season:455, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:3});
  v(HERTZ, "22222222-0001-0001-0001-000000000013", "utilitaire", "Peugeot", "Partner", 2024,
    {seats:3, doors:4, transmission:"manuelle", ac:true, fuel_type:"diesel", trunk_volume:"3500L"},
    {standard:380, weekend:450, high_season:495, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:2});
  v(HERTZ, "22222222-0001-0001-0001-000000000014", "luxe", "Mercedes-Benz", "Classe E", 2024,
    {seats:5, doors:4, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"540L"},
    {standard:1200, weekend:1440, high_season:1560, long_duration_discount:{min_days:7, discount_percent:15}},
    {quantity:1});
  v(HERTZ, "22222222-0001-0001-0001-000000000015", "electrique", "Renault", "Zoe", 2024,
    {seats:5, doors:5, transmission:"automatique", ac:true, fuel_type:"electrique", trunk_volume:"338L"},
    {standard:350, weekend:420, high_season:455, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:2});

  // ---- SAHARACAR (8 vehicles) ----
  v(SAHARA, "22222222-0002-0001-0001-000000000001", "citadine", "Fiat", "Panda", 2023,
    {seats:5, doors:5, transmission:"manuelle", ac:true, fuel_type:"essence", trunk_volume:"225L"},
    {standard:200, weekend:240, high_season:260, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:4, photos:["https://images.unsplash.com/photo-1609521263047-f8f205293f24?w=800&h=500&fit=crop&q=80","https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800&h=500&fit=crop&q=80","https://images.unsplash.com/photo-1549317661-bd32c8ce0afa?w=800&h=500&fit=crop&q=80"]});
  v(SAHARA, "22222222-0002-0001-0001-000000000002", "suv", "Dacia", "Duster", 2024,
    {seats:5, doors:5, transmission:"manuelle", ac:true, fuel_type:"diesel", trunk_volume:"445L"},
    {standard:350, weekend:420, high_season:455, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:5, similar_vehicle:true, similar_models:["Suzuki Vitara"]});
  v(SAHARA, "22222222-0002-0001-0001-000000000003", "4x4", "Toyota", "Hilux", 2023,
    {seats:5, doors:4, transmission:"manuelle", ac:true, fuel_type:"diesel", trunk_volume:"Grand benne"},
    {standard:700, weekend:840, high_season:910, long_duration_discount:{min_days:7, discount_percent:15}},
    {quantity:3});
  v(SAHARA, "22222222-0002-0001-0001-000000000004", "4x4", "Toyota", "Land Cruiser Prado", 2023,
    {seats:7, doors:5, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"550L"},
    {standard:900, weekend:1080, high_season:1170, long_duration_discount:{min_days:7, discount_percent:15}},
    {quantity:2});
  v(SAHARA, "22222222-0002-0001-0001-000000000005", "4x4", "Mitsubishi", "Pajero", 2022,
    {seats:7, doors:5, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"500L"},
    {standard:800, weekend:960, high_season:1040, long_duration_discount:{min_days:7, discount_percent:15}},
    {quantity:2});
  v(SAHARA, "22222222-0002-0001-0001-000000000006", "compacte", "Hyundai", "i20", 2024,
    {seats:5, doors:5, transmission:"manuelle", ac:true, fuel_type:"essence", trunk_volume:"352L"},
    {standard:280, weekend:340, high_season:365, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:3});
  v(SAHARA, "22222222-0002-0001-0001-000000000007", "berline", "Hyundai", "Elantra", 2024,
    {seats:5, doors:4, transmission:"automatique", ac:true, fuel_type:"essence", trunk_volume:"402L"},
    {standard:400, weekend:480, high_season:520, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:2});
  v(SAHARA, "22222222-0002-0001-0001-000000000008", "utilitaire", "Renault", "Master", 2023,
    {seats:3, doors:4, transmission:"manuelle", ac:true, fuel_type:"diesel", trunk_volume:"10400L"},
    {standard:500, weekend:600, high_season:650, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:2, mileage_policy:"limited", mileage_limit_per_day:250, extra_km_cost:2});

  // ---- CASARENT (10 vehicles) ----
  v(CASA, "22222222-0003-0001-0001-000000000001", "citadine", "Dacia", "Sandero", 2024,
    {seats:5, doors:5, transmission:"manuelle", ac:true, fuel_type:"essence", trunk_volume:"328L"},
    {standard:220, weekend:265, high_season:290, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:6, similar_vehicle:true, similar_models:["Fiat Punto","Hyundai i10"]});
  v(CASA, "22222222-0003-0001-0001-000000000002", "citadine", "Peugeot", "208", 2024,
    {seats:5, doors:5, transmission:"manuelle", ac:true, fuel_type:"essence", trunk_volume:"311L"},
    {standard:260, weekend:310, high_season:340, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:4});
  v(CASA, "22222222-0003-0001-0001-000000000003", "compacte", "Renault", "Clio 5", 2024,
    {seats:5, doors:5, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"340L"},
    {standard:300, weekend:360, high_season:390, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:5});
  v(CASA, "22222222-0003-0001-0001-000000000004", "suv", "Dacia", "Duster", 2024,
    {seats:5, doors:5, transmission:"manuelle", ac:true, fuel_type:"diesel", trunk_volume:"445L"},
    {standard:380, weekend:460, high_season:495, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:4});
  v(CASA, "22222222-0003-0001-0001-000000000005", "suv", "Peugeot", "3008", 2024,
    {seats:5, doors:5, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"520L"},
    {standard:500, weekend:600, high_season:650, long_duration_discount:{min_days:7, discount_percent:15}},
    {quantity:3});
  v(CASA, "22222222-0003-0001-0001-000000000006", "berline", "Volkswagen", "Passat", 2024,
    {seats:5, doors:4, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"586L"},
    {standard:500, weekend:600, high_season:650, long_duration_discount:{min_days:7, discount_percent:15}},
    {quantity:2});
  v(CASA, "22222222-0003-0001-0001-000000000007", "monospace", "Peugeot", "5008", 2024,
    {seats:7, doors:5, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"780L"},
    {standard:550, weekend:660, high_season:715, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:2});
  v(CASA, "22222222-0003-0001-0001-000000000008", "utilitaire", "Citroën", "Berlingo", 2024,
    {seats:2, doors:4, transmission:"manuelle", ac:true, fuel_type:"diesel", trunk_volume:"3200L"},
    {standard:300, weekend:360, high_season:390, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:3});
  v(CASA, "22222222-0003-0001-0001-000000000009", "electrique", "Renault", "Zoe", 2024,
    {seats:5, doors:5, transmission:"automatique", ac:true, fuel_type:"electrique", trunk_volume:"338L"},
    {standard:300, weekend:360, high_season:390, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:2});
  v(CASA, "22222222-0003-0001-0001-000000000010", "electrique", "Peugeot", "e-208", 2024,
    {seats:5, doors:5, transmission:"automatique", ac:true, fuel_type:"electrique", trunk_volume:"311L"},
    {standard:350, weekend:420, high_season:455, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:1});

  // ---- ATLANTIC CARS (8 vehicles) ----
  v(ATLANTIC, "22222222-0004-0001-0001-000000000001", "citadine", "Dacia", "Sandero", 2023,
    {seats:5, doors:5, transmission:"manuelle", ac:true, fuel_type:"essence", trunk_volume:"328L"},
    {standard:230, weekend:275, high_season:300, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:4});
  v(ATLANTIC, "22222222-0004-0001-0001-000000000002", "compacte", "Renault", "Megane", 2024,
    {seats:5, doors:5, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"384L"},
    {standard:350, weekend:420, high_season:455, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:3});
  v(ATLANTIC, "22222222-0004-0001-0001-000000000003", "suv", "Hyundai", "Tucson", 2024,
    {seats:5, doors:5, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"510L"},
    {standard:480, weekend:575, high_season:625, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:3});
  v(ATLANTIC, "22222222-0004-0001-0001-000000000004", "berline", "Peugeot", "508", 2023,
    {seats:5, doors:4, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"487L"},
    {standard:500, weekend:600, high_season:650, long_duration_discount:{min_days:7, discount_percent:15}},
    {quantity:2});
  v(ATLANTIC, "22222222-0004-0001-0001-000000000005", "monospace", "Volkswagen", "Touran", 2023,
    {seats:7, doors:5, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"743L"},
    {standard:500, weekend:600, high_season:650, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:2});
  v(ATLANTIC, "22222222-0004-0001-0001-000000000006", "utilitaire", "Ford", "Transit", 2023,
    {seats:3, doors:4, transmission:"manuelle", ac:true, fuel_type:"diesel", trunk_volume:"9500L"},
    {standard:450, weekend:540, high_season:585, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:3, mileage_policy:"limited", mileage_limit_per_day:300, extra_km_cost:1.5});
  v(ATLANTIC, "22222222-0004-0001-0001-000000000007", "4x4", "Nissan", "Patrol", 2023,
    {seats:7, doors:5, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"550L"},
    {standard:850, weekend:1020, high_season:1105, long_duration_discount:{min_days:7, discount_percent:15}},
    {quantity:1});
  v(ATLANTIC, "22222222-0004-0001-0001-000000000008", "cabriolet", "MINI", "Cooper S Cabriolet", 2024,
    {seats:4, doors:2, transmission:"automatique", ac:true, fuel_type:"essence", trunk_volume:"160L"},
    {standard:700, weekend:840, high_season:910, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:1});

  // ---- PRESTIGE AUTO MAROC (12 vehicles) ----
  v(PRESTIGE, "22222222-0005-0001-0001-000000000001", "luxe", "Mercedes-Benz", "Classe S", 2024,
    {seats:5, doors:4, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"550L"},
    {standard:2500, weekend:3000, high_season:3250, long_duration_discount:{min_days:7, discount_percent:15}},
    {quantity:2, photos:["https://images.unsplash.com/photo-1563720223185-11003d516935?w=800&h=500&fit=crop&q=80","https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&h=500&fit=crop&q=80","https://images.unsplash.com/photo-1555215695-3004980ad54e?w=800&h=500&fit=crop&q=80"]});
  v(PRESTIGE, "22222222-0005-0001-0001-000000000002", "luxe", "BMW", "Série 7", 2024,
    {seats:5, doors:4, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"515L"},
    {standard:2500, weekend:3000, high_season:3250, long_duration_discount:{min_days:7, discount_percent:15}},
    {quantity:2});
  v(PRESTIGE, "22222222-0005-0001-0001-000000000003", "luxe", "Audi", "A8", 2024,
    {seats:5, doors:4, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"505L"},
    {standard:2500, weekend:3000, high_season:3250, long_duration_discount:{min_days:7, discount_percent:15}},
    {quantity:1});
  v(PRESTIGE, "22222222-0005-0001-0001-000000000004", "sport", "Porsche", "911 Carrera", 2024,
    {seats:4, doors:2, transmission:"automatique", ac:true, fuel_type:"essence", trunk_volume:"132L"},
    {standard:4000, weekend:4800, high_season:5200, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:1});
  v(PRESTIGE, "22222222-0005-0001-0001-000000000005", "sport", "Mercedes-AMG", "GT", 2024,
    {seats:2, doors:2, transmission:"automatique", ac:true, fuel_type:"essence", trunk_volume:"350L"},
    {standard:5000, weekend:6000, high_season:6500, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:1});
  v(PRESTIGE, "22222222-0005-0001-0001-000000000006", "cabriolet", "Mercedes-Benz", "Classe C Cabriolet", 2024,
    {seats:4, doors:2, transmission:"automatique", ac:true, fuel_type:"essence", trunk_volume:"285L"},
    {standard:2000, weekend:2400, high_season:2600, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:1});
  v(PRESTIGE, "22222222-0005-0001-0001-000000000007", "cabriolet", "BMW", "Série 4 Cabriolet", 2024,
    {seats:4, doors:2, transmission:"automatique", ac:true, fuel_type:"essence", trunk_volume:"300L"},
    {standard:2000, weekend:2400, high_season:2600, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:1});
  v(PRESTIGE, "22222222-0005-0001-0001-000000000008", "suv", "Range Rover", "Vogue", 2024,
    {seats:5, doors:5, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"818L"},
    {standard:3000, weekend:3600, high_season:3900, long_duration_discount:{min_days:7, discount_percent:15}},
    {quantity:2});
  v(PRESTIGE, "22222222-0005-0001-0001-000000000009", "suv", "Porsche", "Cayenne", 2024,
    {seats:5, doors:5, transmission:"automatique", ac:true, fuel_type:"hybride", trunk_volume:"726L"},
    {standard:3500, weekend:4200, high_season:4550, long_duration_discount:{min_days:7, discount_percent:15}},
    {quantity:1});
  v(PRESTIGE, "22222222-0005-0001-0001-000000000010", "berline", "Mercedes-Benz", "Classe E", 2024,
    {seats:5, doors:4, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"540L"},
    {standard:1500, weekend:1800, high_season:1950, long_duration_discount:{min_days:7, discount_percent:15}},
    {quantity:2});
  v(PRESTIGE, "22222222-0005-0001-0001-000000000011", "berline", "BMW", "Série 5", 2024,
    {seats:5, doors:4, transmission:"automatique", ac:true, fuel_type:"diesel", trunk_volume:"530L"},
    {standard:1500, weekend:1800, high_season:1950, long_duration_discount:{min_days:7, discount_percent:15}},
    {quantity:2});
  v(PRESTIGE, "22222222-0005-0001-0001-000000000012", "electrique", "Tesla", "Model 3", 2024,
    {seats:5, doors:4, transmission:"automatique", ac:true, fuel_type:"electrique", trunk_volume:"425L"},
    {standard:1200, weekend:1440, high_season:1560, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:1});

  // ---- FÈS AUTO (8 vehicles) ----
  v(FES, "22222222-0006-0001-0001-000000000001", "citadine", "Dacia", "Sandero", 2023,
    {seats:5, doors:5, transmission:"manuelle", ac:true, fuel_type:"essence", trunk_volume:"328L"},
    {standard:200, weekend:240, high_season:260, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:5});
  v(FES, "22222222-0006-0001-0001-000000000002", "citadine", "Hyundai", "i10", 2024,
    {seats:5, doors:5, transmission:"manuelle", ac:true, fuel_type:"essence", trunk_volume:"252L"},
    {standard:180, weekend:215, high_season:235, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:4});
  v(FES, "22222222-0006-0001-0001-000000000003", "compacte", "Renault", "Clio 5", 2024,
    {seats:5, doors:5, transmission:"manuelle", ac:true, fuel_type:"essence", trunk_volume:"340L"},
    {standard:260, weekend:310, high_season:340, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:3});
  v(FES, "22222222-0006-0001-0001-000000000004", "suv", "Dacia", "Duster", 2024,
    {seats:5, doors:5, transmission:"manuelle", ac:true, fuel_type:"diesel", trunk_volume:"445L"},
    {standard:350, weekend:420, high_season:455, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:3});
  v(FES, "22222222-0006-0001-0001-000000000005", "4x4", "Mitsubishi", "L200", 2023,
    {seats:5, doors:4, transmission:"manuelle", ac:true, fuel_type:"diesel", trunk_volume:"Grand benne"},
    {standard:600, weekend:720, high_season:780, long_duration_discount:{min_days:7, discount_percent:15}},
    {quantity:2});
  v(FES, "22222222-0006-0001-0001-000000000006", "berline", "Peugeot", "301", 2023,
    {seats:5, doors:4, transmission:"manuelle", ac:true, fuel_type:"diesel", trunk_volume:"506L"},
    {standard:300, weekend:360, high_season:390, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:3});
  v(FES, "22222222-0006-0001-0001-000000000007", "monospace", "Dacia", "Lodgy", 2023,
    {seats:7, doors:5, transmission:"manuelle", ac:true, fuel_type:"diesel", trunk_volume:"827L"},
    {standard:350, weekend:420, high_season:455, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:2});
  v(FES, "22222222-0006-0001-0001-000000000008", "utilitaire", "Renault", "Kangoo", 2023,
    {seats:2, doors:4, transmission:"manuelle", ac:true, fuel_type:"diesel", trunk_volume:"3300L"},
    {standard:280, weekend:340, high_season:365, long_duration_discount:{min_days:7, discount_percent:10}},
    {quantity:2, mileage_policy:"limited", mileage_limit_per_day:200, extra_km_cost:2});

  console.log(`   Insérant ${VEHICLES.length} véhicules...`);

  // Insert in batches of 15
  for (let i = 0; i < VEHICLES.length; i += 15) {
    const batch = VEHICLES.slice(i, i + 15);
    const { error: vErr } = await supabase.from("rental_vehicles").upsert(batch, { onConflict: "id" });
    if (vErr) {
      console.error(`❌ Erreur véhicules batch ${i}:`, vErr.message);
      process.exit(1);
    }
    console.log(`   ✅ Batch ${Math.floor(i/15) + 1}/${Math.ceil(VEHICLES.length/15)} inséré`);
  }
  console.log(`✅ ${VEHICLES.length} véhicules insérés\n`);

  // ========== STEP 3: OPTIONS ==========
  console.log("=== ÉTAPE 3/4 : Insertion des options ===\n");

  const OPTIONS: any[] = [];
  const opt = (estId: string, name: string, desc: string, price: number, priceType: string, isMandatory: boolean, sortOrder: number) => {
    OPTIONS.push({
      establishment_id: estId,
      name, description: desc, price, price_type: priceType,
      is_mandatory: isMandatory, sort_order: sortOrder, is_active: true,
    });
  };

  // HERTZ options
  opt(HERTZ, "Siège bébé", "Siège bébé (0-18 mois)", 50, "per_day", false, 1);
  opt(HERTZ, "Siège enfant", "Siège enfant rehausseur (3-12 ans)", 40, "per_day", false, 2);
  opt(HERTZ, "Conducteur additionnel", "Second conducteur déclaré", 60, "per_day", false, 3);
  opt(HERTZ, "GPS", "GPS TomTom intégré", 50, "per_day", false, 4);
  opt(HERTZ, "WiFi portable", "Hotspot WiFi 4G", 40, "per_day", false, 5);
  opt(HERTZ, "Chaînes neige", "Kit chaînes neige", 100, "fixed", false, 6);
  opt(HERTZ, "Livraison aéroport", "Livraison à l'aéroport", 0, "fixed", false, 7);
  opt(HERTZ, "Livraison hôtel", "Livraison à l'hôtel", 150, "fixed", false, 8);
  opt(HERTZ, "Plein carburant", "Véhicule livré avec le plein", 350, "fixed", false, 9);

  // SAHARACAR options
  opt(SAHARA, "Siège bébé", "Siège bébé (0-18 mois)", 40, "per_day", false, 1);
  opt(SAHARA, "Conducteur additionnel", "Second conducteur déclaré", 50, "per_day", false, 2);
  opt(SAHARA, "GPS", "GPS embarqué", 40, "per_day", false, 3);
  opt(SAHARA, "Chaînes neige", "Kit chaînes neige/sable", 80, "fixed", false, 4);
  opt(SAHARA, "Livraison aéroport", "Livraison aéroport Menara", 100, "fixed", false, 5);
  opt(SAHARA, "Plein carburant", "Véhicule livré avec le plein", 300, "fixed", false, 6);
  opt(SAHARA, "Kit désert", "Pelle, plaques désensablage, jerrycan", 200, "fixed", false, 7);

  // CASARENT options
  opt(CASA, "Siège bébé", "Siège bébé (0-18 mois)", 40, "per_day", false, 1);
  opt(CASA, "Siège enfant", "Siège enfant rehausseur", 30, "per_day", false, 2);
  opt(CASA, "Conducteur additionnel", "Second conducteur", 50, "per_day", false, 3);
  opt(CASA, "GPS", "GPS intégré", 40, "per_day", false, 4);
  opt(CASA, "WiFi portable", "Hotspot WiFi 4G", 30, "per_day", false, 5);
  opt(CASA, "Livraison aéroport", "Livraison aéroport Mohammed V", 0, "fixed", false, 6);
  opt(CASA, "Plein carburant", "Véhicule livré avec le plein", 300, "fixed", false, 7);

  // ATLANTIC options
  opt(ATLANTIC, "Siège bébé", "Siège bébé", 45, "per_day", false, 1);
  opt(ATLANTIC, "Siège enfant", "Siège rehausseur", 35, "per_day", false, 2);
  opt(ATLANTIC, "Conducteur additionnel", "Second conducteur", 55, "per_day", false, 3);
  opt(ATLANTIC, "GPS", "GPS navigation", 45, "per_day", false, 4);
  opt(ATLANTIC, "Livraison gare", "Livraison gare Tanger Ville", 80, "fixed", false, 5);
  opt(ATLANTIC, "Livraison aéroport", "Livraison aéroport Ibn Battouta", 120, "fixed", false, 6);
  opt(ATLANTIC, "Plein carburant", "Plein de carburant", 320, "fixed", false, 7);

  // PRESTIGE options (many included/mandatory)
  opt(PRESTIGE, "GPS", "GPS intégré (inclus)", 0, "per_day", true, 1);
  opt(PRESTIGE, "WiFi portable", "Hotspot WiFi (inclus)", 0, "per_day", true, 2);
  opt(PRESTIGE, "Livraison aéroport", "Livraison aéroport (offerte)", 0, "fixed", true, 3);
  opt(PRESTIGE, "Livraison hôtel", "Livraison hôtel (offerte)", 0, "fixed", true, 4);
  opt(PRESTIGE, "Conducteur additionnel", "Second conducteur", 100, "per_day", false, 5);
  opt(PRESTIGE, "Chauffeur privé", "Chauffeur professionnel", 800, "per_day", false, 6);
  opt(PRESTIGE, "Plein carburant", "Plein de carburant premium", 500, "fixed", false, 7);

  // FES AUTO options
  opt(FES, "Siège bébé", "Siège bébé", 35, "per_day", false, 1);
  opt(FES, "Siège enfant", "Siège rehausseur", 25, "per_day", false, 2);
  opt(FES, "Conducteur additionnel", "Second conducteur", 40, "per_day", false, 3);
  opt(FES, "GPS", "GPS navigation", 35, "per_day", false, 4);
  opt(FES, "Chaînes neige", "Kit chaînes neige (Ifrane/Moyen Atlas)", 80, "fixed", false, 5);
  opt(FES, "Livraison gare", "Livraison gare Fès", 60, "fixed", false, 6);
  opt(FES, "Plein carburant", "Plein de carburant", 280, "fixed", false, 7);

  const { error: optErr } = await supabase.from("rental_options").upsert(OPTIONS, { onConflict: "id", ignoreDuplicates: true });
  if (optErr) {
    console.error("❌ Erreur options:", optErr.message);
    // Not fatal - options may conflict on generated IDs, try insert instead
    const { error: optInsertErr } = await supabase.from("rental_options").insert(OPTIONS);
    if (optInsertErr) {
      console.error("❌ Erreur insert options:", optInsertErr.message);
    } else {
      console.log(`✅ ${OPTIONS.length} options insérées\n`);
    }
  } else {
    console.log(`✅ ${OPTIONS.length} options insérées\n`);
  }

  // ========== STEP 4: PROMO CODES ==========
  console.log("=== ÉTAPE 4/4 : Insertion des codes promo ===\n");

  const PROMOS = [
    { code: "HERTZ20", description: "20% de réduction chez Hertz", discount_bps: 2000, applies_to_establishment_ids: [HERTZ], active: true, is_public: true, starts_at: "2026-03-01", ends_at: "2026-03-31", max_uses_total: 100, max_uses_per_user: 1 },
    { code: "DESERT100", description: "100 MAD de réduction chez SaharaCar", discount_bps: 1500, applies_to_establishment_ids: [SAHARA], active: true, is_public: true, starts_at: "2026-03-01", ends_at: "2026-04-15", max_uses_total: 50, max_uses_per_user: 1 },
    { code: "BIENVENUE", description: "15% de bienvenue chez CasaRent", discount_bps: 1500, applies_to_establishment_ids: [CASA], active: true, is_public: true, starts_at: "2026-01-01", ends_at: "2027-12-31", max_uses_total: 500, max_uses_per_user: 1 },
    { code: "LUXE500", description: "500 MAD de réduction Prestige", discount_bps: 1000, applies_to_establishment_ids: [PRESTIGE], active: true, is_public: true, starts_at: "2026-03-01", ends_at: "2026-06-30", max_uses_total: 30, max_uses_per_user: 1 },
    { code: "TANGER10", description: "10% Atlantic Cars", discount_bps: 1000, applies_to_establishment_ids: [ATLANTIC], active: true, is_public: true, starts_at: "2026-04-01", ends_at: "2026-05-31", max_uses_total: 80, max_uses_per_user: 1 },
    { code: "FES25", description: "25% Fès Auto Location", discount_bps: 2500, applies_to_establishment_ids: [FES], active: true, is_public: true, starts_at: "2026-03-15", ends_at: "2026-04-15", max_uses_total: 40, max_uses_per_user: 1 },
  ];

  const { error: promoErr } = await supabase.from("consumer_promo_codes").upsert(PROMOS, { onConflict: "code", ignoreDuplicates: true });
  if (promoErr) {
    console.error("❌ Erreur promos:", promoErr.message);
    // Try insert
    const { error: promoInsErr } = await supabase.from("consumer_promo_codes").insert(PROMOS);
    if (promoInsErr) {
      console.error("❌ Erreur insert promos:", promoInsErr.message);
    } else {
      console.log(`✅ ${PROMOS.length} codes promo insérés\n`);
    }
  } else {
    console.log(`✅ ${PROMOS.length} codes promo insérés\n`);
  }

  console.log("🎉 Seed SQL terminé avec succès !");
  console.log("   → Lancez maintenant : npx tsx server/scripts/seed-rental-demo.ts");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
