/**
 * Script to replace Sam'Booking -> Sam and sambooking.ma -> sam.ma in all email templates
 * Run with: npx ts-node server/scripts/fixEmailTemplates.ts
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
}
const supabase = createClient(url, key);

async function run() {
  const { data: templates, error } = await supabase
    .from("email_templates")
    .select("id,name,subject_fr,subject_en,body_fr,body_en,cta_label_fr,cta_label_en,cta_url");

  if (error) {
    console.error("Error fetching templates:", error.message);
    return;
  }

  console.log("Found", templates.length, "templates\n");

  // Patterns to replace
  const replacements: [RegExp, string][] = [
    // Sam'Booking -> Sam
    [/Sam'Booking/g, "Sam"],
    [/Sam'booking/g, "Sam"],
    [/SamBooking/g, "Sam"],
    [/Sambooking/g, "Sam"],
    // URLs: sambooking.ma -> sam.ma
    [/www\.sambooking\.ma/g, "www.sam.ma"],
    [/https:\/\/sambooking\.ma/g, "https://sam.ma"],
    [/http:\/\/sambooking\.ma/g, "https://sam.ma"],
    [/sambooking\.ma/g, "sam.ma"],
  ];

  let updatedCount = 0;

  for (const tpl of templates as any[]) {
    const updates: Record<string, string> = {};
    const changedFields: string[] = [];

    const fields = ["subject_fr", "subject_en", "body_fr", "body_en", "cta_label_fr", "cta_label_en", "name", "cta_url"];

    for (const field of fields) {
      const original = tpl[field];
      if (typeof original !== "string") continue;

      let updated = original;
      for (const [pattern, replacement] of replacements) {
        updated = updated.replace(pattern, replacement);
      }

      if (updated !== original) {
        updates[field] = updated;
        changedFields.push(field);
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from("email_templates")
        .update(updates)
        .eq("id", tpl.id);

      if (!updateError) {
        updatedCount++;
        console.log("✓ Updated:", tpl.name || tpl.id);
        console.log("  Fields:", changedFields.join(", "));
      } else {
        console.error("✗ Error updating", tpl.id, ":", updateError.message);
      }
    }
  }

  console.log("\n=== Summary ===");
  console.log("Total templates updated:", updatedCount);
}

run().catch(console.error);
