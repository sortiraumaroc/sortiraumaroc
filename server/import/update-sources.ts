/**
 * Script pour mettre à jour les sources d'import dans Supabase
 *
 * Usage: npx tsx server/import/update-sources.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateSources() {
  console.log("=== Mise à jour des sources d'import ===\n");

  // 1. Désactiver toutes les anciennes sources
  const { error: disableErr } = await supabase
    .from("import_sources")
    .update({ enabled: false })
    .neq("slug", "google")
    .neq("slug", "madeincity");

  if (disableErr) {
    console.log("Erreur lors de la désactivation:", disableErr.message);
  } else {
    console.log("✅ Anciennes sources désactivées");
  }

  // 2. Mettre à jour/insérer les nouvelles sources
  const sources = [
    {
      slug: "google",
      name: "Google Maps",
      type: "api",
      base_url: "https://maps.googleapis.com/maps/api/place",
      rate_limit_per_second: 10,
      config: {
        fields: [
          "name",
          "formatted_address",
          "formatted_phone_number",
          "website",
          "geometry",
          "opening_hours",
          "photos",
          "price_level",
          "rating",
          "reviews",
        ],
      },
      enabled: true,
    },
    {
      slug: "madeincity",
      name: "Made In City",
      type: "scraper",
      base_url: "https://madein.city",
      rate_limit_per_second: 0.5,
      config: { respectRobots: true },
      enabled: true,
    },
  ];

  for (const source of sources) {
    const { error } = await supabase.from("import_sources").upsert(source, {
      onConflict: "slug",
    });

    if (error) {
      console.log(`❌ Erreur pour ${source.slug}:`, error.message);
    } else {
      console.log(`✅ ${source.name} configuré`);
    }
  }

  // 3. Afficher les sources actives
  console.log("\n=== Sources actives ===\n");
  const { data: activeSources } = await supabase
    .from("import_sources")
    .select("slug, name, type, enabled")
    .eq("enabled", true)
    .order("slug");

  activeSources?.forEach((s) => {
    console.log(`  - ${s.name} (${s.slug}) - ${s.type}`);
  });

  console.log("\n✅ Mise à jour terminée");
}

updateSources().catch(console.error);
