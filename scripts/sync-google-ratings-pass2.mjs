import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BASE = 'https://maps.googleapis.com/maps/api/place';

async function findPlaceByName(name, city) {
  const query = (name + ' ' + city + ' Maroc').trim();
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
  // Get establishments where rating is still null (failed in pass 1)
  const { data: ests, error } = await supabase
    .from('establishments')
    .select('id,name,city,google_maps_url,google_place_id,google_rating')
    .eq('status', 'active')
    .not('google_maps_url', 'is', null)
    .neq('google_maps_url', '')
    .is('google_rating', null)
    .order('name')
    .limit(200);

  if (error) { console.log('DB Error:', error.message); return; }
  console.log('Pass 2: Processing', ests.length, 'establishments with missing ratings...\n');

  let ok = 0, fail = 0;

  for (const est of ests) {
    // Force lookup by name (ignore cached bad place_id)
    const placeId = await findPlaceByName(est.name || '', est.city || '');

    if (!placeId) {
      console.log('  SKIP (no match):', est.name, '|', est.city);
      fail++;
      await new Promise(r => setTimeout(r, 200));
      continue;
    }

    const rating = await getRating(placeId);
    if (!rating) {
      console.log('  SKIP (no rating):', est.name);
      fail++;
      await new Promise(r => setTimeout(r, 200));
      continue;
    }

    await supabase.from('establishments').update({
      google_rating: rating.rating,
      google_review_count: rating.reviews,
      google_place_id: placeId,
      google_rating_updated_at: new Date().toISOString(),
    }).eq('id', est.id);

    console.log('  OK:', est.name, '→', rating.rating, '(' + rating.reviews + ' avis)');
    ok++;
    await new Promise(r => setTimeout(r, 250));
  }

  console.log('\nPass 2 DONE: Success:', ok, '| Failed:', fail);
}

main();
