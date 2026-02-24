/**
 * Fix ALL Sam'Booking references in email templates
 * Handles both straight (') and curly (') apostrophes
 * Run with: npx tsx server/scripts/fixSamBookingV2.ts
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
}
const supabase = createClient(url, key);

// Curly apostrophe character (code 8217)
const CURLY_APOS = String.fromCharCode(8217);

function replaceAll(text: string, search: string, replacement: string): string {
  return text.split(search).join(replacement);
}

async function run() {
  const { data: templates, error } = await supabase
    .from("email_templates")
    .select("id,name,subject_fr,subject_en,body_fr,body_en,cta_label_fr,cta_label_en,cta_url");

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  console.log("Found", templates.length, "templates");
  console.log("Curly apostrophe char code:", CURLY_APOS.charCodeAt(0));
  console.log("");

  let updatedCount = 0;

  for (const tpl of templates as any[]) {
    const updates: Record<string, string> = {};
    const changedFields: string[] = [];

    const fields = ["name", "subject_fr", "subject_en", "body_fr", "body_en", "cta_label_fr", "cta_label_en", "cta_url"];

    for (const field of fields) {
      let text = tpl[field];
      if (text === null || text === undefined || typeof text !== "string") continue;

      const original = text;

      // Replace with curly apostrophe (char code 8217)
      text = replaceAll(text, "Sam" + CURLY_APOS + "Booking", "Sam");
      text = replaceAll(text, "Sam" + CURLY_APOS + "booking", "Sam");
      // Replace with straight apostrophe
      text = replaceAll(text, "Sam'Booking", "Sam");
      text = replaceAll(text, "Sam'booking", "Sam");
      // Other variations
      text = replaceAll(text, "SamBooking", "Sam");
      text = replaceAll(text, "Sambooking", "Sam");
      text = replaceAll(text, "sambooking", "Sam");

      // Replace URLs
      text = replaceAll(text, "www.sambooking.ma", "www.sam.ma");
      text = replaceAll(text, "https://sambooking.ma", "https://sam.ma");
      text = replaceAll(text, "http://sambooking.ma", "https://sam.ma");
      text = replaceAll(text, "sambooking.ma", "sam.ma");

      if (text !== original) {
        updates[field] = text;
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
        console.error("✗ Error:", tpl.id, updateError.message);
      }
    }
  }

  console.log("");
  console.log("=== Summary ===");
  console.log("Total templates updated:", updatedCount);
}

run().catch(console.error);
