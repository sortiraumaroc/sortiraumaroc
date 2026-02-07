/**
 * Test des valeurs de statut d'établissement acceptées
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testStatuses() {
  console.log("=== Test des valeurs de statut ===\n");

  // Récupérer un établissement existant pour tester
  const { data: existing } = await supabase
    .from("establishments")
    .select("id, name, status")
    .limit(5);

  console.log("Statuts existants :");
  existing?.forEach(e => console.log(`  - ${e.name}: "${e.status}"`));

  // Tester différentes valeurs de statut
  const testStatuses = [
    "pending",
    "active",
    "rejected",
    "disabled",
    "suspended",
    "inactive",
    "paused",
  ];

  console.log("\n=== Test de mise à jour du statut ===\n");

  // Utiliser un ID existant pour tester
  const testId = existing?.[0]?.id;
  const originalStatus = existing?.[0]?.status;

  if (!testId) {
    console.log("Aucun établissement trouvé pour tester");
    return;
  }

  console.log(`Test sur: ${existing?.[0]?.name} (statut actuel: ${originalStatus})\n`);

  for (const status of testStatuses) {
    const { error } = await supabase
      .from("establishments")
      .update({ status })
      .eq("id", testId);

    if (error) {
      console.log(`❌ "${status}": ${error.message}`);
    } else {
      console.log(`✅ "${status}": OK`);
    }
  }

  // Restaurer le statut original
  await supabase
    .from("establishments")
    .update({ status: originalStatus })
    .eq("id", testId);

  console.log(`\nStatut restauré à "${originalStatus}"`);
}

testStatuses().catch(console.error);
