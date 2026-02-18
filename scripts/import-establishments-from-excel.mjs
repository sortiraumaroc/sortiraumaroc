/**
 * Import establishments from filled Excel template into Supabase
 *
 * Usage:
 *   node scripts/import-establishments-from-excel.mjs [path-to-excel] [--dry-run]
 *
 * Options:
 *   --dry-run    Parse and validate without inserting into DB
 *   --skip-example  Skip line 3 (the pre-filled example row)
 */
import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// ── Config ──
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_EXAMPLE = process.argv.includes('--skip-example');
const EXCEL_PATH = process.argv.find(a => a.endsWith('.xlsx'))
  || path.join(__dirname, '..', 'template-import-etablissements_marrakech.xlsx');

// ── Universe mapping (display label → DB enum booking_kind) ──
// DB enum values: restaurant, loisir, hebergement, culture
// "wellness" is NOT a valid enum value — sport/bien-être maps to "loisir"
const UNIVERSE_MAP = {
  'boire & manger': 'restaurant',
  'sport & bien-être': 'loisir',
  'loisirs': 'loisir',
  'hébergement': 'hebergement',
  'culture': 'culture',
  'shopping': 'loisir',
  'location de véhicules': 'loisir',
};

// ── Default subcategory per universe (DB has NOT NULL constraint) ──
const DEFAULT_SUBCATEGORY = {
  'restaurant': 'restaurant',
  'loisir': 'loisir',
  'hebergement': 'villa',
  'culture': 'musee',
};

// ── City → Region auto-fill ──
const CITY_TO_REGION = {
  'agadir': 'Souss-Massa',
  'al hoceima': 'Tanger-Tétouan-Al Hoceima',
  'béni mellal': 'Béni Mellal-Khénifra',
  'berkane': "L'Oriental",
  'casablanca': 'Casablanca-Settat',
  'chefchaouen': 'Tanger-Tétouan-Al Hoceima',
  'dakhla': 'Dakhla-Oued Ed-Dahab',
  'el jadida': 'Casablanca-Settat',
  'errachidia': 'Drâa-Tafilalet',
  'essaouira': 'Marrakech-Safi',
  'fès': 'Fès-Meknès',
  'guelmim': 'Guelmim-Oued Noun',
  'ifrane': 'Fès-Meknès',
  'kénitra': 'Rabat-Salé-Kénitra',
  'khémisset': 'Rabat-Salé-Kénitra',
  'khouribga': 'Béni Mellal-Khénifra',
  'laâyoune': 'Laâyoune-Sakia El Hamra',
  'larache': 'Tanger-Tétouan-Al Hoceima',
  'marrakech': 'Marrakech-Safi',
  'meknès': 'Fès-Meknès',
  'mohammedia': 'Casablanca-Settat',
  'nador': "L'Oriental",
  'oujda': "L'Oriental",
  'ouarzazate': 'Drâa-Tafilalet',
  'rabat': 'Rabat-Salé-Kénitra',
  'safi': 'Marrakech-Safi',
  'salé': 'Rabat-Salé-Kénitra',
  'settat': 'Casablanca-Settat',
  'tanger': 'Tanger-Tétouan-Al Hoceima',
  'tétouan': 'Tanger-Tétouan-Al Hoceima',
};

const DAYS_EN = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

// ── Helpers ──

/** Extract text from Excel cell (handles hyperlink objects) */
function cellText(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object' && val.text) return String(val.text).trim();
  if (typeof val === 'object' && val.hyperlink) return String(val.hyperlink).trim();
  return String(val).trim();
}

/** Extract numeric value from cell */
function cellNum(val) {
  const text = cellText(val);
  if (!text) return null;
  // Remove trailing comma, spaces, etc.
  const cleaned = text.replace(/,\s*$/, '').replace(/\s/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/** Clean phone number */
function cleanPhone(raw) {
  const text = cellText(raw);
  if (!text) return null;
  // Remove spaces for storage
  return text.replace(/\s+/g, ' ').trim();
}

/** Clean URL — extract from hyperlink object if needed */
function cleanUrl(val) {
  if (!val) return null;
  if (typeof val === 'object') {
    // Prefer hyperlink, fallback to text
    const url = val.hyperlink || val.text || '';
    return String(url).trim().replace(/#$/, '') || null;
  }
  const text = String(val).trim();
  return text || null;
}

/** Split comma-separated string into array */
function splitList(val) {
  const text = cellText(val);
  if (!text) return null;
  const items = text.split(',').map(s => s.trim()).filter(Boolean);
  return items.length > 0 ? items : null;
}

/** Parse hours string like "12:00-15:00,19:00-23:00" into opening hours format */
function parseHoursString(hoursStr) {
  if (!hoursStr) return [];
  const text = cellText(hoursStr);
  if (!text) return [];

  const ranges = text.split(',').map(r => r.trim()).filter(Boolean);
  const types = ['lunch', 'dinner'];

  return ranges.map((range, i) => {
    const [from, to] = range.split('-').map(t => t.trim());
    if (!from || !to) return null;
    return { type: types[i] || 'lunch', from, to };
  }).filter(Boolean);
}

/** Build hours JSONB from Excel day columns */
function buildHours(rowData, headers) {
  const hours = {};
  let hasAnyHours = false;

  for (const day of DAYS_EN) {
    const dayFr = {
      monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi',
      thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche'
    }[day];

    const openKey = `${dayFr} - Ouvert?`;
    const hoursKey = `${dayFr} - Horaires`;

    const isOpen = cellText(rowData[openKey]).toUpperCase() === 'OUI';

    if (isOpen) {
      hours[day] = parseHoursString(rowData[hoursKey]);
      if (hours[day].length === 0) {
        // Open but no hours specified — default 09:00-23:00
        hours[day] = [{ type: 'lunch', from: '09:00', to: '23:00' }];
      }
      hasAnyHours = true;
    } else if (cellText(rowData[openKey])) {
      // Explicitly closed
      hours[day] = [];
      hasAnyHours = true;
    }
  }

  return hasAnyHours ? hours : null;
}

/** Build social_links JSONB */
function buildSocialLinks(rowData) {
  const links = {};
  let hasAny = false;

  const mapping = {
    'Instagram': 'instagram',
    'Facebook': 'facebook',
    'TikTok': 'tiktok',
    'Snapchat': 'snapchat',
    'YouTube': 'youtube',
    'TripAdvisor': 'tripadvisor',
  };

  for (const [excelKey, dbKey] of Object.entries(mapping)) {
    const url = cleanUrl(rowData[excelKey]);
    if (url) {
      links[dbKey] = url;
      hasAny = true;
    }
  }

  return hasAny ? links : null;
}

// ══════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════

async function main() {
  console.log('📊 Import Établissements from Excel');
  console.log(`   File: ${EXCEL_PATH}`);
  console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN (no DB writes)' : '💾 LIVE INSERT'}`);
  console.log('');

  // ── Read Excel ──
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  const ws = wb.getWorksheet('Établissements');

  if (!ws) {
    console.error('❌ Sheet "Établissements" not found');
    process.exit(1);
  }

  // Get headers from row 2
  const headers = {};
  ws.getRow(2).eachCell((cell, colNumber) => {
    headers[colNumber] = cellText(cell.value);
  });

  // Parse data rows
  const rows = [];
  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rowData = {};
    let hasData = false;

    row.eachCell((cell, colNumber) => {
      const headerName = headers[colNumber];
      if (headerName) {
        rowData[headerName] = cell.value;
        if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
          hasData = true;
        }
      }
    });

    if (hasData) {
      rows.push({ row: r, data: rowData });
    }
  }

  // Skip example row if it matches
  let dataRows = rows;
  if (SKIP_EXAMPLE && dataRows.length > 0) {
    const first = dataRows[0];
    if (cellText(first.data['Nom *']) === 'Le Jardin Secret' && first.row === 3) {
      console.log('⏭️  Skipping example row (line 3: Le Jardin Secret)');
      dataRows = dataRows.slice(1);
    }
  }

  console.log(`📋 Found ${dataRows.length} establishments to import\n`);

  // ── Transform rows ──
  const establishments = [];
  const errors = [];
  const warnings = [];

  for (const { row, data } of dataRows) {
    const name = cellText(data['Nom *']);
    const prefix = `Row ${row} (${name || 'NO NAME'})`;

    // Required field validation
    if (!name || name.length < 2) {
      errors.push(`${prefix}: Missing or too short name`);
      continue;
    }

    const universeLabel = cellText(data['Univers *']).toLowerCase();
    const universe = UNIVERSE_MAP[universeLabel];
    if (!universe) {
      errors.push(`${prefix}: Invalid universe "${cellText(data['Univers *'])}"`);
      continue;
    }

    const city = cellText(data['Ville *']).trim();
    if (!city) {
      errors.push(`${prefix}: Missing city`);
      continue;
    }

    // Parse lat/lng — handle "31.5915844," format (lat only with trailing comma)
    const latRaw = cellText(data['Latitude *']);
    let lat = null;
    let lng = null;

    if (latRaw) {
      // Some cells have "31.5915844," — just latitude with trailing comma
      const cleaned = latRaw.replace(/,\s*$/, '').trim();
      lat = parseFloat(cleaned);
      if (isNaN(lat)) lat = null;
    }

    const lngRaw = cellText(data['Longitude *']);
    if (lngRaw) {
      const cleaned = lngRaw.replace(/,\s*$/, '').trim();
      lng = parseFloat(cleaned);
      if (isNaN(lng)) lng = null;
    }

    // Address
    const address = cellText(data['Adresse *']) || null;

    // Phone
    const phone = cleanPhone(data['Téléphone *']);

    // Google Maps URL
    const googleMapsUrl = cleanUrl(data['Lien Google Maps *']) || null;

    // Description
    const descriptionShort = cellText(data['Description courte *']) || null;

    // Warn about missing fields (non-blocking)
    if (!lat) warnings.push(`${prefix}: Missing latitude`);
    if (!address) warnings.push(`${prefix}: Missing address`);
    if (!phone) warnings.push(`${prefix}: Missing phone`);
    if (!descriptionShort) warnings.push(`${prefix}: Missing short description`);

    // Region auto-fill
    const region = CITY_TO_REGION[city.toLowerCase()] || null;

    // Build establishment object
    const est = {
      name,
      universe,
      category: cellText(data['Catégorie']) || null,
      subcategory: cellText(data['Sous-catégorie']) || DEFAULT_SUBCATEGORY[universe] || 'autre',
      specialties: splitList(data['Spécialités']),
      country: 'Maroc',
      region,
      city,
      neighborhood: cellText(data['Quartier']) || null,
      postal_code: cellText(data['Code postal']) || null,
      address,
      lat,
      lng,
      phone,
      whatsapp: cleanPhone(data['WhatsApp']),
      email: cellText(data['Email réservation']) || null,
      google_maps_url: googleMapsUrl,
      website: cleanUrl(data['Site web']),
      description_short: descriptionShort,
      description_long: cellText(data['Description longue']) || null,
      logo_url: cleanUrl(data['URL Logo']),
      cover_url: cleanUrl(data['URL Cover *']),
      gallery_urls: splitList(data['URLs Galerie']),
      hours: buildHours(data, headers),
      tags: splitList(data['Tags généraux']),
      ambiance_tags: splitList(data['Tags ambiance']),
      amenities: splitList(data['Équipements']),
      highlights: splitList(data['Points forts']),
      social_links: buildSocialLinks(data) || {},
      // Admin defaults
      status: 'active',
      is_online: true,
      verified: false,
      extra: { admin_created: true, import_source: 'excel_marrakech', import_date: new Date().toISOString() },
    };

    // Clean null values — but keep NOT NULL columns with defaults
    const NOT_NULL_KEYS = ['social_links', 'subcategory'];
    for (const key of Object.keys(est)) {
      if ((est[key] === null || est[key] === undefined) && !NOT_NULL_KEYS.includes(key)) {
        delete est[key];
      }
    }

    establishments.push({ row, name, payload: est });
  }

  // ── Report ──
  console.log('═══════════════════════════════════════');
  console.log(`✅ Valid establishments: ${establishments.length}`);
  console.log(`❌ Errors (skipped): ${errors.length}`);
  console.log(`⚠️  Warnings: ${warnings.length}`);
  console.log('═══════════════════════════════════════\n');

  if (errors.length > 0) {
    console.log('❌ ERRORS:');
    errors.forEach(e => console.log(`   ${e}`));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log(`⚠️  WARNINGS (${warnings.length}):`);
    // Group warnings by type
    const missingLat = warnings.filter(w => w.includes('latitude'));
    const missingAddr = warnings.filter(w => w.includes('address'));
    const missingPhone = warnings.filter(w => w.includes('phone'));
    const missingDesc = warnings.filter(w => w.includes('description'));

    if (missingLat.length) console.log(`   📍 Missing latitude: ${missingLat.length} establishments`);
    if (missingAddr.length) console.log(`   🏠 Missing address: ${missingAddr.length} establishments`);
    if (missingPhone.length) console.log(`   📞 Missing phone: ${missingPhone.length} establishments`);
    if (missingDesc.length) console.log(`   📝 Missing short description: ${missingDesc.length} establishments`);
    console.log('');
  }

  // Print universe breakdown
  const byUniverse = {};
  for (const e of establishments) {
    const u = e.payload.universe;
    byUniverse[u] = (byUniverse[u] || 0) + 1;
  }
  console.log('📊 Par univers:');
  for (const [u, count] of Object.entries(byUniverse)) {
    console.log(`   ${u}: ${count}`);
  }
  console.log('');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN — Showing first 3 payloads:\n');
    for (const est of establishments.slice(0, 3)) {
      console.log(`--- ${est.name} (row ${est.row}) ---`);
      console.log(JSON.stringify(est.payload, null, 2));
      console.log('');
    }
    console.log('✅ Dry run complete. Remove --dry-run to insert into DB.');
    return;
  }

  // ── DB Insert ──
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check for duplicates first
  console.log('🔍 Checking for existing establishments...');
  const names = establishments.map(e => e.payload.name);
  const { data: existing, error: fetchError } = await supabase
    .from('establishments')
    .select('id, name, city')
    .in('name', names);

  if (fetchError) {
    console.error('❌ Error checking duplicates:', fetchError.message);
    process.exit(1);
  }

  const existingNames = new Set((existing || []).map(e => e.name?.toLowerCase()));
  const duplicates = establishments.filter(e => existingNames.has(e.payload.name.toLowerCase()));
  const toInsert = establishments.filter(e => !existingNames.has(e.payload.name.toLowerCase()));

  if (duplicates.length > 0) {
    console.log(`⏭️  Skipping ${duplicates.length} duplicates already in DB:`);
    duplicates.forEach(d => console.log(`   - ${d.name}`));
    console.log('');
  }

  if (toInsert.length === 0) {
    console.log('✅ Nothing to insert — all establishments already exist.');
    return;
  }

  console.log(`💾 Inserting ${toInsert.length} new establishments...\n`);

  // Insert in batches of 20
  const BATCH_SIZE = 20;
  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const payloads = batch.map(b => b.payload);

    const { data, error } = await supabase
      .from('establishments')
      .insert(payloads)
      .select('id, name');

    if (error) {
      console.error(`❌ Batch ${Math.floor(i/BATCH_SIZE) + 1} error:`, error.message);
      // Try one by one
      for (const item of batch) {
        const { data: single, error: singleErr } = await supabase
          .from('establishments')
          .insert(item.payload)
          .select('id, name')
          .single();

        if (singleErr) {
          console.error(`   ❌ ${item.name}: ${singleErr.message}`);
          failed++;
        } else {
          console.log(`   ✅ ${single.name} (${single.id})`);
          inserted++;
        }
      }
    } else {
      const names = (data || []).map(d => d.name).join(', ');
      console.log(`   ✅ Batch ${Math.floor(i/BATCH_SIZE) + 1}: ${batch.length} inserted`);
      inserted += batch.length;
    }
  }

  console.log('\n═══════════════════════════════════════');
  console.log(`✅ Inserted: ${inserted}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏭️  Duplicates skipped: ${duplicates.length}`);
  console.log('═══════════════════════════════════════');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
