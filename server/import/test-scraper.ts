/**
 * Script de test pour le scraper sortiraumaroc
 *
 * Usage: npx tsx server/import/test-scraper.ts
 */

import { createSortirAuMarocConnector } from "./connectors/sortiraumaroc";

async function main() {
  console.log("=== Test Scraper SortirAuMaroc ===\n");

  // Créer le connecteur
  const connector = createSortirAuMarocConnector();

  // Tester avec Casablanca et la catégorie restaurant
  console.log("Testing search for: Casablanca / restaurant\n");

  const result = await connector.search({
    city: "casablanca",
    category: "restaurant",
    limit: 5, // Limiter à 5 pour le test
  });

  console.log("\n=== Results ===");
  console.log("Success:", result.success);
  console.log("Duration:", result.durationMs, "ms");
  console.log("Places found:", result.places.length);
  console.log("Error:", result.error || "none");

  if (result.places.length > 0) {
    console.log("\n=== First Place ===");
    const first = result.places[0];
    console.log("Name:", first.name);
    console.log("City:", first.city);
    console.log("Address:", first.address);
    console.log("Phone:", first.phone);
    console.log("URL:", first.sourceUrl);
  }
}

main().catch(console.error);
