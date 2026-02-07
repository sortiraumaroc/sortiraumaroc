/**
 * Script pour examiner le schéma de la table establishments
 *
 * Usage: npx tsx server/import/test-schema.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSchema() {
  console.log("=== Examen du schéma establishments ===\n");

  // Récupérer les colonnes de la table
  const { data: columns, error: colError } = await supabase.rpc("get_table_columns", {
    p_table_name: "establishments"
  });

  if (colError) {
    console.log("RPC non disponible, essayons une autre méthode...\n");

    // Méthode alternative : récupérer un établissement et voir ses colonnes
    const { data: sample, error: sampleError } = await supabase
      .from("establishments")
      .select("*")
      .limit(1)
      .single();

    if (sampleError) {
      console.log("Erreur:", sampleError.message);
    } else if (sample) {
      console.log("Colonnes de la table establishments:");
      const keys = Object.keys(sample).sort();
      keys.forEach(key => {
        const value = (sample as any)[key];
        console.log(`  - ${key}: ${typeof value} = ${JSON.stringify(value)?.substring(0, 50)}`);
      });
    }
  } else {
    console.log("Colonnes:", columns);
  }

  // Chercher les enums
  console.log("\n=== Vérification des enums ===\n");

  // Essayer de récupérer les valeurs enum de booking_kind
  const { data: enums, error: enumError } = await supabase.rpc("pg_catalog.pg_enum", {});

  if (enumError) {
    console.log("Impossible de récupérer les enums directement");
  }

  // Tester une insertion avec différentes valeurs
  console.log("\n=== Test d'insertion ===\n");

  const testValues = ["restaurants", "restaurant", "bar", "cafe", null];

  for (const universe of testValues) {
    console.log(`Test avec universe = "${universe}"...`);

    const { error } = await supabase
      .from("establishments")
      .insert({
        name: "TEST DELETE ME",
        slug: `test-delete-me-${Date.now()}`,
        universe: universe,
        city: "casablanca",
        status: "pending",
        verified: false,
      })
      .select("id")
      .single();

    if (error) {
      console.log(`  ❌ Erreur: ${error.message}`);
    } else {
      console.log(`  ✅ OK!`);
      // Supprimer le test
      await supabase.from("establishments").delete().eq("name", "TEST DELETE ME");
    }
  }
}

checkSchema().catch(console.error);
