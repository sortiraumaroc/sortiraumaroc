/**
 * Fix ALL Sam'Booking references in email templates
 * Run with: npx tsx server/scripts/fixSamBooking.ts
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
}
const supabase = createClient(url, key);

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

  console.log("Found", templates.length, "templates\n");

  let updatedCount = 0;

  for (const tpl of templates as any[]) {
    const updates: Record<string, string> = {};
    const changedFields: string[] = [];

    const fields = ["name", "subject_fr", "subject_en", "body_fr", "body_en", "cta_label_fr", "cta_label_en", "cta_url"];

    for (const field of fields) {
      let text = tpl[field];
      if (typeof text !== "string") continue;

      const original = text;

      // Replace all variations of Sam'Booking with Sam
      // Note: ' (code 39) is straight apostrophe, ' (code 8217) is curly apostrophe
      text = replaceAll(text, "Sam'Booking", "Sam");  // straight apostrophe
      text = replaceAll(text, "Sam'Booking", "Sam");  // curly apostrophe (code 8217)
      text = replaceAll(text, "Sam'booking", "Sam");
      text = replaceAll(text, "Sam'booking", "Sam");
      text = replaceAll(text, "SamBooking", "Sam");
      text = replaceAll(text, "Sambooking", "Sam");
      text = replaceAll(text, "sam'booking", "Sam");
      text = replaceAll(text, "sam'booking", "Sam");
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
