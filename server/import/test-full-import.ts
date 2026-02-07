/**
 * Test complet du pipeline d'import
 * Simule exactement ce que fait l'import admin
 *
 * Usage: npx tsx server/import/test-full-import.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

import { initializeConnectors } from "./importer";
import { getConnector } from "./connectors/base";
import { normalizeBatch } from "./normalizer";
import { deduplicateBatch } from "./deduplicator";

// Charger les variables d'environnement
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testFullImport() {
  console.log("=== Test Full Import Pipeline ===\n");

  // 1. Initialiser les connecteurs
  console.log("1. Initialisation des connecteurs...");
  initializeConnectors();

  // 2. Créer un batch test
  console.log("\n2. Création d'un batch test...");
  const { data: batch, error: batchError } = await supabase
    .from("establishment_import_batches")
    .insert({
      sources: ["sortiraumaroc"],
      cities: ["casablanca"],
      categories: ["restaurant"],
      status: "running",
      started_at: new Date().toISOString(),
      started_by: "test-script",
    })
    .select()
    .single();

  if (batchError) {
    console.error("❌ Erreur création batch:", batchError.message);
    return;
  }

  console.log("✅ Batch créé:", batch.id);

  try {
    // 3. Récupérer les données du connecteur
    console.log("\n3. Scraping sortiraumaroc/casablanca/restaurant...");
    const connector = getConnector("sortiraumaroc");

    if (!connector) {
      throw new Error("Connector sortiraumaroc not found");
    }

    const result = await connector.search({
      city: "casablanca",
      category: "restaurant",
      limit: 10,
    });

    console.log("   - Success:", result.success);
    console.log("   - Places fetched:", result.places.length);
    console.log("   - Duration:", result.durationMs, "ms");

    if (!result.success || result.places.length === 0) {
      console.log("❌ Aucun résultat du scraper");
      await cleanupBatch(batch.id);
      return;
    }

    // 4. Normaliser
    console.log("\n4. Normalisation...");
    const normalized = normalizeBatch(result.places);
    console.log("   - Normalized:", normalized.length, "places");

    if (normalized.length === 0) {
      console.log("❌ Normalisation a échoué");
      await cleanupBatch(batch.id);
      return;
    }

    // Afficher le premier résultat normalisé
    console.log("\n   Premier résultat normalisé:");
    console.log("   - Name:", normalized[0].name);
    console.log("   - City:", normalized[0].city);
    console.log("   - Category:", normalized[0].category);

    // 5. Dédupliquer
    console.log("\n5. Déduplication...");
    const deduped = await deduplicateBatch(normalized);
    console.log("   - Deduped:", deduped.length, "places");
    console.log(
      "   - Duplicates:",
      deduped.filter((d) => d.dedupe.isLikelyDuplicate).length
    );

    // 6. Insérer en staging
    console.log("\n6. Insertion en staging...");
    let inserted = 0;
    let errors = 0;

    for (const { place, dedupe } of deduped) {
      try {
        const { data, error } = await supabase
          .from("establishment_import_staging")
          .insert({
            name: place.name,
            name_normalized: place.nameNormalized,
            category: place.category,
            subcategory: place.subcategory,
            description_short: place.descriptionShort,
            address_full: place.addressFull,
            city: place.city,
            neighborhood: place.neighborhood,
            phone_e164: place.phoneE164,
            website_url: place.websiteUrl,
            email: place.email,
            google_maps_url: place.googleMapsUrl,
            latitude: place.latitude,
            longitude: place.longitude,
            opening_hours: place.openingHours,
            price_range: place.priceRange,
            tags: place.tags,
            social_links: place.socialLinks,
            photos: place.photos,
            sources: place.sources,
            payload_raw: place.payloadRaw,
            dedupe_candidates:
              dedupe.candidates.length > 0 ? dedupe.candidates : null,
            confidence_score: dedupe.confidenceScore,
            status: "new",
            import_batch_id: batch.id,
          })
          .select("id")
          .single();

        if (error) {
          console.log(`   ❌ ${place.name}: ${error.message}`);
          errors++;
        } else {
          inserted++;
        }
      } catch (err) {
        console.log(`   ❌ ${place.name}: ${(err as Error).message}`);
        errors++;
      }
    }

    console.log(`\n   ✅ Inserted: ${inserted}/${deduped.length}`);
    console.log(`   ❌ Errors: ${errors}`);

    // 7. Mettre à jour le batch
    console.log("\n7. Mise à jour du batch...");
    const { error: updateError } = await supabase
      .from("establishment_import_batches")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        total_fetched: result.places.length,
        total_normalized: normalized.length,
        total_duplicates: deduped.filter((d) => d.dedupe.isLikelyDuplicate)
          .length,
        total_errors: errors,
      })
      .eq("id", batch.id);

    if (updateError) {
      console.log("   ❌ Erreur mise à jour:", updateError.message);
    } else {
      console.log("   ✅ Batch mis à jour");
    }

    // 8. Vérifier le contenu
    console.log("\n8. Vérification finale...");
    const { data: staging, count } = await supabase
      .from("establishment_import_staging")
      .select("*", { count: "exact" })
      .eq("import_batch_id", batch.id);

    console.log(`   - Entrées en staging: ${count}`);

    if (staging && staging.length > 0) {
      console.log("\n   Premiers établissements insérés:");
      staging.slice(0, 3).forEach((s, i) => {
        console.log(`   ${i + 1}. ${s.name} (${s.city})`);
      });
    }

    console.log("\n=== Test terminé avec succès! ===");
    console.log(`\nBatch ID: ${batch.id}`);
    console.log("Vous pouvez voir les résultats dans l'admin UI ou dans Supabase.");
  } catch (err) {
    console.error("\n❌ Erreur:", (err as Error).message);
    await cleanupBatch(batch.id);
  }
}

async function cleanupBatch(batchId: string) {
  console.log("\nNettoyage du batch test...");
  await supabase
    .from("establishment_import_staging")
    .delete()
    .eq("import_batch_id", batchId);
  await supabase.from("establishment_import_batches").delete().eq("id", batchId);
  console.log("✅ Batch supprimé");
}

testFullImport().catch(console.error);
