/**
 * Test de validation d'une entrée staging
 *
 * Usage: npx tsx server/import/test-approve.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Mapping des catégories
const CHR_CATEGORY_TO_SUBCATEGORY: Record<string, string> = {
  restaurant: "Restaurant",
  cafe: "Café",
  bar: "Bar",
  rooftop: "Rooftop",
  lounge: "Lounge",
  patisserie: "Pâtisserie",
  tea_room: "Salon de thé",
  fast_food: "Fast-food",
  brasserie: "Brasserie",
  snack: "Snack",
  glacier: "Glacier",
  boulangerie: "Boulangerie",
  traiteur: "Traiteur",
  food_truck: "Food Truck",
  club: "Club / Discothèque",
};

function mapCategoryToSubcategory(category: string | null | undefined): string {
  if (!category) return "Restaurant";
  const mapped = CHR_CATEGORY_TO_SUBCATEGORY[category.toLowerCase()];
  if (mapped) return mapped;
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
}

function generateSlug(name: string, city: string): string {
  const base = `${name}-${city}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base}-${Date.now().toString(36)}`;
}

async function testApprove() {
  console.log("=== Test de validation d'une entrée staging ===\n");

  // Récupérer une entrée staging avec status 'new'
  const { data: staging, error: fetchError } = await supabase
    .from("establishment_import_staging")
    .select("*")
    .eq("status", "new")
    .limit(1)
    .single();

  if (fetchError || !staging) {
    console.log("Aucune entrée staging à valider");
    console.log("Erreur:", fetchError?.message);
    return;
  }

  console.log(`Entrée staging trouvée: ${staging.name} (${staging.city})`);
  console.log(`  - Catégorie: ${staging.category}`);
  console.log(`  - Subcatégorie mappée: ${mapCategoryToSubcategory(staging.category)}`);

  console.log("\n=== Test d'insertion dans establishments ===\n");

  const slug = generateSlug(staging.name, staging.city);

  const insertPayload = {
    name: staging.name,
    slug,
    universe: "restaurant",
    subcategory: mapCategoryToSubcategory(staging.category),
    city: staging.city,
    address: staging.address_full,
    lat: staging.latitude,
    lng: staging.longitude,
    phone: staging.phone_e164,
    website: staging.website_url,
    email: staging.email,
    social_links: staging.social_links || {},
    hours: staging.opening_hours || {},
    tags: staging.tags || [],
    description_short: staging.description_short,
    gallery_urls: staging.photos?.map((p: { url: string }) => p.url) || [],
    source_refs: staging.sources,
    status: "pending",
    verified: false,
    premium: false,
    booking_enabled: false,
  };

  console.log("Payload d'insertion:", JSON.stringify(insertPayload, null, 2));

  const { data: establishment, error: createError } = await supabase
    .from("establishments")
    .insert(insertPayload)
    .select("id, name, universe, subcategory")
    .single();

  if (createError) {
    console.log("\n❌ Erreur lors de l'insertion:", createError.message);
  } else {
    console.log("\n✅ Établissement créé avec succès!");
    console.log("  ID:", establishment.id);
    console.log("  Nom:", establishment.name);
    console.log("  Universe:", establishment.universe);
    console.log("  Subcategory:", establishment.subcategory);

    // Mettre à jour le staging
    await supabase
      .from("establishment_import_staging")
      .update({
        status: "imported",
        establishment_id: establishment.id,
        reviewer_id: "test-script",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", staging.id);

    console.log("\n✅ Staging mis à jour comme 'imported'");
  }
}

testApprove().catch(console.error);
