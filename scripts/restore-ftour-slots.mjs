/**
 * Restore Ftour slots using direct INSERT (not upsert) via REST API.
 *
 * This script:
 * 1. Reads the Excel file to get all establishments
 * 2. Matches them to existing establishments in Supabase
 * 3. Checks which establishment+date combinations already have slots
 * 4. Inserts ONLY the missing slots in small batches
 *
 * Usage: node scripts/restore-ftour-slots.mjs [chemin.xlsx]
 */

import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// Configuration
const EXCEL_PATH =
  process.argv.find((a) => a.endsWith(".xlsx")) ||
  "/Users/salaheddineaitnasser/Downloads/Ftour_Sortir_Au_Maroc_2026_MAJ.xlsx";

const SLOT_START_DATE = "2026-03-03";
const SLOT_END_DATE = "2026-03-20";
const SLOT_START_HOUR = 18;
const SLOT_DURATION_HOURS = 3;
const SLOT_CAPACITY = 30;

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Helpers
function cellText(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "object" && val.text) return String(val.text).trim();
  return String(val).trim();
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

function parsePrice(priceStr) {
  if (!priceStr || !priceStr.trim()) return { base_price: null, price_type: "nc" };
  const text = priceStr.trim();
  if (text.toLowerCase() === "à la carte") return { base_price: null, price_type: "a_la_carte" };
  const startMatch = text.match(/à\s+partir\s+de\s+(\d+)/i);
  if (startMatch) return { base_price: parseInt(startMatch[1]) * 100, price_type: "starting_from" };
  const multiMatch = text.match(/^(\d+)\s*DHS\s*\//i);
  if (multiMatch) return { base_price: parseInt(multiMatch[1]) * 100, price_type: "fixed" };
  const simpleMatch = text.match(/(\d+)\s*DHS/i);
  if (simpleMatch) return { base_price: parseInt(simpleMatch[1]) * 100, price_type: "fixed" };
  return { base_price: null, price_type: "nc" };
}

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
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("json")) return res.json();
  return null;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  RESTORE FTOUR SLOTS (direct INSERT)");
  console.log("═══════════════════════════════════════════════════════════");

  // 1. Read Excel
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
      ville: cellText(row.getCell(5)),
      prix: cellText(row.getCell(7)),
    });
  }
  console.log(`📊 ${rows.length} lignes Excel\n`);

  // 2. Load ALL establishments (paginated)
  console.log("📂 Chargement établissements...");
  let allEstabs = [];
  let offset = 0;
  while (true) {
    const data = await supaFetch(
      `/establishments?select=id,name,city&order=created_at.desc&limit=1000&offset=${offset}`
    );
    if (!data || data.length === 0) break;
    allEstabs = allEstabs.concat(data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`   ${allEstabs.length} établissements en base\n`);

  // 3. Load existing Ftour slots (paginated)
  console.log("📂 Chargement slots existants...");
  let existingSlots = [];
  offset = 0;
  while (true) {
    const data = await supaFetch(
      `/pro_slots?service_label=eq.Ftour&select=establishment_id,starts_at&limit=1000&offset=${offset}`
    );
    if (!data || data.length === 0) break;
    existingSlots = existingSlots.concat(data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  const existingKeys = new Set(
    existingSlots.map((s) => `${s.establishment_id}|${s.starts_at.substring(0, 10)}`)
  );
  console.log(`   ${existingSlots.length} slots existants\n`);

  // 4. Match and generate missing slots
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalNotFound = 0;

  for (let i = 0; i < rows.length; i++) {
    const { name, ville, prix } = rows[i];
    const normName = normalizeEstName(name);
    const normCity = normalizeEstName(ville);

    // Find matching establishment
    const match = allEstabs.find(
      (e) => normalizeEstName(e.name) === normName && normalizeEstName(e.city) === normCity
    );

    if (!match) {
      console.log(`  ✗ [${i + 1}] ${name} (${ville}) — NON TROUVÉ`);
      totalNotFound++;
      continue;
    }

    const price = parsePrice(prix);

    // Generate slots for missing dates
    const newSlots = [];
    const start = new Date(SLOT_START_DATE);
    const end = new Date(SLOT_END_DATE);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      const key = `${match.id}|${dateStr}`;
      if (existingKeys.has(key)) continue;

      const startsAt = `${dateStr}T${String(SLOT_START_HOUR).padStart(2, "0")}:00:00.000Z`;
      const endHour = SLOT_START_HOUR + SLOT_DURATION_HOURS;
      const endsAt = `${dateStr}T${String(endHour).padStart(2, "0")}:00:00.000Z`;

      newSlots.push({
        establishment_id: match.id,
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

    if (newSlots.length === 0) {
      totalSkipped++;
      continue;
    }

    // Insert in this batch (18 slots max per establishment)
    try {
      await supaFetch("/pro_slots", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(newSlots),
      });
      totalCreated += newSlots.length;
      console.log(`  ✓ [${i + 1}] ${name} (${ville}) — ${newSlots.length} slots créés`);

      // Mark as existing to avoid double-insert
      for (const s of newSlots) {
        existingKeys.add(`${s.establishment_id}|${s.starts_at.substring(0, 10)}`);
      }
    } catch (err) {
      console.log(`  ✗ [${i + 1}] ${name} (${ville}) — ERREUR: ${err.message}`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(`  RÉSUMÉ`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Créneaux créés : ${totalCreated}`);
  console.log(`Skippés (déjà existants) : ${totalSkipped}`);
  console.log(`Non trouvés : ${totalNotFound}`);

  // Final count
  let finalCount = 0;
  offset = 0;
  while (true) {
    const data = await supaFetch(
      `/pro_slots?service_label=eq.Ftour&select=id&limit=1000&offset=${offset}`
    );
    if (!data || data.length === 0) break;
    finalCount += data.length;
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`\nTotal Ftour slots en base : ${finalCount}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
