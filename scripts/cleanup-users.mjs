/**
 * Script to delete all consumer users except the protected one
 * Run with: node scripts/cleanup-users.mjs
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const PROTECTED_EMAIL = "demo-user@sortiaumaroc.com";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

async function main() {
  console.log("🔍 Fetching all consumer users except protected account...");
  console.log(`   Protected email: ${PROTECTED_EMAIL}`);

  // Get all users except the protected one
  const { data: users, error } = await supabase
    .from("consumer_users")
    .select("id, email, full_name")
    .neq("email", PROTECTED_EMAIL);

  if (error) {
    console.error("❌ Error fetching users:", error.message);
    process.exit(1);
  }

  if (!users || users.length === 0) {
    console.log("✅ No users to delete (only protected account exists)");
    process.exit(0);
  }

  console.log(`\n📋 Found ${users.length} users to delete:\n`);
  for (const user of users) {
    console.log(`   - ${user.email} (${user.full_name || "No name"})`);
  }

  console.log("\n🗑️  Starting deletion...\n");

  // UUID validation regex
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let deletedCount = 0;
  let errorCount = 0;

  for (const user of users) {
    try {
      const isValidUuid = uuidRegex.test(user.id);

      // Delete related data first (foreign key constraints)
      // 1. Delete consumer_data_export_requests
      await supabase.from("consumer_data_export_requests").delete().eq("user_id", user.id);

      // 2. Delete consumer_account_actions
      await supabase.from("consumer_account_actions").delete().eq("user_id", user.id);

      // 3. Delete consumer_user_stats
      await supabase.from("consumer_user_stats").delete().eq("user_id", user.id);

      // Delete from auth.users only if ID is a valid UUID
      if (isValidUuid) {
        const { error: authErr } = await supabase.auth.admin.deleteUser(user.id);
        if (authErr && !authErr.message.includes("not found")) {
          console.warn(`   ⚠️  Auth deletion failed for ${user.email}: ${authErr.message}`);
        }
      }

      // Delete directly from consumer_users
      const { error: deleteErr } = await supabase
        .from("consumer_users")
        .delete()
        .eq("id", user.id);

      if (deleteErr) {
        console.error(`   ❌ Failed to delete ${user.email}: ${deleteErr.message}`);
        errorCount++;
        continue;
      }

      console.log(`   ✅ Deleted: ${user.email}`);
      deletedCount++;
    } catch (err) {
      console.error(`   ❌ Error deleting ${user.email}:`, err.message);
      errorCount++;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`📊 Summary:`);
  console.log(`   ✅ Deleted: ${deletedCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log(`   🛡️  Protected: ${PROTECTED_EMAIL}`);
  console.log("=".repeat(50));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
