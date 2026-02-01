/**
 * Run migration to add extended fields to pro_profiles
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

async function runMigration() {
  console.log("🔧 Running pro_profiles migration...\n");

  // Check current columns
  const { data: columns, error: colErr } = await supabase
    .from("pro_profiles")
    .select("*")
    .limit(1);

  if (colErr) {
    console.error("❌ Error checking table:", colErr.message);
    process.exit(1);
  }

  const existingColumns = columns && columns.length > 0 ? Object.keys(columns[0]) : [];
  console.log("📋 Existing columns:", existingColumns.join(", "));

  const neededColumns = ["first_name", "last_name", "postal_code", "country", "rc"];
  const missingColumns = neededColumns.filter(col => !existingColumns.includes(col));

  if (missingColumns.length === 0) {
    console.log("\n✅ All columns already exist! No migration needed.");
    process.exit(0);
  }

  console.log("\n⚠️  Missing columns:", missingColumns.join(", "));
  console.log("\n📝 Please run the following SQL in Supabase SQL Editor:\n");
  console.log("-----------------------------------------------------------");
  console.log(`
ALTER TABLE public.pro_profiles
  ADD COLUMN IF NOT EXISTS first_name text null,
  ADD COLUMN IF NOT EXISTS last_name text null,
  ADD COLUMN IF NOT EXISTS postal_code text null,
  ADD COLUMN IF NOT EXISTS country text null default 'Maroc',
  ADD COLUMN IF NOT EXISTS rc text null;

CREATE INDEX IF NOT EXISTS idx_pro_profiles_rc ON public.pro_profiles (rc) WHERE rc IS NOT NULL;
`);
  console.log("-----------------------------------------------------------");
  console.log("\n🔗 Go to: https://supabase.com/dashboard/project/ogjghzgzkxxoggocadln/sql");
}

runMigration().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
