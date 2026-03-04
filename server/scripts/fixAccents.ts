/**
 * Script to fix French accents in email templates
 * Run with: npx tsx server/scripts/fixAccents.ts
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
    .select("id,name,subject_fr,body_fr");

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  console.log("Found", templates.length, "templates\n");

  // French accent fixes
  const replacements: [RegExp, string][] = [
    // réservation
    [/reservations/g, "réservations"],
    [/Reservations/g, "Réservations"],
    [/reservation/g, "réservation"],
    [/Reservation/g, "Réservation"],
    // première
    [/premiere/g, "première"],
    [/Premiere/g, "Première"],
    // confirmée
    [/confirmee/g, "confirmée"],
    [/Confirmee/g, "Confirmée"],
    // reçu(e)
    [/recue/g, "reçue"],
    [/Recue/g, "Reçue"],
    [/recu /g, "reçu "],
    [/Recu /g, "Reçu "],
    // expirée
    [/expiree/g, "expirée"],
    [/Expiree/g, "Expirée"],
    // gagnée
    [/gagnee/g, "gagnée"],
    [/Gagnee/g, "Gagnée"],
    // crédité(e)
    [/creditee/g, "créditée"],
    [/credite/g, "crédité"],
    // appliquée
    [/appliquee/g, "appliquée"],
    // remboursé
    [/rembourse/g, "remboursé"],
    // effectué
    [/effectue/g, "effectué"],
  ];

  let updatedCount = 0;

  for (const tpl of templates as any[]) {
    const updates: Record<string, string> = {};
    const changedFields: string[] = [];

    // Only French fields
    const fields = ["subject_fr", "body_fr", "name"];

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
        console.error("✗ Error:", tpl.id, updateError.message);
      }
    }
  }

  console.log("");
  console.log("=== Summary ===");
  console.log("Total templates updated:", updatedCount);
}

run().catch(console.error);
