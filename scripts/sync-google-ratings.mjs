import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BASE = 'https://maps.googleapis.com/maps/api/place';

async function extractPlaceId(url, name, city) {
  if (!url && !name) return null;
  if (url.startsWith('ChIJ')) return url;

  const m = url.match(/!1s(0x[a-f0-9]+:[a-f0-9]+)/i) || url.match(/place_id[=:]([A-Za-z0-9_-]+)/);
  if (m) return m[1];

  const query = (name + ' ' + city).trim();
  if (!query) return null;
  try {
    const u = new URL(BASE + '/findplacefromtext/json');
    u.searchParams.set('input', query);
    u.searchParams.set('inputtype', 'textquery');
    u.searchParams.set('fields', 'place_id');
    u.searchParams.set('key', GOOGLE_API_KEY);
    u.searchParams.set('language', 'fr');
    const r = await fetch(u.toString());
    const d = await r.json();
    if (d.status === 'OK' && d.candidates?.[0]?.place_id) return d.candidates[0].place_id;
  } catch {}
  return null;
}

async function getRating(placeId) {
  try {
    const u = new URL(BASE + '/details/json');
    u.searchParams.set('place_id', placeId);
    u.searchParams.set('fields', 'rating,user_ratings_total');
    u.searchParams.set('key', GOOGLE_API_KEY);
    const r = await fetch(u.toString());
    const d = await r.json();
    if (d.status !== 'OK' || !d.result) return null;
    return { rating: d.result.rating ?? 0, reviews: d.result.user_ratings_total ?? 0 };
  } catch { return null; }
}

async function main() {
  console.log('API Key configured:', GOOGLE_API_KEY ? 'YES (' + GOOGLE_API_KEY.substring(0, 8) + '...)' : 'NO');

  if (!GOOGLE_API_KEY) {
    console.error('GOOGLE_PLACES_API_KEY not set!');
    process.exit(1);
  }

  const { data: ests, error } = await supabase
    .from('establishments')
    .select('id,name,city,google_maps_url,google_place_id')
    .eq('status', 'active')
    .not('google_maps_url', 'is', null)
    .neq('google_maps_url', '')
    .order('name')
    .limit(200);

  if (error) { console.log('DB Error:', error.message); return; }
  console.log('Processing', ests.length, 'establishments...\n');

  let ok = 0, noPlace = 0, apiErr = 0;

  for (const est of ests) {
    let placeId = est.google_place_id || null;

    if (!placeId) {
      placeId = await extractPlaceId(est.google_maps_url || '', est.name || '', est.city || '');
    }

    if (!placeId) {
      console.log('✗ NO PLACE_ID:', est.name);
      noPlace++;
      await supabase.from('establishments').update({ google_rating_updated_at: new Date().toISOString() }).eq('id', est.id);
      await new Promise(r => setTimeout(r, 100));
      continue;
    }

    const rating = await getRating(placeId);
    if (!rating) {
      console.log('✗ API ERROR:', est.name, '(placeId:', placeId, ')');
      apiErr++;
      await new Promise(r => setTimeout(r, 200));
      continue;
    }

    await supabase.from('establishments').update({
      google_rating: rating.rating,
      google_review_count: rating.reviews,
      google_place_id: placeId,
      google_rating_updated_at: new Date().toISOString(),
    }).eq('id', est.id);

    console.log('✓', est.name, '→', rating.rating, '(' + rating.reviews, 'avis)');
    ok++;
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n=== DONE ===');
  console.log('Success:', ok, '| No Place ID:', noPlace, '| API Error:', apiErr, '| Total:', ests.length);
}

main();
