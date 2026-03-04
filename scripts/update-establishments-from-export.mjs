/**
 * Update establishments from admin-exported Excel file
 *
 * Rules:
 *   1. Team-touched establishments (admin_created_by_id OR admin_updated_by_id IS NOT NULL):
 *      → Only fill in MISSING fields (null/empty). Never overwrite existing data.
 *   2. Other establishments (no team intervention):
 *      → Overwrite all fields with Excel data.
 *   3. Empty "Ville" → null (not "" or '')
 *
 * Usage:
 *   node scripts/update-establishments-from-export.mjs <path-to-excel> [--dry-run]
 */
import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const DRY_RUN = process.argv.includes("--dry-run");
const EXCEL_PATH =
  process.argv.find((a) => a.endsWith(".xlsx")) ||
  (() => {
    console.error("❌ Provide an .xlsx file path");
    process.exit(1);
  })();

// ── Helpers ──

function cellText(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "object" && val.text) return String(val.text).trim();
  if (typeof val === "object" && val.hyperlink) return String(val.hyperlink).trim();
  if (typeof val === "object" && val.result) return String(val.result).trim();
  // Handle [object Object] from bad export
  const str = String(val).trim();
  if (str === "[object Object]") return "";
  return str;
}

function cleanUrl(val) {
  if (!val) return null;
  if (typeof val === "object") {
    const url = val.hyperlink || val.text || "";
    return String(url).trim().replace(/#$/, "") || null;
  }
  const text = String(val).trim();
  if (text === "''" || text === '""') return null;
  return text || null;
}

function cleanString(val) {
  const text = cellText(val);
  if (!text || text === "''" || text === '""') return null;
  return text;
}

function cleanBool(val) {
  const text = cellText(val).toLowerCase();
  return text === "oui" || text === "true" || text === "1";
}

function cleanNum(val) {
  const text = cellText(val);
  if (!text) return null;
  const num = parseFloat(text.replace(/,\s*$/, "").replace(/\s/g, ""));
  return isNaN(num) ? null : num;
}

// Universe mapping from display labels
const UNIVERSE_MAP = {
  restaurant: "restaurant",
  restaurants: "restaurant",
  "boire & manger": "restaurant",
  loisir: "loisir",
  loisirs: "loisir",
  "sport & bien-être": "loisir",
  hebergement: "hebergement",
  hébergement: "hebergement",
  culture: "culture",
  shopping: "loisir",
};

// City → Region auto-fill
const CITY_TO_REGION = {
  agadir: "Souss-Massa",
  "al hoceima": "Tanger-Tétouan-Al Hoceima",
  "béni mellal": "Béni Mellal-Khénifra",
  berkane: "L'Oriental",
  casablanca: "Casablanca-Settat",
  chefchaouen: "Tanger-Tétouan-Al Hoceima",
  dakhla: "Dakhla-Oued Ed-Dahab",
  "el jadida": "Casablanca-Settat",
  errachidia: "Drâa-Tafilalet",
  essaouira: "Marrakech-Safi",
  fès: "Fès-Meknès",
  guelmim: "Guelmim-Oued Noun",
  ifrane: "Fès-Meknès",
  kénitra: "Rabat-Salé-Kénitra",
  khémisset: "Rabat-Salé-Kénitra",
  khouribga: "Béni Mellal-Khénifra",
  laâyoune: "Laâyoune-Sakia El Hamra",
  larache: "Tanger-Tétouan-Al Hoceima",
  marrakech: "Marrakech-Safi",
  meknès: "Fès-Meknès",
  mohammédia: "Casablanca-Settat",
  nador: "L'Oriental",
  oujda: "L'Oriental",
  ouarzazate: "Drâa-Tafilalet",
  rabat: "Rabat-Salé-Kénitra",
  safi: "Marrakech-Safi",
  salé: "Rabat-Salé-Kénitra",
  settat: "Casablanca-Settat",
  tanger: "Tanger-Tétouan-Al Hoceima",
  tétouan: "Tanger-Tétouan-Al Hoceima",
};

// ══════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════

async function main() {
  console.log("📊 Update Établissements from Admin Export");
  console.log(`   File: ${EXCEL_PATH}`);
  console.log(`   Mode: ${DRY_RUN ? "🔍 DRY RUN" : "💾 LIVE UPDATE"}`);
  console.log("");

  // ── Read Excel ──
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  const ws = wb.worksheets[0]; // first sheet

  if (!ws) {
    console.error("❌ No worksheet found");
    process.exit(1);
  }

  // Get headers from row 1
  const headers = {};
  ws.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = cellText(cell.value);
  });

  console.log("📋 Colonnes détectées:", Object.values(headers).join(", "));
  console.log("");

  // Parse data rows
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rowData = {};
    let hasData = false;

    row.eachCell((cell, colNumber) => {
      const headerName = headers[colNumber];
      if (headerName) {
        rowData[headerName] = cell.value;
        if (cell.value !== null && cell.value !== undefined && cell.value !== "") {
          hasData = true;
        }
      }
    });

    if (hasData && rowData["ID"]) {
      rows.push(rowData);
    }
  }

  console.log(`📋 ${rows.length} établissements dans le Excel\n`);

  // ── Detect duplicates in Excel (same ID appearing multiple times) ──
  const idCounts = new Map();
  for (const row of rows) {
    const id = cellText(row["ID"]);
    idCounts.set(id, (idCounts.get(id) || 0) + 1);
  }
  const duplicateIds = [...idCounts.entries()].filter(([, count]) => count > 1);
  if (duplicateIds.length > 0) {
    console.log(`⚠️  ${duplicateIds.length} IDs en double dans le Excel:`);
    for (const [id, count] of duplicateIds.slice(0, 10)) {
      const matchingRows = rows.filter((r) => cellText(r["ID"]) === id);
      const names = matchingRows.map((r) => cellText(r["Nom"])).join(", ");
      console.log(`   ${id} (×${count}): ${names}`);
    }
    console.log("   → Seule la dernière occurrence sera utilisée\n");
  }

  // Deduplicate: keep last occurrence per ID
  const deduped = new Map();
  for (const row of rows) {
    deduped.set(cellText(row["ID"]), row);
  }
  const uniqueRows = [...deduped.values()];
  if (uniqueRows.length < rows.length) {
    console.log(`📋 Après déduplication: ${uniqueRows.length} établissements uniques\n`);
  }

  // ── Connect to Supabase ──
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── Fetch all establishment IDs with their team-touch status ──
  const ids = uniqueRows.map((r) => cellText(r["ID"])).filter(Boolean);

  console.log("🔍 Vérification des établissements en base...");

  // Fetch in batches (Supabase limits query size)
  const BATCH = 200;
  const dbEstMap = new Map();

  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from("establishments")
      .select(
        "id, name, city, universe, address, phone, whatsapp, website, description_short, lat, lng, cover_url, social_links, google_maps_url, admin_created_by_id, admin_updated_by_id, status, is_online, verified, premium, slug, category, subcategory, region"
      )
      .in("id", batch);

    if (error) {
      console.error("❌ DB fetch error:", error.message);
      process.exit(1);
    }

    for (const est of data || []) {
      dbEstMap.set(est.id, est);
    }
  }

  console.log(`   ${dbEstMap.size} trouvés en base sur ${uniqueRows.length} dans le Excel\n`);

  // ── Classify ──
  const teamTouched = [];
  const untouched = [];
  const notFound = [];

  for (const row of uniqueRows) {
    const id = cellText(row["ID"]);
    const dbEst = dbEstMap.get(id);

    if (!dbEst) {
      notFound.push(id);
      continue;
    }

    const isTeamTouched = dbEst.admin_created_by_id || dbEst.admin_updated_by_id;
    if (isTeamTouched) {
      teamTouched.push({ row, dbEst });
    } else {
      untouched.push({ row, dbEst });
    }
  }

  console.log("═══════════════════════════════════════");
  console.log(`👥 Touchés par l'équipe (merge only): ${teamTouched.length}`);
  console.log(`📝 Non touchés (overwrite): ${untouched.length}`);
  console.log(`❓ Non trouvés en base: ${notFound.length}`);
  console.log("═══════════════════════════════════════\n");

  if (notFound.length > 0 && notFound.length <= 20) {
    console.log("❓ IDs non trouvés:", notFound.join(", "));
    console.log("");
  }

  // ── Build update payloads ──

  // Column names may have accents — support both variants
  function col(row, ...names) {
    for (const n of names) {
      if (row[n] !== undefined && row[n] !== null) return row[n];
    }
    return undefined;
  }

  function excelToPayload(row) {
    const city = cleanString(col(row, "Ville"));
    const universe = UNIVERSE_MAP[(cellText(col(row, "Univers")) || "").toLowerCase()] || null;
    const socialLinks = {};
    let hasSocial = false;

    const instagram = cleanUrl(col(row, "Instagram"));
    if (instagram) { socialLinks.instagram = instagram; hasSocial = true; }
    const tripadvisor = cleanUrl(col(row, "TripAdvisor"));
    if (tripadvisor) { socialLinks.tripadvisor = tripadvisor; hasSocial = true; }

    return {
      name: cleanString(col(row, "Nom")),
      city: city || null, // Empty → null, never "" or ''
      universe,
      category: cleanString(col(row, "Catégorie", "Categorie")) || null,
      subcategory: cleanString(col(row, "Sous-catégorie", "Sous-categorie")) || null,
      address: cleanString(col(row, "Adresse")),
      phone: cleanString(col(row, "Téléphone", "Telephone")),
      whatsapp: cleanString(col(row, "WhatsApp")),
      website: cleanUrl(col(row, "Site web")),
      google_maps_url: cleanUrl(col(row, "Google Maps")),
      description_short: cleanString(col(row, "Description courte")),
      cover_url: cleanUrl(col(row, "Photo")),
      lat: cleanNum(col(row, "Latitude")),
      lng: cleanNum(col(row, "Longitude")),
      verified: cleanBool(col(row, "Vérifié", "Verifie")),
      premium: cleanBool(col(row, "Premium")),
      is_online: cleanBool(col(row, "En ligne")),
      slug: cleanString(col(row, "Slug")),
      social_links: hasSocial ? socialLinks : null,
      region: city ? CITY_TO_REGION[city.toLowerCase()] || null : null,
    };
  }

  // For team-touched: only fill missing fields
  function buildMergePayload(excelData, dbEst) {
    const payload = {};
    let changes = 0;

    for (const [key, excelVal] of Object.entries(excelData)) {
      if (excelVal === null || excelVal === undefined) continue;

      const dbVal = dbEst[key];
      const isEmpty =
        dbVal === null ||
        dbVal === undefined ||
        dbVal === "" ||
        dbVal === "''" ||
        dbVal === '""';

      // Special case for social_links: merge individual fields
      if (key === "social_links" && typeof excelVal === "object" && excelVal !== null) {
        const existing = typeof dbVal === "object" && dbVal !== null ? dbVal : {};
        const merged = { ...existing };
        let socialChanged = false;

        for (const [socialKey, socialVal] of Object.entries(excelVal)) {
          if (socialVal && !existing[socialKey]) {
            merged[socialKey] = socialVal;
            socialChanged = true;
          }
        }

        if (socialChanged) {
          payload.social_links = merged;
          changes++;
        }
        continue;
      }

      if (isEmpty) {
        payload[key] = excelVal;
        changes++;
      }
    }

    return { payload, changes };
  }

  // For untouched: overwrite everything
  function buildOverwritePayload(excelData, dbEst) {
    const payload = {};
    let changes = 0;

    for (const [key, excelVal] of Object.entries(excelData)) {
      if (excelVal === undefined) continue;

      // Don't null out name, slug, universe — those are essential
      if ((key === "name" || key === "slug" || key === "universe") && !excelVal) continue;
      // Don't null out subcategory (NOT NULL constraint)
      if (key === "subcategory" && !excelVal) continue;

      const dbVal = dbEst[key];

      // Check if actually different
      if (key === "social_links") {
        if (JSON.stringify(excelVal || {}) !== JSON.stringify(dbVal || {})) {
          if (excelVal) {
            payload.social_links = { ...(typeof dbVal === "object" ? dbVal : {}), ...excelVal };
          }
          changes++;
        }
        continue;
      }

      if (excelVal !== dbVal) {
        payload[key] = excelVal;
        changes++;
      }
    }

    return { payload, changes };
  }

  // ── Process ──
  const updates = [];
  let mergeChanges = 0;
  let overwriteChanges = 0;

  for (const { row, dbEst } of teamTouched) {
    const excelData = excelToPayload(row);
    const { payload, changes } = buildMergePayload(excelData, dbEst);
    if (changes > 0) {
      updates.push({ id: dbEst.id, name: dbEst.name, payload, mode: "merge", changes });
      mergeChanges++;
    }
  }

  for (const { row, dbEst } of untouched) {
    const excelData = excelToPayload(row);
    const { payload, changes } = buildOverwritePayload(excelData, dbEst);
    if (changes > 0) {
      updates.push({ id: dbEst.id, name: dbEst.name, payload, mode: "overwrite", changes });
      overwriteChanges++;
    }
  }

  console.log(`📝 Mises à jour à effectuer:`);
  console.log(`   Merge (équipe): ${mergeChanges} établissements`);
  console.log(`   Overwrite (autres): ${overwriteChanges} établissements`);
  console.log(`   Total: ${updates.length}\n`);

  if (DRY_RUN) {
    console.log("🔍 DRY RUN — Premiers exemples:\n");

    const mergeExamples = updates.filter((u) => u.mode === "merge").slice(0, 3);
    const overwriteExamples = updates.filter((u) => u.mode === "overwrite").slice(0, 3);

    if (mergeExamples.length) {
      console.log("── MERGE (ajout données manquantes) ──");
      for (const u of mergeExamples) {
        console.log(`   ${u.name} → ${u.changes} champ(s): ${Object.keys(u.payload).join(", ")}`);
      }
      console.log("");
    }

    if (overwriteExamples.length) {
      console.log("── OVERWRITE (écrasement) ──");
      for (const u of overwriteExamples) {
        console.log(`   ${u.name} → ${u.changes} champ(s): ${Object.keys(u.payload).join(", ")}`);
      }
      console.log("");
    }

    console.log("✅ Dry run terminé. Retirez --dry-run pour exécuter.");
    return;
  }

  // ── Execute updates ──
  console.log("💾 Exécution des mises à jour...\n");

  let success = 0;
  let failed = 0;

  for (const update of updates) {
    const { error } = await supabase
      .from("establishments")
      .update(update.payload)
      .eq("id", update.id);

    if (error) {
      console.error(`   ❌ ${update.name}: ${error.message}`);
      failed++;
    } else {
      success++;
    }
  }

  console.log("\n═══════════════════════════════════════");
  console.log(`✅ Mis à jour: ${success}`);
  console.log(`❌ Échoué: ${failed}`);
  console.log(`⏭️  Inchangés: ${uniqueRows.length - updates.length - notFound.length}`);
  console.log("═══════════════════════════════════════");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
