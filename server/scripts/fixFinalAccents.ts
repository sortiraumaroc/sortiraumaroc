import { config } from "dotenv";
config();

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Liste exhaustive des erreurs à corriger
const replacements: [string, string][] = [
  ["a expire", "a expiré"],
  ["creneau", "créneau"],
  ["notifie.", "notifié."],
  ["notifie ", "notifié "],
  [" confirme.", " confirmé."],
  [" confirme ", " confirmé "],
  ["Reference", "Référence"],
  ["visibilite", "visibilité"],
  [" creee", " créée"],
  ["approuvee", "approuvée"],
  ["approuve.", "approuvé."],
];

async function fixAll() {
  const { data: templates, error } = await supabase
    .from("email_templates")
    .select("id, key, subject_fr, body_fr, cta_label_fr");

  if (error || !templates) {
    console.error("Error:", error);
    return;
  }

  let fixCount = 0;

  for (const t of templates) {
    const updates: Record<string, string> = {};

    // Fix subject
    if (t.subject_fr) {
      let newSubject = t.subject_fr;
      for (const [from, to] of replacements) {
        while (newSubject.includes(from)) {
          newSubject = newSubject.split(from).join(to);
        }
      }
      if (newSubject !== t.subject_fr) {
        updates.subject_fr = newSubject;
      }
    }

    // Fix body
    if (t.body_fr) {
      let newBody = t.body_fr;
      for (const [from, to] of replacements) {
        while (newBody.includes(from)) {
          newBody = newBody.split(from).join(to);
        }
      }
      if (newBody !== t.body_fr) {
        updates.body_fr = newBody;
      }
    }

    // Fix CTA
    if (t.cta_label_fr) {
      let newCta = t.cta_label_fr;
      for (const [from, to] of replacements) {
        while (newCta.includes(from)) {
          newCta = newCta.split(from).join(to);
        }
      }
      if (newCta !== t.cta_label_fr) {
        updates.cta_label_fr = newCta;
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from("email_templates")
        .update(updates)
        .eq("id", t.id);

      if (updateError) {
        console.error(`❌ ${t.key}:`, updateError.message);
      } else {
        console.log(`✅ ${t.key}`);
        fixCount++;
      }
    }
  }

  console.log(`\nTotal corrigés: ${fixCount}`);
}

fixAll().catch(console.error);
