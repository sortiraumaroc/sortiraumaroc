/**
 * Fix: Copy google_maps_url into social_links.google_maps for ftour 2026 imports.
 *
 * The import script wrote the Google Maps URL to the `google_maps_url` column
 * but forgot to also set `social_links.google_maps`, which is what the admin UI reads.
 *
 * Usage: node scripts/fix-social-links-google-maps.mjs [--dry-run]
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`=== Fix social_links.google_maps ${DRY_RUN ? "(DRY RUN)" : "(LIVE)"} ===\n`);

  // Fetch ALL establishments that have google_maps_url set
  // (covers both the 90 created + 46 existing updated by the import)
  const PAGE_SIZE = 1000;
  let data = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data: page, error: pageErr } = await supabase
      .from("establishments")
      .select("id, name, city, google_maps_url, social_links")
      .not("google_maps_url", "is", null)
      .range(from, from + PAGE_SIZE - 1);
    if (pageErr) {
      console.error("Error fetching:", pageErr.message);
      process.exit(1);
    }
    data = data.concat(page || []);
    hasMore = (page || []).length === PAGE_SIZE;
    from += PAGE_SIZE;
  }
  const error = null;

  if (error) {
    console.error("Error fetching:", error.message);
    process.exit(1);
  }

  console.log(`Total ftour_2026 establishments: ${data.length}`);

  const needFix = data.filter(
    (e) => e.google_maps_url && !(e.social_links && e.social_links.google_maps)
  );
  const alreadyOk = data.filter(
    (e) => e.social_links && e.social_links.google_maps
  );
  const noUrl = data.filter((e) => !e.google_maps_url);

  console.log(`Need fix (have google_maps_url, missing social_links.google_maps): ${needFix.length}`);
  console.log(`Already OK (social_links.google_maps present): ${alreadyOk.length}`);
  console.log(`No google_maps_url at all: ${noUrl.length}\n`);

  if (needFix.length === 0) {
    console.log("Nothing to fix!");
    return;
  }

  let fixed = 0;
  let errors = 0;

  for (const est of needFix) {
    const mergedSocial = {
      ...(est.social_links || {}),
      google_maps: est.google_maps_url,
    };

    if (DRY_RUN) {
      console.log(`  [DRY] ${est.name} (${est.city}) → would set social_links.google_maps`);
      fixed++;
      continue;
    }

    const { error: updateErr } = await supabase
      .from("establishments")
      .update({ social_links: mergedSocial })
      .eq("id", est.id);

    if (updateErr) {
      console.log(`  ERROR ${est.name}: ${updateErr.message}`);
      errors++;
    } else {
      console.log(`  OK ${est.name} (${est.city})`);
      fixed++;
    }
  }

  console.log(`\n=== RÉSUMÉ ===`);
  console.log(`Fixed: ${fixed}`);
  console.log(`Errors: ${errors}`);
  console.log(`Already OK: ${alreadyOk.length}`);
  console.log(`No URL: ${noUrl.length}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
