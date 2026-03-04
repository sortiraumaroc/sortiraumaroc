import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.log("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function check() {
  console.log("Checking existing review tables...\n");

  // Check reviews table
  const { count: reviewCount, error: e1 } = await supabase
    .from("reviews")
    .select("id", { count: "exact", head: true });
  console.log(
    "reviews:",
    reviewCount ?? 0,
    "rows",
    e1 ? `(error: ${e1.message})` : "",
  );

  // Check review_invitations table
  const { count: invCount, error: e2 } = await supabase
    .from("review_invitations")
    .select("id", { count: "exact", head: true });
  console.log(
    "review_invitations:",
    invCount ?? 0,
    "rows",
    e2 ? `(error: ${e2.message})` : "",
  );

  // Check establishment_reports table
  const { count: repCount, error: e3 } = await supabase
    .from("establishment_reports")
    .select("id", { count: "exact", head: true });
  console.log(
    "establishment_reports:",
    repCount ?? 0,
    "rows",
    e3 ? `(error: ${e3.message})` : "",
  );

  console.log("\nDone.");
}

check();
