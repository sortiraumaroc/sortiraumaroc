import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '.env') });

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

const supabase = createClient(url, key, { auth: { persistSession: false } });

// =============================================================================
// Realistic Unsplash photos per brand/model — curated for car rental realism
// Each entry: [brand_model_key]: array of 4-5 Unsplash photo URLs
// =============================================================================

const u = (id, w = 800, h = 600) => `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop`;

// -- CITADINES --
const PHOTOS = {
  // Renault Clio
  'renault_clio': [
    u('photo-1609521263047-f8f205293f24'),   // Red Renault Clio
    u('photo-1603584173870-7f23fdae1b7a'),   // Small hatchback city
    u('photo-1549317661-bd32c8ce0db2'),      // Compact car parked
    u('photo-1605559424843-9e4c228bf1c6'),   // City car front view
    u('photo-1600712242805-5f78671b24da'),   // Small car driving
  ],
  // Peugeot 208
  'peugeot_208': [
    u('photo-1552519507-da3b142c6e3d'),   // Modern small car
    u('photo-1583121274602-3e2820c69888'),   // Sleek compact
    u('photo-1617469767053-d3b523a0b982'),   // City hatchback
    u('photo-1614162692292-7ac56d7f7f1e'),   // Stylish small car
    u('photo-1605559424843-9e4c228bf1c6'),   // Front angle car
  ],
  // Dacia Sandero
  'dacia_sandero': [
    u('photo-1600712242805-5f78671b24da'),   // Budget car
    u('photo-1549317661-bd32c8ce0db2'),      // Economy hatchback
    u('photo-1603584173870-7f23fdae1b7a'),   // Practical small car
    u('photo-1609521263047-f8f205293f24'),   // City driving
  ],
  // Fiat 500
  'fiat_500': [
    u('photo-1595787142240-571e1c4d3833'),   // Fiat 500 iconic
    u('photo-1571127236794-81c0bbfe1ce3'),   // Cute city car
    u('photo-1544636331-e26879cd4d9b'),      // Retro small car
    u('photo-1605559424843-9e4c228bf1c6'),   // Compact cute car
  ],
  // Hyundai i10
  'hyundai_i10': [
    u('photo-1580273916550-e323be2ae537'),   // Hyundai compact
    u('photo-1600712242805-5f78671b24da'),   // Small modern car
    u('photo-1549317661-bd32c8ce0db2'),      // Economy car
    u('photo-1603584173870-7f23fdae1b7a'),   // City car front
  ],
  // Renault Clio 4
  'renault_clio_4': [
    u('photo-1609521263047-f8f205293f24'),
    u('photo-1600712242805-5f78671b24da'),
    u('photo-1549317661-bd32c8ce0db2'),
    u('photo-1603584173870-7f23fdae1b7a'),
  ],

  // -- COMPACTES --
  // Volkswagen Golf
  'volkswagen_golf': [
    u('photo-1533473359331-0135ef1b58bf'),   // VW Golf on road
    u('photo-1471479917193-f00955256257'),   // Golf side view
    u('photo-1541899481282-d53bffe3c35d'),   // VW driving
    u('photo-1568605117036-5fe5e7bab0b0'),   // Golf 8 modern
    u('photo-1606611013016-969c19ba27bb'),   // Hatchback styled
  ],
  // Toyota Corolla
  'toyota_corolla': [
    u('photo-1621007947382-bb3c3994e3fb'),   // Toyota sedan
    u('photo-1559416523-140ddc3d238c'),      // Corolla driving
    u('photo-1619767886558-efdc259cde1a'),   // Modern Toyota
    u('photo-1549317661-bd32c8ce0afa'),      // Sedan view
    u('photo-1583121274602-3e2820c69888'),   // Compact sedan
  ],
  // Peugeot 308
  'peugeot_308': [
    u('photo-1583121274602-3e2820c69888'),   // Sleek compact
    u('photo-1552519507-da3b142c6e3d'),      // Modern hatchback
    u('photo-1617469767053-d3b523a0b982'),   // 308 style
    u('photo-1606611013016-969c19ba27bb'),   // Hatch driving
  ],
  // Renault Megane
  'renault_megane': [
    u('photo-1541899481282-d53bffe3c35d'),   // Renault driving
    u('photo-1533473359331-0135ef1b58bf'),   // Compact road
    u('photo-1606611013016-969c19ba27bb'),   // Hatchback front
    u('photo-1568605117036-5fe5e7bab0b0'),   // Modern compact
  ],
  // Dacia Sandero Stepway
  'dacia_sandero_stepway': [
    u('photo-1600712242805-5f78671b24da'),   // Crossover small
    u('photo-1549317661-bd32c8ce0db2'),      // Stepway outdoors
    u('photo-1603584173870-7f23fdae1b7a'),   // SUV-ish compact
    u('photo-1609521263047-f8f205293f24'),   // Driving shots
  ],
  // Kia Ceed
  'kia_ceed': [
    u('photo-1568605117036-5fe5e7bab0b0'),   // Modern compact
    u('photo-1606611013016-969c19ba27bb'),   // Hatchback
    u('photo-1583121274602-3e2820c69888'),   // Sleek car
    u('photo-1541899481282-d53bffe3c35d'),   // Driving compact
  ],
  // Peugeot 301
  'peugeot_301': [
    u('photo-1549317661-bd32c8ce0afa'),      // Sedan
    u('photo-1583121274602-3e2820c69888'),   // Compact sedan
    u('photo-1559416523-140ddc3d238c'),      // Budget sedan
    u('photo-1549317661-bd32c8ce0db2'),      // Parked sedan
  ],

  // -- BERLINES --
  // Peugeot 508
  'peugeot_508': [
    u('photo-1552519507-da3b142c6e3d'),      // Premium sedan
    u('photo-1494976388531-d1058494cdd8'),   // Luxury sedan
    u('photo-1617469767053-d3b523a0b982'),   // Sleek sedan
    u('photo-1614162692292-7ac56d7f7f1e'),   // Premium look
    u('photo-1606611013016-969c19ba27bb'),   // Executive sedan
  ],
  // Mercedes C-Class
  'mercedes_classe_c': [
    u('photo-1618843479313-40f8afb4b4d8'),   // Mercedes sedan
    u('photo-1617814076668-8dfc6fe1ff09'),   // Mercedes-Benz
    u('photo-1563720223185-11003d516935'),   // Premium Merc
    u('photo-1494976388531-d1058494cdd8'),   // Executive car
    u('photo-1553440569-bcc63803a83d'),      // C-Class elegance
  ],
  // Hyundai Sonata
  'hyundai_sonata': [
    u('photo-1580273916550-e323be2ae537'),   // Hyundai sedan
    u('photo-1559416523-140ddc3d238c'),      // Modern sedan
    u('photo-1549317661-bd32c8ce0afa'),      // Sedan road
    u('photo-1621007947382-bb3c3994e3fb'),   // Driving sedan
  ],
  // Skoda Octavia
  'skoda_octavia': [
    u('photo-1559416523-140ddc3d238c'),      // Euro sedan
    u('photo-1549317661-bd32c8ce0afa'),      // Sedan view
    u('photo-1621007947382-bb3c3994e3fb'),   // Practical sedan
    u('photo-1568605117036-5fe5e7bab0b0'),   // Modern sedan
  ],
  // Hyundai Elantra
  'hyundai_elantra': [
    u('photo-1580273916550-e323be2ae537'),   // Hyundai
    u('photo-1549317661-bd32c8ce0afa'),      // Sedan front
    u('photo-1559416523-140ddc3d238c'),      // Driving sedan
    u('photo-1619767886558-efdc259cde1a'),   // Modern sedan
  ],

  // -- SUV --
  // Dacia Duster
  'dacia_duster': [
    u('photo-1519681393784-d120267933ba'),   // Duster outdoors
    u('photo-1502877338535-766e1452684a'),   // SUV mountain
    u('photo-1533473359331-0135ef1b58bf'),   // SUV road
    u('photo-1609521263047-f8f205293f24'),   // Compact SUV
    u('photo-1549317661-bd32c8ce0db2'),      // SUV parked
  ],
  // Hyundai Tucson
  'hyundai_tucson': [
    u('photo-1580273916550-e323be2ae537'),   // Hyundai SUV
    u('photo-1519681393784-d120267933ba'),   // SUV outdoors
    u('photo-1502877338535-766e1452684a'),   // SUV nature
    u('photo-1606611013016-969c19ba27bb'),   // Modern SUV
    u('photo-1568605117036-5fe5e7bab0b0'),   // Crossover
  ],
  // BMW X3
  'bmw_x3': [
    u('photo-1555215695-3004980ad54e'),      // BMW SUV
    u('photo-1492144534655-ae79c964c9d7'),   // Premium SUV
    u('photo-1503376780353-7e6692767b70'),   // BMW luxury
    u('photo-1618843479313-40f8afb4b4d8'),   // BMW style
    u('photo-1553440569-bcc63803a83d'),      // BMW X-Series
  ],
  // Renault Kadjar
  'renault_kadjar': [
    u('photo-1541899481282-d53bffe3c35d'),   // Renault SUV
    u('photo-1519681393784-d120267933ba'),   // SUV landscape
    u('photo-1502877338535-766e1452684a'),   // SUV nature
    u('photo-1609521263047-f8f205293f24'),   // Crossover
  ],
  // Kia Sportage
  'kia_sportage': [
    u('photo-1568605117036-5fe5e7bab0b0'),   // Modern SUV
    u('photo-1580273916550-e323be2ae537'),   // Korean SUV
    u('photo-1519681393784-d120267933ba'),   // SUV outdoors
    u('photo-1606611013016-969c19ba27bb'),   // Sporty SUV
  ],
  // Peugeot 3008
  'peugeot_3008': [
    u('photo-1552519507-da3b142c6e3d'),      // French SUV
    u('photo-1583121274602-3e2820c69888'),   // Premium crossover
    u('photo-1617469767053-d3b523a0b982'),   // 3008 style
    u('photo-1606611013016-969c19ba27bb'),   // SUV elegant
    u('photo-1568605117036-5fe5e7bab0b0'),   // Crossover
  ],
  // Hyundai Creta
  'hyundai_creta': [
    u('photo-1580273916550-e323be2ae537'),   // Hyundai crossover
    u('photo-1519681393784-d120267933ba'),   // Small SUV
    u('photo-1502877338535-766e1452684a'),   // SUV outdoors
    u('photo-1549317661-bd32c8ce0db2'),      // Compact SUV
  ],
  // Porsche Cayenne
  'porsche_cayenne': [
    u('photo-1503376780353-7e6692767b70'),   // Porsche SUV
    u('photo-1614162692292-7ac56d7f7f1e'),   // Luxury SUV
    u('photo-1492144534655-ae79c964c9d7'),   // Premium drive
    u('photo-1555215695-3004980ad54e'),      // Porsche power
    u('photo-1553440569-bcc63803a83d'),      // Porsche elegance
  ],
  // Range Rover Sport
  'range_rover_sport': [
    u('photo-1494976388531-d1058494cdd8'),   // Range Rover
    u('photo-1503376780353-7e6692767b70'),   // Luxury 4x4
    u('photo-1614162692292-7ac56d7f7f1e'),   // Premium SUV
    u('photo-1492144534655-ae79c964c9d7'),   // British luxury
    u('photo-1553440569-bcc63803a83d'),      // Range elegance
  ],
  // BMW X5
  'bmw_x5': [
    u('photo-1555215695-3004980ad54e'),      // BMW X5
    u('photo-1492144534655-ae79c964c9d7'),   // Premium BMW SUV
    u('photo-1503376780353-7e6692767b70'),   // BMW luxury
    u('photo-1553440569-bcc63803a83d'),      // X5 style
    u('photo-1618843479313-40f8afb4b4d8'),   // BMW power
  ],

  // -- 4x4 --
  // Toyota Land Cruiser
  'toyota_land_cruiser': [
    u('photo-1533473359331-0135ef1b58bf'),   // Land Cruiser
    u('photo-1519681393784-d120267933ba'),   // Off-road
    u('photo-1502877338535-766e1452684a'),   // Mountain 4x4
    u('photo-1485291571150-772bcfc10da5'),   // Desert driving
    u('photo-1609521263047-f8f205293f24'),   // Toyota rugged
  ],
  // Toyota Hilux
  'toyota_hilux': [
    u('photo-1502877338535-766e1452684a'),   // Hilux outdoor
    u('photo-1519681393784-d120267933ba'),   // Pickup adventure
    u('photo-1485291571150-772bcfc10da5'),   // Desert truck
    u('photo-1533473359331-0135ef1b58bf'),   // Rugged truck
  ],
  // Toyota Land Cruiser Prado
  'toyota_land_cruiser_prado': [
    u('photo-1533473359331-0135ef1b58bf'),   // Prado 4x4
    u('photo-1502877338535-766e1452684a'),   // Off-road SUV
    u('photo-1519681393784-d120267933ba'),   // Adventure drive
    u('photo-1485291571150-772bcfc10da5'),   // Desert 4x4
    u('photo-1609521263047-f8f205293f24'),   // Toyota power
  ],
  // Mitsubishi Pajero
  'mitsubishi_pajero': [
    u('photo-1502877338535-766e1452684a'),   // 4x4 adventure
    u('photo-1519681393784-d120267933ba'),   // Off-road
    u('photo-1485291571150-772bcfc10da5'),   // Desert
    u('photo-1533473359331-0135ef1b58bf'),   // Rugged 4x4
  ],
  // Dacia Duster 4x4
  'dacia_duster_4x4': [
    u('photo-1519681393784-d120267933ba'),   // Duster 4x4
    u('photo-1502877338535-766e1452684a'),   // Off-road
    u('photo-1485291571150-772bcfc10da5'),   // Adventure
    u('photo-1533473359331-0135ef1b58bf'),   // Rugged drive
    u('photo-1549317661-bd32c8ce0db2'),      // Duster parked
  ],

  // -- UTILITAIRES --
  // Renault Kangoo
  'renault_kangoo': [
    u('photo-1603584173870-7f23fdae1b7a'),   // Utility van
    u('photo-1549317661-bd32c8ce0db2'),      // Commercial vehicle
    u('photo-1600712242805-5f78671b24da'),   // Van driving
    u('photo-1609521263047-f8f205293f24'),   // Kangoo front
  ],
  // Peugeot Expert
  'peugeot_expert': [
    u('photo-1549317661-bd32c8ce0db2'),      // Commercial van
    u('photo-1603584173870-7f23fdae1b7a'),   // Utility vehicle
    u('photo-1600712242805-5f78671b24da'),   // Van
    u('photo-1541899481282-d53bffe3c35d'),   // Driving van
  ],
  // Dacia Dokker
  'dacia_dokker': [
    u('photo-1603584173870-7f23fdae1b7a'),   // MPV utility
    u('photo-1549317661-bd32c8ce0db2'),      // Commercial
    u('photo-1600712242805-5f78671b24da'),   // Practical vehicle
    u('photo-1609521263047-f8f205293f24'),   // Dokker front
  ],
  // Renault Master
  'renault_master': [
    u('photo-1603584173870-7f23fdae1b7a'),   // Large van
    u('photo-1549317661-bd32c8ce0db2'),      // Commercial van
    u('photo-1541899481282-d53bffe3c35d'),   // Van road
    u('photo-1600712242805-5f78671b24da'),   // Master van
  ],
  // Peugeot Partner
  'peugeot_partner': [
    u('photo-1549317661-bd32c8ce0db2'),      // Partner van
    u('photo-1603584173870-7f23fdae1b7a'),   // Utility
    u('photo-1600712242805-5f78671b24da'),   // Small van
    u('photo-1541899481282-d53bffe3c35d'),   // Van driving
  ],

  // -- MONOSPACE --
  // Toyota Hiace
  'toyota_hiace': [
    u('photo-1549317661-bd32c8ce0db2'),      // Minibus
    u('photo-1603584173870-7f23fdae1b7a'),   // People carrier
    u('photo-1541899481282-d53bffe3c35d'),   // Van road
    u('photo-1600712242805-5f78671b24da'),   // Large vehicle
  ],
  // Kia Carnival
  'kia_carnival': [
    u('photo-1580273916550-e323be2ae537'),   // Kia MPV
    u('photo-1549317661-bd32c8ce0db2'),      // Family van
    u('photo-1603584173870-7f23fdae1b7a'),   // People carrier
    u('photo-1606611013016-969c19ba27bb'),   // Modern MPV
  ],

  // -- LUXE --
  // Mercedes S-Class
  'mercedes_classe_s': [
    u('photo-1618843479313-40f8afb4b4d8'),   // Mercedes luxury
    u('photo-1617814076668-8dfc6fe1ff09'),   // S-Class front
    u('photo-1563720223185-11003d516935'),   // Mercedes premium
    u('photo-1494976388531-d1058494cdd8'),   // Luxury sedan
    u('photo-1553440569-bcc63803a83d'),      // S-Class elegance
  ],
  // BMW Série 5
  'bmw_serie_5': [
    u('photo-1555215695-3004980ad54e'),      // BMW 5 Series
    u('photo-1492144534655-ae79c964c9d7'),   // BMW luxury
    u('photo-1503376780353-7e6692767b70'),   // BMW power
    u('photo-1618843479313-40f8afb4b4d8'),   // Executive BMW
    u('photo-1553440569-bcc63803a83d'),      // BMW 5 elegance
  ],
  // BMW Série 7
  'bmw_serie_7': [
    u('photo-1555215695-3004980ad54e'),      // BMW flagship
    u('photo-1492144534655-ae79c964c9d7'),   // BMW luxury
    u('photo-1503376780353-7e6692767b70'),   // 7 Series
    u('photo-1553440569-bcc63803a83d'),      // BMW premium
    u('photo-1618843479313-40f8afb4b4d8'),   // Executive BMW
  ],
  // Audi A8
  'audi_a8': [
    u('photo-1606611013016-969c19ba27bb'),   // Audi flagship
    u('photo-1494976388531-d1058494cdd8'),   // Audi luxury
    u('photo-1614162692292-7ac56d7f7f1e'),   // A8 premium
    u('photo-1553440569-bcc63803a83d'),      // Audi elegance
    u('photo-1555215695-3004980ad54e'),      // German luxury
  ],

  // -- SPORT --
  // Porsche 911
  'porsche_911': [
    u('photo-1503376780353-7e6692767b70'),   // Porsche 911
    u('photo-1492144534655-ae79c964c9d7'),   // Sports car
    u('photo-1614162692292-7ac56d7f7f1e'),   // Porsche power
    u('photo-1544636331-e26879cd4d9b'),      // 911 iconic
    u('photo-1555215695-3004980ad54e'),      // Porsche driving
  ],

  // -- CABRIOLET --
  // BMW Série 4 Cabriolet
  'bmw_serie_4_cabriolet': [
    u('photo-1555215695-3004980ad54e'),      // BMW convertible
    u('photo-1544636331-e26879cd4d9b'),      // Cabriolet
    u('photo-1492144534655-ae79c964c9d7'),   // Open top BMW
    u('photo-1503376780353-7e6692767b70'),   // BMW sport
    u('photo-1553440569-bcc63803a83d'),      // Elegant convert
  ],

  // -- ELECTRIQUE --
  // Renault Zoe
  'renault_zoe': [
    u('photo-1593941707882-a5bba14938c7'),   // Electric car
    u('photo-1560958089-b8a1929cea89'),      // EV charging
    u('photo-1609521263047-f8f205293f24'),   // Small EV
    u('photo-1600712242805-5f78671b24da'),   // Electric vehicle
  ],
};

// =============================================================================
// Matching logic: brand + model → photo key
// =============================================================================

function getPhotoKey(brand, model) {
  const b = brand.toLowerCase().replace(/[^a-z0-9]/g, '');
  const m = model.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().replace(/\s+/g, '_');
  const key = `${b}_${m}`;

  // Try exact match first
  if (PHOTOS[key]) return key;

  // Try partial matches
  for (const k of Object.keys(PHOTOS)) {
    if (key.startsWith(k) || k.startsWith(key)) return k;
    // Match brand + first part of model
    if (key.includes(k.split('_').slice(0, 2).join('_'))) return k;
  }

  // Fallback by brand
  const brandKey = Object.keys(PHOTOS).find(k => k.startsWith(b + '_'));
  if (brandKey) return brandKey;

  return null;
}

// =============================================================================
// Main: fetch all vehicles and update photos
// =============================================================================

async function main() {
  const { data: vehicles, error } = await supabase
    .from('rental_vehicles')
    .select('id, brand, model, category')
    .order('establishment_id')
    .order('category')
    .order('brand');

  if (error) {
    console.error('Error fetching vehicles:', error);
    process.exit(1);
  }

  console.log(`Found ${vehicles.length} vehicles to update\n`);

  let updated = 0;
  let skipped = 0;

  for (const v of vehicles) {
    const photoKey = getPhotoKey(v.brand, v.model);
    if (!photoKey || !PHOTOS[photoKey]) {
      console.log(`  SKIP: ${v.brand} ${v.model} (${v.category}) — no photos mapped`);
      skipped++;
      continue;
    }

    const photos = PHOTOS[photoKey];
    const { error: updateError } = await supabase
      .from('rental_vehicles')
      .update({ photos })
      .eq('id', v.id);

    if (updateError) {
      console.error(`  ERROR updating ${v.brand} ${v.model}:`, updateError.message);
    } else {
      console.log(`  ✅ ${v.brand} ${v.model} (${v.category}) → ${photos.length} photos [${photoKey}]`);
      updated++;
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped`);
}

main();
