/**
 * Test plus approfondi du schéma establishments
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testSchema() {
  console.log("=== Test des valeurs d'univers ===\n");

  // D'abord, listons les univers existants
  const { data: existing } = await supabase
    .from("establishments")
    .select("universe, subcategory")
    .not("universe", "is", null)
    .limit(50);

  const universes = new Set<string>();
  const subcategories = new Set<string>();

  existing?.forEach(e => {
    if (e.universe) universes.add(e.universe);
    if (e.subcategory) subcategories.add(e.subcategory);
  });

  console.log("Univers existants:", [...universes].sort());
  console.log("Subcatégories existantes:", [...subcategories].sort());

  console.log("\n=== Tests d'insertion ===\n");

  // Tester avec des univers existants
  const testCases = [
    { universe: "loisir", subcategory: "Spa" },
    { universe: "restaurant", subcategory: "Restaurant" },
    { universe: "restaurant", subcategory: "Café" },
    { universe: "beaute", subcategory: "Coiffeur" },
    { universe: "shopping", subcategory: "Boutique" },
    { universe: "restaurants", subcategory: "Restaurant" }, // pluriel
    { universe: "chr", subcategory: "Restaurant" }, // test CHR
  ];

  for (const test of testCases) {
    const slug = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const { data, error } = await supabase
      .from("establishments")
      .insert({
        name: "TEST DELETE ME",
        slug,
        universe: test.universe,
        subcategory: test.subcategory,
        city: "casablanca",
        status: "pending",
        verified: false,
      })
      .select("id, universe, subcategory")
      .single();

    if (error) {
      console.log(`❌ universe="${test.universe}", subcategory="${test.subcategory}"`);
      console.log(`   Erreur: ${error.message}`);
    } else {
      console.log(`✅ universe="${test.universe}", subcategory="${test.subcategory}" → ID: ${data.id}`);
      // Supprimer
      await supabase.from("establishments").delete().eq("id", data.id);
    }
  }
}

testSchema().catch(console.error);
