/**
 * Import Ftour 2026 — Script d'import bulk
 *
 * Lit un fichier Excel avec 136 établissements et :
 * 1. Vérifie s'ils existent déjà en base (évite les doublons)
 * 2. Crée les nouveaux établissements avec enrichissement Google Places
 * 3. Crée les créneaux ftour (18:00–21:00, du 03/03 au 20/03/2026)
 *
 * Usage :
 *   node scripts/import-ftour-2026.mjs [chemin.xlsx] [--dry-run]
 */

import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════════

const DRY_RUN = process.argv.includes("--dry-run");
const EXCEL_PATH =
  process.argv.find((a) => a.endsWith(".xlsx")) ||
  "/Users/salaheddineaitnasser/Downloads/Ftour_Sortir_Au_Maroc_2026_MAJ.xlsx";

const GOOGLE_PLACES_BASE_URL = "https://maps.googleapis.com/maps/api/place";

// Créneaux ftour
const SLOT_START_DATE = "2026-03-03";
const SLOT_END_DATE = "2026-03-20";
const SLOT_START_HOUR = 18; // 18:00 locale (Maroc GMT+0 pendant Ramadan)
const SLOT_DURATION_HOURS = 3; // → 21:00
const SLOT_CAPACITY = 30;

// Admin
const ADMIN_ID = "97f70406-be5a-462c-b3a7-c956d5abc36e";
const ADMIN_NAME = "Salah E.";

// Mapping ville → région
const CITY_TO_REGION = {
  meknès: "Fès-Meknès",
  meknes: "Fès-Meknès",
  marrakech: "Marrakech-Safi",
  casablanca: "Casablanca-Settat",
  rabat: "Rabat-Salé-Kénitra",
  tanger: "Tanger-Tétouan-Al Hoceima",
  fès: "Fès-Meknès",
  fes: "Fès-Meknès",
  mohammedia: "Casablanca-Settat",
};

// Mapping type → service_types DB
const SERVICE_TYPE_MAP = {
  "buffet à volonté": ["buffet"],
  "servi à table": ["servi_a_table"],
  "à la carte": ["a_la_carte"],
  "buffet / servi à table": ["buffet", "servi_a_table"],
  "servi à table / buffet": ["servi_a_table", "buffet"],
  "servi à table / buffet": ["servi_a_table", "buffet"],
};

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function cellText(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "object" && val.text) return String(val.text).trim();
  if (typeof val === "object" && val.hyperlink) return String(val.hyperlink).trim();
  return String(val).trim();
}

function cleanUrl(val) {
  if (!val) return null;
  if (typeof val === "object") {
    const url = val.hyperlink || val.text || "";
    return String(url).trim().replace(/#$/, "") || null;
  }
  const text = String(val).trim();
  return text.startsWith("http") ? text : null;
}

function normalizeEstName(raw) {
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Price parsing
// ═══════════════════════════════════════════════════════════════════════════════

function parsePrice(priceStr) {
  if (!priceStr || !priceStr.trim()) {
    return { base_price: null, price_type: "nc" };
  }

  const text = priceStr.trim();

  // "À la carte"
  if (text.toLowerCase() === "à la carte") {
    return { base_price: null, price_type: "a_la_carte" };
  }

  // "À partir de X DHS"
  const startingFromMatch = text.match(/à\s+partir\s+de\s+(\d+)/i);
  if (startingFromMatch) {
    return {
      base_price: parseInt(startingFromMatch[1]) * 100,
      price_type: "starting_from",
    };
  }

  // "195 DHS / 95 DHS enfants" → take first number
  const multiPriceMatch = text.match(/^(\d+)\s*DHS\s*\//i);
  if (multiPriceMatch) {
    return {
      base_price: parseInt(multiPriceMatch[1]) * 100,
      price_type: "fixed",
    };
  }

  // "170 DHS"
  const simpleMatch = text.match(/(\d+)\s*DHS/i);
  if (simpleMatch) {
    return {
      base_price: parseInt(simpleMatch[1]) * 100,
      price_type: "fixed",
    };
  }

  return { base_price: null, price_type: "nc" };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Google Places
// ═══════════════════════════════════════════════════════════════════════════════

async function extractPlaceId(googleMapsUrl, name, city, apiKey) {
  if (!googleMapsUrl && !name) return null;

  if (googleMapsUrl && googleMapsUrl.startsWith("ChIJ")) return googleMapsUrl;

  if (googleMapsUrl) {
    // Try place_id parameter
    const placeIdMatch =
      googleMapsUrl.match(/!1s(0x[a-f0-9]+:[a-f0-9]+)/i) ||
      googleMapsUrl.match(/place_id[=:]([A-Za-z0-9_-]+)/);
    if (placeIdMatch) return placeIdMatch[1];
  }

  // Fallback: Find Place from Text
  const query = `${name || ""} ${city || ""}`.trim();
  if (!query) return null;

  try {
    const findUrl = new URL(`${GOOGLE_PLACES_BASE_URL}/findplacefromtext/json`);
    findUrl.searchParams.set("input", query);
    findUrl.searchParams.set("inputtype", "textquery");
    findUrl.searchParams.set("fields", "place_id");
    findUrl.searchParams.set("key", apiKey);
    findUrl.searchParams.set("language", "fr");

    const res = await fetch(findUrl.toString());
    if (!res.ok) return null;

    const data = await res.json();
    if (data.status === "OK" && data.candidates?.[0]?.place_id) {
      return data.candidates[0].place_id;
    }
  } catch {
    // ignore
  }

  return null;
}

async function getPlaceDetails(placeId, apiKey) {
  try {
    const detailsUrl = new URL(`${GOOGLE_PLACES_BASE_URL}/details/json`);
    detailsUrl.searchParams.set("place_id", placeId);
    detailsUrl.searchParams.set(
      "fields",
      "place_id,name,formatted_address,formatted_phone_number,international_phone_number,website,geometry,opening_hours,rating,user_ratings_total,url,types",
    );
    detailsUrl.searchParams.set("key", apiKey);
    detailsUrl.searchParams.set("language", "fr");

    const res = await fetch(detailsUrl.toString());
    if (!res.ok) return null;

    const data = await res.json();
    if (data.status === "OK" && data.result) {
      return data.result;
    }
  } catch {
    // ignore
  }

  return null;
}

function convertOpeningHours(weekdayText) {
  if (!weekdayText?.length) return null;

  const dayMapping = {
    lundi: "monday",
    mardi: "tuesday",
    mercredi: "wednesday",
    jeudi: "thursday",
    vendredi: "friday",
    samedi: "saturday",
    dimanche: "sunday",
    monday: "monday",
    tuesday: "tuesday",
    wednesday: "wednesday",
    thursday: "thursday",
    friday: "friday",
    saturday: "saturday",
    sunday: "sunday",
  };

  const hours = {};
  for (const text of weekdayText) {
    const colonIdx = text.indexOf(": ");
    if (colonIdx === -1) continue;
    const dayFr = text.substring(0, colonIdx).toLowerCase().trim();
    const time = text.substring(colonIdx + 2).trim();
    const dayKey = dayMapping[dayFr];
    if (dayKey && time) {
      hours[dayKey] = time;
    }
  }

  return Object.keys(hours).length > 0 ? hours : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  IMPORT FTOUR 2026 ${DRY_RUN ? "(DRY RUN)" : "(LIVE)"}`);
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Fichier : ${EXCEL_PATH}`);
  console.log(`Créneaux : ${SLOT_START_DATE} → ${SLOT_END_DATE} (${SLOT_START_HOUR}:00, ${SLOT_DURATION_HOURS}h)`);
  console.log();

  // ── Init ──────────────────────────────────────────────────────────────────
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
  }
  if (!googleApiKey) {
    console.error("⚠️  Missing GOOGLE_PLACES_API_KEY — enrichissement désactivé");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── Lire le fichier Excel ─────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  const ws = wb.worksheets[0];

  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = cellText(row.getCell(1));
    if (!name) continue;

    rows.push({
      name,
      univers: cellText(row.getCell(2)),
      categorie: cellText(row.getCell(3)),
      type: cellText(row.getCell(4)),
      ville: cellText(row.getCell(5)),
      pays: cellText(row.getCell(6)),
      prix: cellText(row.getCell(7)),
      googleMapsUrl: cleanUrl(row.getCell(8).value),
      tripadvisorUrl: cleanUrl(row.getCell(9).value),
      instagramUrl: cleanUrl(row.getCell(10).value),
    });
  }

  console.log(`📊 ${rows.length} lignes lues depuis l'Excel\n`);

  // ── Pré-charger tous les établissements existants ─────────────────────────
  console.log("📂 Chargement des établissements existants...");
  const PAGE_SIZE = 1000;
  let allExisting = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase
      .from("establishments")
      .select("id, name, city, google_place_id, google_maps_url, social_links")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("❌ Erreur chargement établissements:", error.message);
      process.exit(1);
    }
    allExisting = allExisting.concat(data || []);
    hasMore = (data || []).length === PAGE_SIZE;
    from += PAGE_SIZE;
  }
  console.log(`   ${allExisting.length} établissements en base\n`);

  // ── Pré-charger les slots ftour existants ─────────────────────────────────
  console.log("📂 Chargement des créneaux ftour existants...");
  let allSlots = [];
  from = 0;
  hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase
      .from("pro_slots")
      .select("id, establishment_id, starts_at, service_label")
      .eq("service_label", "Ftour")
      .gte("starts_at", `${SLOT_START_DATE}T00:00:00.000Z`)
      .lte("starts_at", `${SLOT_END_DATE}T23:59:59.999Z`)
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("❌ Erreur chargement slots:", error.message);
      process.exit(1);
    }
    allSlots = allSlots.concat(data || []);
    hasMore = (data || []).length === PAGE_SIZE;
    from += PAGE_SIZE;
  }

  // Group slots by establishment_id
  const slotsByEstId = {};
  for (const s of allSlots) {
    if (!slotsByEstId[s.establishment_id]) slotsByEstId[s.establishment_id] = [];
    slotsByEstId[s.establishment_id].push(s);
  }
  console.log(`   ${allSlots.length} créneaux ftour existants (${Object.keys(slotsByEstId).length} établissements)\n`);

  // ── Traiter chaque ligne ──────────────────────────────────────────────────
  const stats = {
    created: 0,
    existing: 0,
    enriched: 0,
    enrichFailed: 0,
    slotsCreated: 0,
    slotsSkipped: 0,
    errors: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const { name, ville, type, prix, googleMapsUrl, tripadvisorUrl, instagramUrl } = row;
    const idx = `[${i + 1}/${rows.length}]`;

    console.log(`${idx} ${name} (${ville})`);

    try {
      // ── 2a. Recherche de doublon ────────────────────────────────────────
      const normName = normalizeEstName(name);
      const normCity = normalizeEstName(ville);

      const existing = allExisting.find(
        (e) =>
          normalizeEstName(e.name) === normName &&
          normalizeEstName(e.city) === normCity,
      );

      let establishmentId;

      if (existing) {
        establishmentId = existing.id;
        stats.existing++;
        console.log(`  → Établissement : EXISTE (${existing.id.substring(0, 8)}…)`);
      } else {
        // ── 2b. Création ──────────────────────────────────────────────────
        const slug = slugify(name);
        const region = CITY_TO_REGION[ville.toLowerCase()] || null;

        // Check slug uniqueness
        let finalSlug = slug;
        const { data: slugConflicts } = await supabase
          .from("establishments")
          .select("id")
          .ilike("slug", `${slug}%`)
          .limit(20);
        if (slugConflicts?.length) {
          const existingSlugs = new Set(slugConflicts.map((r) => r.slug));
          let counter = 2;
          while (existingSlugs.has(finalSlug)) {
            finalSlug = `${slug}-${counter++}`;
          }
        }

        const insertPayload = {
          name,
          city: ville,
          universe: "restaurant",
          category: "restaurant",
          subcategory: "restaurant",
          country: "Maroc",
          region,
          status: "active",
          is_online: true,
          verified: false,
          premium: false,
          curated: false,
          slug: finalSlug,
          social_links: {},
          extra: {
            admin_created: true,
            import_source: "ftour_2026",
            import_date: new Date().toISOString(),
          },
          admin_created_by_id: ADMIN_ID,
          admin_created_by_name: ADMIN_NAME,
        };

        if (DRY_RUN) {
          establishmentId = `dry-run-${i}`;
          console.log(`  → Établissement : CRÉERAIT (slug: ${finalSlug})`);
        } else {
          const { data: created, error: createErr } = await supabase
            .from("establishments")
            .insert(insertPayload)
            .select("id")
            .single();

          if (createErr) {
            console.log(`  ❌ Erreur création : ${createErr.message}`);
            stats.errors.push({ name, ville, error: createErr.message, step: "create" });
            continue;
          }
          establishmentId = created.id;
          // Add to local cache
          allExisting.push({ id: created.id, name, city: ville, google_place_id: null, google_maps_url: null });
          console.log(`  → Établissement : CRÉÉ (${created.id.substring(0, 8)}…)`);
        }
        stats.created++;
      }

      // ── 2c. Enrichissement Google Places ────────────────────────────────
      const updatePayload = {};
      let enriched = false;

      if (googleApiKey && googleMapsUrl) {
        const placeId = await extractPlaceId(googleMapsUrl, name, ville, googleApiKey);

        if (placeId) {
          const details = await getPlaceDetails(placeId, googleApiKey);

          if (details) {
            if (details.formatted_address) updatePayload.address = details.formatted_address;
            if (details.international_phone_number) {
              updatePayload.phone = details.international_phone_number;
            } else if (details.formatted_phone_number) {
              updatePayload.phone = details.formatted_phone_number;
            }
            if (details.website) updatePayload.website = details.website;
            if (details.geometry?.location) {
              updatePayload.lat = details.geometry.location.lat;
              updatePayload.lng = details.geometry.location.lng;
            }
            if (details.rating) updatePayload.google_rating = details.rating;
            if (details.user_ratings_total) updatePayload.google_review_count = details.user_ratings_total;
            if (details.url) updatePayload.google_maps_url = details.url;
            if (details.place_id) updatePayload.google_place_id = details.place_id;

            const convertedHours = convertOpeningHours(details.opening_hours?.weekday_text);
            if (convertedHours) updatePayload.hours = convertedHours;

            enriched = true;
            stats.enriched++;
            console.log(`  → Google Places : ENRICHI (note: ${details.rating || "—"}, ${details.user_ratings_total || 0} avis)`);
          } else {
            stats.enrichFailed++;
            console.log(`  → Google Places : ÉCHEC (details null pour placeId ${placeId.substring(0, 15)}…)`);
          }
        } else {
          stats.enrichFailed++;
          console.log(`  → Google Places : ÉCHEC (placeId non trouvé)`);
        }

        await sleep(250); // Rate limit
      }

      // ── 2d. Mise à jour de l'établissement ─────────────────────────────
      // Google Maps URL from Excel (fallback if not from Google)
      if (!updatePayload.google_maps_url && googleMapsUrl) {
        updatePayload.google_maps_url = googleMapsUrl;
      }

      // Social links (merge with existing to avoid overwriting)
      const socialLinks = {};
      if (instagramUrl) socialLinks.instagram = instagramUrl;
      if (tripadvisorUrl) socialLinks.tripadvisor = tripadvisorUrl;
      if (updatePayload.google_maps_url) socialLinks.google_maps = updatePayload.google_maps_url;
      else if (googleMapsUrl) socialLinks.google_maps = googleMapsUrl;
      if (Object.keys(socialLinks).length > 0) {
        // Merge with existing social_links to preserve other fields (facebook, tiktok, etc.)
        const existingEst = allExisting.find((e) => e.id === establishmentId);
        const existingSocial = existingEst?.social_links || {};
        updatePayload.social_links = { ...existingSocial, ...socialLinks };
      }

      // Service types
      const serviceTypes = SERVICE_TYPE_MAP[type.toLowerCase()];
      if (serviceTypes) {
        updatePayload.service_types = serviceTypes;
      }

      // Force city from Excel
      updatePayload.city = ville;

      // Admin tracking
      updatePayload.admin_updated_by_id = ADMIN_ID;
      updatePayload.admin_updated_by_name = ADMIN_NAME;

      const socialStr = [instagramUrl ? "instagram" : null, tripadvisorUrl ? "tripadvisor" : null]
        .filter(Boolean)
        .join(", ");
      if (socialStr) console.log(`  → Social : ${socialStr}`);

      if (Object.keys(updatePayload).length > 0 && !DRY_RUN) {
        const { error: updateErr } = await supabase
          .from("establishments")
          .update(updatePayload)
          .eq("id", establishmentId);

        if (updateErr) {
          console.log(`  ⚠️  Erreur update : ${updateErr.message}`);
          stats.errors.push({ name, ville, error: updateErr.message, step: "update" });
        }
      }

      // ── 3. Créneaux ftour ──────────────────────────────────────────────
      const existingSlots = slotsByEstId[establishmentId] || [];
      const existingDates = new Set(
        existingSlots.map((s) => s.starts_at?.substring(0, 10)),
      );

      const price = parsePrice(prix);
      console.log(`  → Prix : ${price.price_type} ${price.base_price != null ? price.base_price : "—"} (${prix})`);

      const newSlots = [];
      const start = new Date(SLOT_START_DATE);
      const end = new Date(SLOT_END_DATE);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];

        // Skip if slot already exists for this date
        if (existingDates.has(dateStr)) continue;

        // Morocco GMT+0 during Ramadan — 18:00 locale = 18:00 UTC
        const startsAt = `${dateStr}T${String(SLOT_START_HOUR).padStart(2, "0")}:00:00.000Z`;
        const endHour = SLOT_START_HOUR + SLOT_DURATION_HOURS;
        const endsAt = `${dateStr}T${String(endHour).padStart(2, "0")}:00:00.000Z`;

        newSlots.push({
          establishment_id: establishmentId,
          starts_at: startsAt,
          ends_at: endsAt,
          capacity: SLOT_CAPACITY,
          base_price: price.base_price,
          price_type: price.price_type,
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

      if (existingSlots.length > 0 && newSlots.length === 0) {
        stats.slotsSkipped += existingSlots.length;
        console.log(`  → Slots : ${existingSlots.length} EXISTANTS — skip`);
      } else if (newSlots.length > 0) {
        if (DRY_RUN) {
          console.log(`  → Slots : ${newSlots.length} CRÉERAIT (${SLOT_START_DATE} → ${SLOT_END_DATE})`);
        } else {
          const { error: slotErr } = await supabase
            .from("pro_slots")
            .upsert(newSlots, { onConflict: "establishment_id,starts_at" });

          if (slotErr) {
            console.log(`  ❌ Erreur slots : ${slotErr.message}`);
            stats.errors.push({ name, ville, error: slotErr.message, step: "slots" });
          } else {
            console.log(`  → Slots : ${newSlots.length} CRÉÉS (${SLOT_START_DATE} → ${SLOT_END_DATE})`);
          }
        }
        stats.slotsCreated += newSlots.length;
      } else {
        console.log(`  → Slots : aucun à créer`);
      }

      console.log();
    } catch (err) {
      console.log(`  ❌ Erreur inattendue : ${err.message}`);
      stats.errors.push({ name, ville, error: err.message, step: "unknown" });
      console.log();
    }
  }

  // ── Résumé ──────────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  RÉSUMÉ ${DRY_RUN ? "(DRY RUN)" : "(LIVE)"}`);
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Établissements : ${stats.created} créés, ${stats.existing} existants`);
  console.log(`Google Places  : ${stats.enriched} enrichis, ${stats.enrichFailed} échoués`);
  console.log(`Créneaux ftour : ${stats.slotsCreated} créés, ${stats.slotsSkipped} skippés`);
  console.log(`Erreurs        : ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log("\n❌ Détail des erreurs :");
    for (const e of stats.errors) {
      console.log(`   - ${e.name} (${e.ville}) [${e.step}] : ${e.error}`);
    }
  }

  console.log("\nTerminé !");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
