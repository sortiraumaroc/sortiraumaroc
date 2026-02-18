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

// New options to add for each establishment
const HERTZ = '11111111-aaaa-bbbb-cccc-000000000001';
const SAHARACAR = '11111111-aaaa-bbbb-cccc-000000000002';
const CASARENT = '11111111-aaaa-bbbb-cccc-000000000003';
const ATLANTIC = '11111111-aaaa-bbbb-cccc-000000000004';
const PRESTIGE = '11111111-aaaa-bbbb-cccc-000000000005';
const FESAUTO = '11111111-aaaa-bbbb-cccc-000000000006';

const newOptions = [
  // HERTZ - new options
  { establishment_id: HERTZ, name: 'Protection pare-brise', description: 'Couverture des dommages au pare-brise et vitres latérales', price: 35, price_type: 'per_day', is_mandatory: false, sort_order: 9, is_active: true },
  { establishment_id: HERTZ, name: 'Protection pneumatiques', description: 'Couverture des crevaisons et dommages aux pneus', price: 25, price_type: 'per_day', is_mandatory: false, sort_order: 10, is_active: true },
  { establishment_id: HERTZ, name: 'Assistance routière premium', description: 'Assistance 24h/24 avec véhicule de remplacement en cas de panne', price: 45, price_type: 'per_day', is_mandatory: false, sort_order: 11, is_active: true },
  { establishment_id: HERTZ, name: 'Rehausseur enfant', description: 'Rehausseur pour enfant (4-10 ans)', price: 40, price_type: 'per_day', is_mandatory: false, sort_order: 12, is_active: true },
  { establishment_id: HERTZ, name: 'Porte-bagages', description: 'Coffre de toit pour bagages supplémentaires', price: 100, price_type: 'per_day', is_mandatory: false, sort_order: 13, is_active: true },
  { establishment_id: HERTZ, name: 'Passage de frontière', description: 'Autorisation de circuler dans un autre pays (Espagne)', price: 300, price_type: 'fixed', is_mandatory: false, sort_order: 14, is_active: true },

  // SAHARACAR - new options
  { establishment_id: SAHARACAR, name: 'Protection pare-brise', description: 'Couverture pare-brise et vitres', price: 30, price_type: 'per_day', is_mandatory: false, sort_order: 9, is_active: true },
  { establishment_id: SAHARACAR, name: 'Protection pneumatiques', description: 'Protection crevaisons et pneus', price: 20, price_type: 'per_day', is_mandatory: false, sort_order: 10, is_active: true },
  { establishment_id: SAHARACAR, name: 'Rehausseur enfant', description: 'Rehausseur enfant (4-10 ans)', price: 30, price_type: 'per_day', is_mandatory: false, sort_order: 11, is_active: true },

  // CASARENT - new options
  { establishment_id: CASARENT, name: 'Protection pare-brise', description: 'Couverture pare-brise', price: 25, price_type: 'per_day', is_mandatory: false, sort_order: 8, is_active: true },
  { establishment_id: CASARENT, name: 'Rehausseur enfant', description: 'Rehausseur enfant (4-10 ans)', price: 25, price_type: 'per_day', is_mandatory: false, sort_order: 9, is_active: true },

  // ATLANTIC - new options
  { establishment_id: ATLANTIC, name: 'Protection pare-brise', description: 'Couverture pare-brise et vitres', price: 30, price_type: 'per_day', is_mandatory: false, sort_order: 9, is_active: true },
  { establishment_id: ATLANTIC, name: 'Protection pneumatiques', description: 'Protection pneus et crevaisons', price: 20, price_type: 'per_day', is_mandatory: false, sort_order: 10, is_active: true },
  { establishment_id: ATLANTIC, name: 'Rehausseur enfant', description: 'Rehausseur enfant (4-10 ans)', price: 30, price_type: 'per_day', is_mandatory: false, sort_order: 11, is_active: true },

  // PRESTIGE - new options
  { establishment_id: PRESTIGE, name: 'Protection pare-brise', description: 'Protection premium pare-brise et vitres', price: 45, price_type: 'per_day', is_mandatory: false, sort_order: 10, is_active: true },
  { establishment_id: PRESTIGE, name: 'Protection pneumatiques', description: 'Protection premium des pneumatiques', price: 35, price_type: 'per_day', is_mandatory: false, sort_order: 11, is_active: true },
  { establishment_id: PRESTIGE, name: 'Assistance routière premium', description: 'Assistance VIP 24h/24 avec véhicule de remplacement', price: 60, price_type: 'per_day', is_mandatory: false, sort_order: 12, is_active: true },
  { establishment_id: PRESTIGE, name: 'Passage de frontière', description: 'Autorisation passage frontière (Espagne/Portugal)', price: 500, price_type: 'fixed', is_mandatory: false, sort_order: 13, is_active: true },

  // FESAUTO - new options
  { establishment_id: FESAUTO, name: 'Protection pare-brise', description: 'Couverture pare-brise', price: 20, price_type: 'per_day', is_mandatory: false, sort_order: 8, is_active: true },
  { establishment_id: FESAUTO, name: 'Rehausseur enfant', description: 'Rehausseur enfant (4-10 ans)', price: 25, price_type: 'per_day', is_mandatory: false, sort_order: 9, is_active: true },
];

const { data, error } = await supabase
  .from('rental_options')
  .insert(newOptions)
  .select('id, establishment_id, name');

if (error) {
  console.error('Error:', error);
  process.exit(1);
} else {
  console.log(`✅ ${data.length} nouvelles options ajoutées`);
  // Group by establishment
  const grouped = {};
  for (const opt of data) {
    if (!grouped[opt.establishment_id]) grouped[opt.establishment_id] = [];
    grouped[opt.establishment_id].push(opt.name);
  }
  for (const [estId, names] of Object.entries(grouped)) {
    console.log(`  ${estId.slice(-1)}: ${names.join(', ')}`);
  }
}
