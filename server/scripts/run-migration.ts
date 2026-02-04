/**
 * Script to run the search engine enhancement migration
 * Run with: npx tsx server/scripts/run-migration.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function runMigration() {
  console.log("🚀 Starting search engine enhancement migration...\n");

  // Step 1: Add missing columns
  console.log("1️⃣ Adding missing columns (verified, premium, curated)...");

  // Check if columns exist first by trying to query them
  const { error: checkError } = await supabase
    .from("establishments")
    .select("id")
    .limit(1);

  if (checkError) {
    console.error("Error accessing establishments table:", checkError.message);
    process.exit(1);
  }

  // We can't run DDL directly via REST API, so we'll use RPC or handle this differently
  // For now, let's check what columns already exist

  const { data: testData, error: testError } = await supabase
    .from("establishments")
    .select("id,name,slug,tags,amenities")
    .limit(1);

  if (testError) {
    console.log("Some columns may be missing. Error:", testError.message);
  } else {
    console.log("✅ Basic columns exist. Sample data:", testData?.[0]?.name);
  }

  // Step 2: Check search_suggestions table
  console.log("\n2️⃣ Checking search_suggestions table...");

  const { data: suggestionsData, error: suggestionsError } = await supabase
    .from("search_suggestions")
    .select("id,term,category")
    .limit(1);

  if (suggestionsError) {
    console.log("⚠️ search_suggestions table doesn't exist yet.");
    console.log("   You need to run the migration SQL manually in Supabase Dashboard.");
  } else {
    console.log("✅ search_suggestions table exists.");
    if (suggestionsData && suggestionsData.length > 0) {
      console.log(`   Found ${suggestionsData.length}+ suggestions.`);
    }
  }

  // Step 3: Seed some basic suggestions if table exists
  if (!suggestionsError) {
    console.log("\n3️⃣ Seeding search suggestions...");

    const suggestions = [
      // Cuisines
      { term: "marocain", category: "cuisine", universe: "restaurant", display_label: "Cuisine Marocaine", icon_name: "utensils" },
      { term: "francais", category: "cuisine", universe: "restaurant", display_label: "Cuisine Française", icon_name: "utensils" },
      { term: "italien", category: "cuisine", universe: "restaurant", display_label: "Cuisine Italienne", icon_name: "utensils" },
      { term: "japonais", category: "cuisine", universe: "restaurant", display_label: "Cuisine Japonaise", icon_name: "utensils" },
      { term: "asiatique", category: "cuisine", universe: "restaurant", display_label: "Cuisine Asiatique", icon_name: "utensils" },

      // Dishes
      { term: "sushi", category: "dish", universe: "restaurant", display_label: "Sushi", icon_name: "utensils" },
      { term: "couscous", category: "dish", universe: "restaurant", display_label: "Couscous", icon_name: "utensils" },
      { term: "tajine", category: "dish", universe: "restaurant", display_label: "Tajine", icon_name: "utensils" },
      { term: "pizza", category: "dish", universe: "restaurant", display_label: "Pizza", icon_name: "utensils" },
      { term: "brunch", category: "dish", universe: "restaurant", display_label: "Brunch", icon_name: "coffee" },

      // Tags
      { term: "romantique", category: "tag", universe: null, display_label: "Romantique", icon_name: "heart" },
      { term: "terrasse", category: "tag", universe: "restaurant", display_label: "Terrasse", icon_name: "sun" },
      { term: "famille", category: "tag", universe: null, display_label: "En Famille", icon_name: "users" },
      { term: "rooftop", category: "tag", universe: "restaurant", display_label: "Rooftop", icon_name: "building" },
      { term: "vue mer", category: "tag", universe: null, display_label: "Vue Mer", icon_name: "waves" },
      { term: "piscine", category: "tag", universe: null, display_label: "Piscine", icon_name: "waves" },
      { term: "spa", category: "tag", universe: null, display_label: "Spa", icon_name: "sparkles" },

      // Cities
      { term: "casablanca", category: "city", universe: null, display_label: "Casablanca", icon_name: "map-pin" },
      { term: "marrakech", category: "city", universe: null, display_label: "Marrakech", icon_name: "map-pin" },
      { term: "rabat", category: "city", universe: null, display_label: "Rabat", icon_name: "map-pin" },
      { term: "tanger", category: "city", universe: null, display_label: "Tanger", icon_name: "map-pin" },
      { term: "agadir", category: "city", universe: null, display_label: "Agadir", icon_name: "map-pin" },
      { term: "fes", category: "city", universe: null, display_label: "Fès", icon_name: "map-pin" },

      // Wellness activities
      { term: "hammam", category: "activity", universe: "wellness", display_label: "Hammam", icon_name: "droplet" },
      { term: "massage", category: "activity", universe: "wellness", display_label: "Massage", icon_name: "hand" },
      { term: "yoga", category: "activity", universe: "wellness", display_label: "Yoga", icon_name: "heart" },

      // Loisirs activities
      { term: "escape game", category: "activity", universe: "loisir", display_label: "Escape Game", icon_name: "puzzle" },
      { term: "karting", category: "activity", universe: "loisir", display_label: "Karting", icon_name: "car" },
      { term: "bowling", category: "activity", universe: "loisir", display_label: "Bowling", icon_name: "circle" },

      // Accommodation
      { term: "riad", category: "accommodation", universe: "hebergement", display_label: "Riad", icon_name: "home" },
      { term: "hotel", category: "accommodation", universe: "hebergement", display_label: "Hôtel", icon_name: "building" },
      { term: "villa", category: "accommodation", universe: "hebergement", display_label: "Villa", icon_name: "home" },
    ];

    for (const sugg of suggestions) {
      const { error: insertError } = await supabase
        .from("search_suggestions")
        .upsert(sugg, { onConflict: "term,category,universe" });

      if (insertError && !insertError.message.includes("duplicate")) {
        console.log(`   ⚠️ Could not insert "${sugg.term}":`, insertError.message);
      }
    }

    console.log(`   ✅ Seeded ${suggestions.length} suggestions.`);
  }

  console.log("\n✅ Migration script completed!");
  console.log("\n📋 IMPORTANT: To add the missing columns (verified, premium, curated),");
  console.log("   you need to run the full SQL migration in Supabase Dashboard:");
  console.log("   1. Go to https://supabase.com/dashboard/project/ogjghzgzkxxoggocadln/sql");
  console.log("   2. Copy the content of: server/migrations/20260201_search_engine_enhancement.sql");
  console.log("   3. Paste and run it in the SQL Editor");
}

runMigration().catch(console.error);
