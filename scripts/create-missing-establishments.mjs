/**
 * Create missing establishments from Excel with Google Places enrichment.
 * Then create Ftour slots for each.
 *
 * Usage: node scripts/create-missing-establishments.mjs
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const SLOT_START_DATE = "2026-03-04"; // today
const SLOT_END_DATE = "2026-03-20";
const SLOT_START_HOUR = 18;
const SLOT_DURATION_HOURS = 3;
const SLOT_CAPACITY = 30;

// The 5 missing establishments
const ESTABLISHMENTS = [
  {
    name: "Mövenpick",
    city: "Tanger",
    price: 490,
    priceType: "fixed",
    universe: "restaurant",
    category: "Restaurant",
    subcategory: "Buffet à volonté",
    gmapsUrl: "https://maps.google.com/?cid=4143505153200799623",
    tripadvisor: "https://www.tripadvisor.com/Hotel_Review-g293734-d302479-Reviews-Movenpick_Hotel_Mansour_Eddahbi_Marrakech-Marrakech_Marrakech_Safi.html",
    instagram: "https://www.instagram.com/movenpickmarrakech/",
  },
  {
    name: "Fairmont Tazi Palace",
    city: "Tanger",
    price: 650,
    priceType: "fixed",
    universe: "restaurant",
    category: "Restaurant",
    subcategory: "Buffet à volonté",
    gmapsUrl: "https://maps.google.com/?cid=7056915827118595890",
    tripadvisor: "https://www.tripadvisor.com/Hotel_Review-g293737-d25109105-Reviews-Fairmont_Tazi_Palace_Tangier-Tangier_Tanger_Tetouan_Al_Hoceima.html",
    instagram: "https://www.instagram.com/fairmonttazipalacetangier/",
  },
  {
    name: "Palais Zahia",
    city: "Tanger",
    price: 450,
    priceType: "fixed",
    universe: "restaurant",
    category: "Restaurant",
    subcategory: "Buffet à volonté",
    gmapsUrl: "https://maps.google.com/?cid=7063699541336368439",
    tripadvisor: "https://www.tripadvisor.com/Hotel_Review-g293737-d13154884-Reviews-Palais_Zahia-Tangier_Tanger_Tetouan_Al_Hoceima.html",
    instagram: "https://www.instagram.com/palais_zahia/",
  },
  {
    name: "Kenzi Solazur",
    city: "Tanger",
    price: 350,
    priceType: "fixed",
    universe: "restaurant",
    category: "Restaurant",
    subcategory: "Buffet à volonté",
    gmapsUrl: "https://maps.google.com/?cid=17221272745144529043",
    tripadvisor: "https://www.tripadvisor.co.uk/Hotel_Review-g293737-d2141280-Reviews-Kenzi_Solazur_Hotel-Tangier_Tanger_Tetouan_Al_Hoceima.html",
    instagram: "https://www.instagram.com/kenzisolazurhotel/",
  },
  {
    name: "La Vue",
    city: "Tanger",
    price: 420,
    priceType: "fixed",
    universe: "restaurant",
    category: "Restaurant",
    subcategory: "Buffet à volonté",
    gmapsUrl: "https://maps.google.com/?cid=12644639931639434315",
    tripadvisor: "https://www.tripadvisor.com.sg/Hotel_Review-g2626640-d2649001-Reviews-La_Haute_Vue-Marrakech_Safi.html",
    instagram: "https://www.instagram.com/la._.vue/",
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

async function supaFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...options.headers,
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}: ${body}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) return res.json();
  return null;
}

const PLACES_BASE = "https://maps.googleapis.com/maps/api/place";

async function findPlaceId(name, city) {
  if (!GOOGLE_API_KEY) return null;
  const query = `${name} ${city} Maroc`;
  const url = new URL(`${PLACES_BASE}/findplacefromtext/json`);
  url.searchParams.set("input", query);
  url.searchParams.set("inputtype", "textquery");
  url.searchParams.set("fields", "place_id");
  url.searchParams.set("key", GOOGLE_API_KEY);
  url.searchParams.set("language", "fr");

  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.status === "OK" && data.candidates?.[0]?.place_id) {
    return data.candidates[0].place_id;
  }
  return null;
}

async function getPlaceDetails(placeId) {
  if (!placeId || !GOOGLE_API_KEY) return null;
  const url = new URL(`${PLACES_BASE}/details/json`);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields",
    "place_id,name,formatted_address,formatted_phone_number,international_phone_number,website,geometry,opening_hours,rating,user_ratings_total,url,types"
  );
  url.searchParams.set("key", GOOGLE_API_KEY);
  url.searchParams.set("language", "fr");

  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.status === "OK" && data.result) return data.result;
  return null;
}

function convertOpeningHours(weekdayText) {
  if (!weekdayText?.length) return null;
  const dayMapping = {
    lundi: "monday", mardi: "tuesday", mercredi: "wednesday",
    jeudi: "thursday", vendredi: "friday", samedi: "saturday", dimanche: "sunday",
  };
  const hours = {};
  for (const text of weekdayText) {
    const [dayFr, time] = text.split(": ");
    const dayKey = dayMapping[dayFr?.toLowerCase()];
    if (dayKey && time) hours[dayKey] = time;
  }
  return Object.keys(hours).length > 0 ? hours : null;
}

function generateSlug(name, city) {
  const base = `${name} ${city}`
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  // Add random suffix to avoid collision
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base}-${suffix}`;
}

function parsePrice(priceStr) {
  if (!priceStr) return { base_price: null, price_type: "nc" };
  const text = priceStr.trim();
  if (text.toLowerCase() === "à la carte") return { base_price: null, price_type: "a_la_carte" };
  const startMatch = text.match(/à\s+partir\s+de\s+(\d+)/i);
  if (startMatch) return { base_price: parseInt(startMatch[1]) * 100, price_type: "starting_from" };
  const simpleMatch = text.match(/(\d+)\s*DHS/i);
  if (simpleMatch) return { base_price: parseInt(simpleMatch[1]) * 100, price_type: "fixed" };
  return { base_price: null, price_type: "nc" };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  CRÉATION DES 5 ÉTABLISSEMENTS MANQUANTS");
  console.log("═══════════════════════════════════════════════════════════\n");

  if (!GOOGLE_API_KEY) {
    console.warn("⚠️  GOOGLE_PLACES_API_KEY non configurée — skip enrichissement\n");
  }

  for (const est of ESTABLISHMENTS) {
    console.log(`\n── ${est.name} (${est.city}) ──────────────────────────`);

    // 1. Google Places lookup
    let place = null;
    const placeId = await findPlaceId(est.name, est.city);
    if (placeId) {
      place = await getPlaceDetails(placeId);
      if (place) {
        console.log(`  📍 Google Place: ${place.name}`);
        console.log(`     Adresse: ${place.formatted_address || "—"}`);
        console.log(`     Tél: ${place.international_phone_number || place.formatted_phone_number || "—"}`);
        console.log(`     Site: ${place.website || "—"}`);
        console.log(`     GPS: ${place.geometry?.location?.lat}, ${place.geometry?.location?.lng}`);
        console.log(`     Note: ${place.rating || "—"}/5 (${place.user_ratings_total || 0} avis)`);
        console.log(`     Maps: ${place.url || "—"}`);
      }
    } else {
      console.log("  ⚠️  Pas trouvé sur Google Places");
    }

    // 2. Build establishment data
    const hours = place?.opening_hours?.weekday_text
      ? convertOpeningHours(place.opening_hours.weekday_text)
      : null;

    const socialLinks = {};
    if (est.instagram) socialLinks.instagram = est.instagram;
    // TripAdvisor goes in social_links too
    if (est.tripadvisor) socialLinks.tripadvisor = est.tripadvisor;

    const estData = {
      name: est.name,
      city: est.city,
      country: "Maroc",
      universe: est.universe,
      category: est.category,
      subcategory: est.subcategory,
      slug: generateSlug(est.name, est.city),
      address: place?.formatted_address || null,
      lat: place?.geometry?.location?.lat || null,
      lng: place?.geometry?.location?.lng || null,
      phone: place?.international_phone_number || place?.formatted_phone_number || null,
      website: place?.website || null,
      google_maps_url: place?.url || est.gmapsUrl,
      google_place_id: placeId || null,
      google_rating: place?.rating || null,
      google_review_count: place?.user_ratings_total || null,
      hours: JSON.stringify(hours || {}),
      social_links: Object.keys(socialLinks).length > 0 ? JSON.stringify(socialLinks) : null,
      status: "active",
      verified: false,
      extra: JSON.stringify({ admin_created: true, source: "ftour_import_2026" }),
    };

    // 3. Insert establishment
    let createdEst;
    try {
      const result = await supaFetch("/establishments", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([estData]),
      });
      createdEst = result?.[0];
      console.log(`  ✅ Établissement créé: ${createdEst.id}`);
    } catch (err) {
      console.error(`  ❌ Erreur création: ${err.message}`);
      continue;
    }

    // 4. Create Ftour slots
    const slots = [];
    const start = new Date(SLOT_START_DATE);
    const end = new Date(SLOT_END_DATE);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      const startsAt = `${dateStr}T${String(SLOT_START_HOUR).padStart(2, "0")}:00:00.000Z`;
      const endHour = SLOT_START_HOUR + SLOT_DURATION_HOURS;
      const endsAt = `${dateStr}T${String(endHour).padStart(2, "0")}:00:00.000Z`;

      slots.push({
        establishment_id: createdEst.id,
        starts_at: startsAt,
        ends_at: endsAt,
        capacity: SLOT_CAPACITY,
        base_price: est.price * 100, // cents
        price_type: est.priceType,
        service_label: "Ftour",
        active: false,
        moderation_status: "pending_moderation",
        title: null,
        cover_url: null,
        promo_type: null,
        promo_value: null,
        promo_label: null,
      });
    }

    try {
      await supaFetch("/pro_slots", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(slots),
      });
      console.log(`  ✅ ${slots.length} slots Ftour créés (pending_moderation)`);
    } catch (err) {
      console.error(`  ❌ Erreur slots: ${err.message}`);
    }
  }

  // 5. Also restore Marion slots
  console.log("\n── Marion (Casablanca) — Restauration slots ──────────────");
  try {
    const marionData = await supaFetch(
      `/establishments?name=eq.Marion&city=eq.Casablanca&select=id&limit=1`
    );
    if (marionData?.[0]) {
      const marionId = marionData[0].id;
      // Check existing slots
      const existingSlots = await supaFetch(
        `/pro_slots?establishment_id=eq.${marionId}&service_label=eq.Ftour&select=id&limit=1`
      );
      if (existingSlots?.length > 0) {
        console.log("  ℹ️  Marion a déjà des slots Ftour, skip");
      } else {
        const slots = [];
        const start = new Date(SLOT_START_DATE);
        const end = new Date(SLOT_END_DATE);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split("T")[0];
          slots.push({
            establishment_id: marionId,
            starts_at: `${dateStr}T18:00:00.000Z`,
            ends_at: `${dateStr}T21:00:00.000Z`,
            capacity: 30,
            base_price: 85000, // 850 DHS
            price_type: "fixed",
            service_label: "Ftour",
            active: false,
            moderation_status: "pending_moderation",
            title: null, cover_url: null, promo_type: null, promo_value: null, promo_label: null,
          });
        }
        await supaFetch("/pro_slots", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(slots),
        });
        console.log(`  ✅ Marion: ${slots.length} slots Ftour créés`);
      }
    } else {
      console.log("  ⚠️  Marion non trouvée en base");
    }
  } catch (err) {
    console.error(`  ❌ Erreur Marion: ${err.message}`);
  }

  // Final count
  console.log("\n═══════════════════════════════════════════════════════════");
  let finalCount = 0;
  let offset = 0;
  while (true) {
    const data = await supaFetch(
      `/pro_slots?service_label=eq.Ftour&select=id&limit=1000&offset=${offset}`
    );
    if (!data || data.length === 0) break;
    finalCount += data.length;
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`  Total slots Ftour: ${finalCount}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
