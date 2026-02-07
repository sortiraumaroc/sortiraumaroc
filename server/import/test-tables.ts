/**
 * Script de test pour vérifier si les tables d'import existent dans Supabase
 *
 * Usage: npx tsx server/import/test-tables.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

// Charger les variables d'environnement
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkTables() {
  console.log("=== Vérification des tables d'import ===\n");
  console.log("Supabase URL:", supabaseUrl);
  console.log("");

  const tables = [
    "establishment_import_batches",
    "establishment_import_staging",
    "establishment_import_logs",
    "chr_categories",
    "import_sources",
  ];

  for (const table of tables) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });

      if (error) {
        console.log(`❌ ${table}: ERREUR - ${error.message}`);
        if (error.code === "PGRST116" || error.message.includes("does not exist")) {
          console.log(`   → La table n'existe pas, migration nécessaire`);
        }
      } else {
        console.log(`✅ ${table}: OK (${count ?? 0} entrées)`);
      }
    } catch (err) {
      console.log(`❌ ${table}: EXCEPTION - ${(err as Error).message}`);
    }
  }

  console.log("\n=== Test insertion dans staging ===\n");

  // Tenter une insertion test
  try {
    const testPlace = {
      name: "TEST - À SUPPRIMER",
      name_normalized: "test a supprimer",
      city: "casablanca",
      status: "new",
      sources: [{ source: "test", fetched_at: new Date().toISOString() }],
    };

    const { data, error } = await supabase
      .from("establishment_import_staging")
      .insert(testPlace)
      .select()
      .single();

    if (error) {
      console.log("❌ Insertion test échouée:", error.message);
    } else {
      console.log("✅ Insertion test réussie! ID:", data.id);

      // Supprimer l'entrée test
      const { error: deleteError } = await supabase
        .from("establishment_import_staging")
        .delete()
        .eq("id", data.id);

      if (deleteError) {
        console.log("⚠️ Impossible de supprimer l'entrée test:", deleteError.message);
      } else {
        console.log("✅ Entrée test supprimée");
      }
    }
  } catch (err) {
    console.log("❌ Exception lors du test:", (err as Error).message);
  }

  console.log("\n=== Fin des vérifications ===");
}

checkTables().catch(console.error);
