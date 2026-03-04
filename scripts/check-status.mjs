/**
 * Check operational status of all Excel establishments.
 */
import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const EXCEL_PATH = "/Users/salaheddineaitnasser/Downloads/Ftour_Sortir_Au_Maroc_2026_MAJ.xlsx";
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

function cellText(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "object" && val.text) return String(val.text).trim();
  return String(val).trim();
}

function normalize(s) {
  if (!s) return "";
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
}

async function supaFetch(path) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  return res.json();
}

async function main() {
  // Read Excel
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  const ws = wb.worksheets[0];
  const excelRows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = cellText(row.getCell(1));
    if (!name) continue;
    excelRows.push({
      row: r,
      name,
      city: cellText(row.getCell(5)),
      price: cellText(row.getCell(7)),
    });
  }

  // Load establishments (paginated)
  let allEstabs = [];
  let offset = 0;
  while (true) {
    const data = await supaFetch(`/establishments?select=id,name,city&limit=1000&offset=${offset}`);
    if (!data || !Array.isArray(data) || data.length === 0) break;
    allEstabs = allEstabs.concat(data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  // Load Ftour slots (paginated)
  let allSlots = [];
  offset = 0;
  while (true) {
    const data = await supaFetch(`/pro_slots?service_label=eq.Ftour&select=establishment_id&limit=1000&offset=${offset}`);
    if (!data || !Array.isArray(data) || data.length === 0) break;
    allSlots = allSlots.concat(data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  // Count slots per establishment
  const slotCount = {};
  for (const s of allSlots) {
    slotCount[s.establishment_id] = (slotCount[s.establishment_id] || 0) + 1;
  }

  // Match and categorize
  const missing = [];
  const noSlots = [];
  const ok = [];
  const partial = [];

  for (const ex of excelRows) {
    const nn = normalize(ex.name);
    const nc = normalize(ex.city);
    const match = allEstabs.find((e) => normalize(e.name) === nn && normalize(e.city) === nc);
    if (!match) {
      missing.push(ex);
      continue;
    }
    const cnt = slotCount[match.id] || 0;
    if (cnt === 0) noSlots.push({ ...ex, estId: match.id });
    else if (cnt < 17) partial.push({ ...ex, estId: match.id, cnt });
    else ok.push({ ...ex, estId: match.id, cnt });
  }

  // Report
  console.log("════════════════════════════════════════════════");
  console.log("  RAPPORT OPÉRATIONNEL");
  console.log("════════════════════════════════════════════════");
  console.log(`Excel: ${excelRows.length} établissements`);
  console.log(`Base: ${allEstabs.length} établissements | ${allSlots.length} slots Ftour`);
  console.log("");
  console.log(`✅ Complets (étab + 17+ slots): ${ok.length}/${excelRows.length}`);
  console.log(`⚠️  Partiels (< 17 slots):      ${partial.length}`);
  console.log(`❌ Étab sans slots:             ${noSlots.length}`);
  console.log(`❌ Étab NON TROUVÉ:             ${missing.length}`);

  if (missing.length) {
    console.log("\n══ ÉTABLISSEMENTS NON TROUVÉS (à créer) ══");
    for (const m of missing) console.log(`  ❌ ${m.name} (${m.city}) — ${m.price}`);
  }
  if (noSlots.length) {
    console.log("\n══ SANS SLOTS FTOUR ══");
    for (const n of noSlots) console.log(`  ⚠️  ${n.name} (${n.city}) — ${n.price}`);
  }
  if (partial.length) {
    console.log("\n══ SLOTS PARTIELS ══");
    for (const p of partial) console.log(`  ⚠️  ${p.name} (${p.city}) — ${p.cnt} slots`);
  }
  if (ok.length) {
    console.log(`\n══ OK (${ok.length}) ══`);
    for (const o of ok) console.log(`  ✅ ${o.name} (${o.city}) — ${o.cnt} slots`);
  }
}

main().catch(console.error);
