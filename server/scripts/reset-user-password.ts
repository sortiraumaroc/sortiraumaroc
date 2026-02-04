/**
 * Script to reset a user's password
 * Usage: npx tsx server/scripts/reset-user-password.ts <email> <new_password>
 *
 * Example: npx tsx server/scripts/reset-user-password.ts s.aitnasser54@gmail.com MyNewPassword123
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const email = process.argv[2];
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.error("Usage: npx tsx server/scripts/reset-user-password.ts <email> <new_password>");
    console.error("Example: npx tsx server/scripts/reset-user-password.ts s.aitnasser54@gmail.com MyNewPassword123");
    process.exit(1);
  }

  if (newPassword.length < 8) {
    console.error("Error: Password must be at least 8 characters");
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment");
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Find user by email
  const { data: users, error: listError } = await supabase.auth.admin.listUsers();

  if (listError) {
    console.error("Error listing users:", listError.message);
    process.exit(1);
  }

  const user = users.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (!user) {
    console.error(`Error: User with email "${email}" not found`);
    process.exit(1);
  }

  console.log(`Found user: ${user.email} (ID: ${user.id})`);

  // Update password
  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    password: newPassword,
  });

  if (updateError) {
    console.error("Error updating password:", updateError.message);
    process.exit(1);
  }

  console.log(`\n✅ Password successfully reset for ${email}`);
  console.log(`   New password: ${newPassword}`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
