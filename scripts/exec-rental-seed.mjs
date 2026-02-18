/**
 * Execute rental demo seed via Supabase JS client (PostgREST).
 * 
 * This script parses the SQL seed file and translates the INSERT statements
 * into Supabase client upsert calls.
 *
 * Usage: node scripts/exec-rental-seed.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Read the SQL file
const sql = readFileSync(resolve(ROOT, 'server/migrations/20260219_rental_demo_seed.sql'), 'utf8');

// ============================================================================
// PARSE ESTABLISHMENTS
// ============================================================================
function parseEstablishments() {
  // Extract the INSERT INTO establishments block
  const match = sql.match(/INSERT INTO public\.establishments\s*\([^)]+\)\s*VALUES\s*([\s\S]*?)ON CONFLICT \(id\) DO NOTHING;/);
  if (!match) throw new Error('Could not find establishments INSERT');
  
  const columns = [
    'id', 'name', 'slug', 'universe', 'category', 'city', 'address', 'country', 'region',
    'phone', 'description_short', 'description_long', 'hours',
    'tags', 'amenities', 'status', 'is_online', 'verified', 'booking_enabled',
    'avg_rating', 'review_count', 'lat', 'lng', 'extra',
    'cover_url', 'logo_url'
  ];
  
  const valuesBlock = match[1];
  // Split on the top-level tuple boundaries. Each establishment starts with a comment line and (
  const tuples = valuesBlock.split(/,\s*\n\n--\s*\d+\./);
  
  const rows = [];
  // We need to extract each complete (...) value tuple
  // Better approach: use a regex to find top-level parenthesized groups
  const tupleRegex = /\(\s*\n?\s*'[0-9a-f-]+'/g;
  let tupleStarts = [];
  let m;
  while ((m = tupleRegex.exec(valuesBlock)) !== null) {
    tupleStarts.push(m.index);
  }
  
  for (let i = 0; i < tupleStarts.length; i++) {
    const start = tupleStarts[i];
    const end = i < tupleStarts.length - 1 ? tupleStarts[i + 1] : valuesBlock.length;
    let tuple = valuesBlock.substring(start, end).trim();
    // Remove trailing comma
    tuple = tuple.replace(/,\s*$/, '');
    // Remove surrounding parens
    tuple = tuple.replace(/^\(/, '').replace(/\)\s*$/, '');
    
    // Now parse the values - this is tricky because of nested JSON
    // Use a state machine
    const values = parseSqlValues(tuple);
    
    if (values.length >= columns.length) {
      const row = {};
      for (let j = 0; j < columns.length; j++) {
        row[columns[j]] = convertValue(values[j], columns[j]);
      }
      rows.push(row);
    }
  }
  
  return rows;
}

// ============================================================================
// PARSE RENTAL VEHICLES
// ============================================================================
function parseVehicles() {
  const match = sql.match(/INSERT INTO public\.rental_vehicles\s*\([^)]+\)\s*VALUES\s*([\s\S]*?)ON CONFLICT \(id\) DO NOTHING;/);
  if (!match) throw new Error('Could not find rental_vehicles INSERT');
  
  const columns = [
    'id', 'establishment_id', 'category', 'brand', 'model', 'year', 'photos', 'specs',
    'mileage_policy', 'mileage_limit_per_day', 'extra_km_cost', 'pricing',
    'high_season_dates', 'quantity', 'similar_vehicle', 'status', 'sort_order'
  ];
  
  const valuesBlock = match[1];
  
  // Find each vehicle tuple - starts with ('22222222-
  const tupleRegex = /\('22222222-/g;
  let tupleStarts = [];
  let m;
  while ((m = tupleRegex.exec(valuesBlock)) !== null) {
    tupleStarts.push(m.index);
  }
  
  const rows = [];
  for (let i = 0; i < tupleStarts.length; i++) {
    const start = tupleStarts[i];
    const end = i < tupleStarts.length - 1 ? tupleStarts[i + 1] : valuesBlock.length;
    let tuple = valuesBlock.substring(start, end).trim();
    // Remove trailing comma and comments
    tuple = tuple.replace(/,\s*(--[^\n]*)?\s*$/, '');
    // Remove surrounding parens
    tuple = tuple.replace(/^\(/, '').replace(/\)\s*$/, '');
    
    const values = parseSqlValues(tuple);
    
    if (values.length >= columns.length) {
      const row = {};
      for (let j = 0; j < columns.length; j++) {
        row[columns[j]] = convertVehicleValue(values[j], columns[j]);
      }
      rows.push(row);
    }
  }
  
  return rows;
}

// ============================================================================
// PARSE RENTAL OPTIONS
// ============================================================================
function parseOptions() {
  const match = sql.match(/INSERT INTO public\.rental_options\s*\([^)]+\)\s*VALUES\s*([\s\S]*?)(?:;|\n\n--)/);
  if (!match) throw new Error('Could not find rental_options INSERT');
  
  const columns = ['establishment_id', 'name', 'description', 'price', 'price_type', 'is_mandatory', 'sort_order', 'is_active'];
  
  const valuesBlock = match[1];
  
  // Find each option tuple
  const tupleRegex = /\('11111111-/g;
  let tupleStarts = [];
  let m;
  while ((m = tupleRegex.exec(valuesBlock)) !== null) {
    tupleStarts.push(m.index);
  }
  
  const rows = [];
  for (let i = 0; i < tupleStarts.length; i++) {
    const start = tupleStarts[i];
    const end = i < tupleStarts.length - 1 ? tupleStarts[i + 1] : valuesBlock.length;
    let tuple = valuesBlock.substring(start, end).trim();
    tuple = tuple.replace(/,\s*(--[^\n]*)?\s*$/, '');
    tuple = tuple.replace(/;\s*$/, '');
    tuple = tuple.replace(/^\(/, '').replace(/\)\s*$/, '');
    
    const values = parseSqlValues(tuple);
    
    if (values.length >= columns.length) {
      const row = {};
      for (let j = 0; j < columns.length; j++) {
        row[columns[j]] = convertOptionValue(values[j], columns[j]);
      }
      rows.push(row);
    }
  }
  
  return rows;
}

// ============================================================================
// PARSE PROMO CODES
// ============================================================================
function parsePromoCodes() {
  const match = sql.match(/INSERT INTO public\.consumer_promo_codes\s*\([^)]+\)\s*VALUES\s*([\s\S]*?)ON CONFLICT \(code\) DO NOTHING;/);
  if (!match) throw new Error('Could not find consumer_promo_codes INSERT');
  
  const columns = ['code', 'description', 'discount_bps', 'applies_to_establishment_ids', 'active', 'is_public', 'starts_at', 'ends_at'];
  
  const valuesBlock = match[1];
  
  // Find each promo tuple
  const tupleRegex = /\('/g;
  let tupleStarts = [];
  let m;
  while ((m = tupleRegex.exec(valuesBlock)) !== null) {
    tupleStarts.push(m.index);
  }
  
  const rows = [];
  for (let i = 0; i < tupleStarts.length; i++) {
    const start = tupleStarts[i];
    const end = i < tupleStarts.length - 1 ? tupleStarts[i + 1] : valuesBlock.length;
    let tuple = valuesBlock.substring(start, end).trim();
    tuple = tuple.replace(/,\s*$/, '');
    tuple = tuple.replace(/^\(/, '').replace(/\)\s*$/, '');
    
    const values = parseSqlValues(tuple);
    
    if (values.length >= columns.length) {
      const row = {};
      for (let j = 0; j < columns.length; j++) {
        row[columns[j]] = convertPromoValue(values[j], columns[j]);
      }
      rows.push(row);
    }
  }
  
  return rows;
}

// ============================================================================
// SQL VALUE PARSER (handles nested JSON, arrays, strings)
// ============================================================================
function parseSqlValues(tuple) {
  const values = [];
  let current = '';
  let depth = 0; // tracks nesting of {}, [], ()
  let inString = false;
  let stringChar = '';
  let escaped = false;
  
  for (let i = 0; i < tuple.length; i++) {
    const ch = tuple[i];
    
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    
    if (ch === '\\') {
      current += ch;
      escaped = true;
      continue;
    }
    
    if (inString) {
      if (ch === stringChar) {
        // Check for escaped quote ('' in SQL)
        if (stringChar === "'" && i + 1 < tuple.length && tuple[i + 1] === "'") {
          current += ch;
          i++; // skip next quote
          current += "'";
          continue;
        }
        inString = false;
      }
      current += ch;
      continue;
    }
    
    if (ch === "'" || ch === '"') {
      inString = true;
      stringChar = ch;
      current += ch;
      continue;
    }
    
    if (ch === '{' || ch === '[' || ch === '(') {
      depth++;
      current += ch;
      continue;
    }
    
    if (ch === '}' || ch === ']' || ch === ')') {
      depth--;
      current += ch;
      continue;
    }
    
    if (ch === ',' && depth === 0) {
      values.push(current.trim());
      current = '';
      continue;
    }
    
    current += ch;
  }
  
  if (current.trim()) {
    values.push(current.trim());
  }
  
  return values;
}

// ============================================================================
// VALUE CONVERTERS
// ============================================================================
function stripQuotes(v) {
  if (v.startsWith("'") && v.endsWith("'")) {
    return v.slice(1, -1).replace(/''/g, "'");
  }
  return v;
}

function parseJsonb(v) {
  // Remove surrounding quotes
  let json = stripQuotes(v);
  // Handle double-escaped quotes in SQL strings
  json = json.replace(/''/g, "'");
  try {
    return JSON.parse(json);
  } catch {
    console.warn('Failed to parse JSON:', json.substring(0, 100));
    return json;
  }
}

function parsePgArray(v) {
  // ARRAY['...','...']::type[] format
  const match = v.match(/ARRAY\[([\s\S]*?)\](?:::[a-z_[\]]+)?/);
  if (match) {
    const inner = match[1];
    // Split by comma, strip quotes
    return inner.split(',').map(s => stripQuotes(s.trim())).filter(Boolean);
  }
  // '{"a","b"}' format
  if (v.startsWith("'{") || v.startsWith("'[")) {
    const inner = stripQuotes(v);
    try { return JSON.parse(inner.replace(/{/g, '[').replace(/}/g, ']').replace(/"/g, '"')); } catch {}
  }
  return [];
}

function parsePgTextArray(v) {
  // '{text1,text2}' format or ARRAY[...] format
  if (v.match(/^ARRAY/i)) {
    return parsePgArray(v);
  }
  const inner = stripQuotes(v);
  if (inner.startsWith('{') && inner.endsWith('}')) {
    return inner.slice(1, -1).split(',').map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
  }
  return [];
}

function convertValue(v, col) {
  if (v === 'NULL' || v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  
  // JSON columns
  if (['hours', 'extra'].includes(col)) return parseJsonb(v);
  
  // Array columns
  if (['tags', 'amenities'].includes(col)) return parsePgTextArray(v);
  
  // Numeric columns
  if (['avg_rating', 'review_count', 'lat', 'lng'].includes(col)) {
    return parseFloat(stripQuotes(v));
  }
  
  // Boolean columns
  if (['is_online', 'verified', 'booking_enabled'].includes(col)) {
    return v === 'true' || v === 'TRUE';
  }
  
  return stripQuotes(v);
}

function convertVehicleValue(v, col) {
  if (v === 'NULL' || v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  
  // Array columns
  if (['photos'].includes(col)) return parsePgArray(v);
  
  // JSON columns
  if (['specs', 'pricing', 'high_season_dates'].includes(col)) return parseJsonb(v);
  
  // Numeric columns
  if (['year', 'mileage_limit_per_day', 'extra_km_cost', 'quantity', 'sort_order'].includes(col)) {
    const num = parseFloat(stripQuotes(v));
    return isNaN(num) ? null : num;
  }
  
  return stripQuotes(v);
}

function convertOptionValue(v, col) {
  if (v === 'NULL' || v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  
  if (['price', 'sort_order'].includes(col)) {
    return parseFloat(stripQuotes(v));
  }
  
  if (['is_mandatory', 'is_active'].includes(col)) {
    return v === 'true' || v === 'TRUE';
  }
  
  return stripQuotes(v);
}

function convertPromoValue(v, col) {
  if (v === 'NULL' || v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  
  if (col === 'discount_bps') return parseInt(stripQuotes(v));
  
  if (col === 'applies_to_establishment_ids') return parsePgArray(v);
  
  if (['active', 'is_public'].includes(col)) {
    return v === 'true' || v === 'TRUE';
  }
  
  if (['starts_at', 'ends_at'].includes(col)) {
    // Remove ::timestamptz cast
    let ts = v.replace(/::timestamptz/g, '');
    return stripQuotes(ts);
  }
  
  return stripQuotes(v);
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log('=== Rental Demo Seed Execution ===\n');
  
  // 1. Establishments
  console.log('1. Parsing establishments...');
  const establishments = parseEstablishments();
  console.log(`   Found ${establishments.length} establishments`);
  
  if (establishments.length > 0) {
    console.log('   Inserting establishments...');
    for (const est of establishments) {
      const { error } = await supabase
        .from('establishments')
        .upsert(est, { onConflict: 'id', ignoreDuplicates: true });
      if (error) {
        console.log(`   ERROR inserting ${est.name}: ${error.message}`);
      } else {
        console.log(`   OK: ${est.name} (${est.city})`);
      }
    }
  }
  
  // 2. Vehicles
  console.log('\n2. Parsing vehicles...');
  const vehicles = parseVehicles();
  console.log(`   Found ${vehicles.length} vehicles`);
  
  if (vehicles.length > 0) {
    console.log('   Inserting vehicles in batches...');
    const batchSize = 10;
    let ok = 0, fail = 0;
    for (let i = 0; i < vehicles.length; i += batchSize) {
      const batch = vehicles.slice(i, i + batchSize);
      const { error } = await supabase
        .from('rental_vehicles')
        .upsert(batch, { onConflict: 'id', ignoreDuplicates: true });
      if (error) {
        console.log(`   ERROR batch ${i}..${i+batch.length}: ${error.message}`);
        // Try one by one
        for (const v of batch) {
          const { error: e2 } = await supabase
            .from('rental_vehicles')
            .upsert(v, { onConflict: 'id', ignoreDuplicates: true });
          if (e2) { console.log(`   ERROR ${v.brand} ${v.model}: ${e2.message}`); fail++; }
          else ok++;
        }
      } else {
        ok += batch.length;
      }
    }
    console.log(`   Done: ${ok} OK, ${fail} failed`);
  }
  
  // 3. Options
  console.log('\n3. Parsing rental options...');
  const options = parseOptions();
  console.log(`   Found ${options.length} options`);
  
  if (options.length > 0) {
    console.log('   Inserting options...');
    let ok = 0, fail = 0;
    for (const opt of options) {
      const { error } = await supabase
        .from('rental_options')
        .insert(opt);
      if (error) {
        if (error.message.includes('duplicate') || error.code === '23505') {
          ok++; // Already exists
        } else {
          console.log(`   ERROR ${opt.name} (${opt.establishment_id}): ${error.message}`);
          fail++;
        }
      } else {
        ok++;
      }
    }
    console.log(`   Done: ${ok} OK, ${fail} failed`);
  }
  
  // 4. Promo Codes
  console.log('\n4. Parsing promo codes...');
  const promos = parsePromoCodes();
  console.log(`   Found ${promos.length} promo codes`);
  
  if (promos.length > 0) {
    console.log('   Inserting promo codes...');
    for (const promo of promos) {
      const { error } = await supabase
        .from('consumer_promo_codes')
        .upsert(promo, { onConflict: 'code', ignoreDuplicates: true });
      if (error) {
        console.log(`   ERROR ${promo.code}: ${error.message}`);
      } else {
        console.log(`   OK: ${promo.code}`);
      }
    }
  }
  
  console.log('\n=== Seed execution complete ===');
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
