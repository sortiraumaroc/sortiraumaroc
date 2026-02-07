/**
 * Test d'exécution d'un batch complet (sans DB)
 */

import { initializeConnectors } from "./importer";
import { getConnector } from "./connectors/base";
import { normalizeBatch } from "./normalizer";
import { logImport } from "./utils";
import type { ImportSource, ChrCategory } from "./connectors/types";

async function testBatch() {
  console.log("=== Test Batch Execution ===\n");

  // Initialiser
  initializeConnectors();

  const sources: ImportSource[] = ["sortiraumaroc"];
  const cities = ["casablanca"];
  const categories: ChrCategory[] | undefined = undefined; // Toutes les catégories

  console.log("Config:", { sources, cities, categories });
  console.log("");

  for (const source of sources) {
    const connector = getConnector(source);

    if (!connector) {
      console.log(`❌ Connector not found: ${source}`);
      continue;
    }

    console.log(`✅ Connector found: ${source}`);

    if (!(await connector.isAvailable())) {
      console.log(`❌ Connector not available: ${source}`);
      continue;
    }

    console.log(`✅ Connector available: ${source}`);

    for (const city of cities) {
      // Si pas de catégorie spécifiée, on utilise "restaurant" pour le test
      const categoriesToSearch = categories || (["restaurant"] as ChrCategory[]);

      for (const category of categoriesToSearch) {
        console.log(`\n--- Searching: ${source}/${city}/${category || "all"} ---`);

        try {
          const result = await connector.search({
            city,
            category,
            limit: 10,
          });

          console.log("Success:", result.success);
          console.log("Duration:", result.durationMs, "ms");
          console.log("Places fetched:", result.places.length);

          if (result.error) {
            console.log("Error:", result.error);
          }

          if (result.places.length > 0) {
            console.log("\n--- Normalizing ---");
            const normalized = normalizeBatch(result.places);
            console.log("Normalized:", normalized.length);

            if (normalized.length > 0) {
              console.log("\nFirst normalized place:");
              console.log("- Name:", normalized[0].name);
              console.log("- City:", normalized[0].city);
              console.log("- Address:", normalized[0].addressFull);
            }
          }
        } catch (err) {
          console.log("❌ Error:", (err as Error).message);
        }
      }
    }
  }
}

testBatch().catch(console.error);
