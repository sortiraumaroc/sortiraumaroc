/**
 * Script to fix all missing French accents in email templates
 */

import { config } from "dotenv";
config();

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Replacements for missing accents (case-sensitive)
const replacements: [string, string][] = [
  // Common words missing accents
  ["souhaitee", "souhaitée"],
  ["liberee", "libérée"],
  ["libere", "libère"],
  ["proposee", "proposée"],
  ["inquietez", "inquiétez"],
  ["desistement", "désistement"],
  ["Grace ", "Grâce "],
  [" credit", " crédit"],
  ["applique a", "appliqué à"],
  ["Decouvrir", "Découvrir"],
  ["decouvrir", "découvrir"],
  ["Felicitations", "Félicitations"],
  ["felicitations", "félicitations"],
  [" gagne ", " gagné "],
  ["avez gagne", "avez gagné"],
  [" effectue ", " effectué "],
  [" cree", " créé"],
  [" genere", " généré"],
  [" reserve", " réservé"],
  [" modifie ", " modifié "],
  [" annule ", " annulé "],
  [" confirme ", " confirmé "],
  ["a ete ", "a été "],
  ["a expire", "a expiré"],
  [" interesse", " intéressé"],
  ["preferee", "préférée"],
  ["desiree", "désirée"],
  ["beneficiez", "bénéficiez"],
  ["communaute", "communauté"],
  // Common missing apostrophes
  [" n avez", " n'avez"],
  [" n oubliez", " n'oubliez"],
  [" n hesitez", " n'hésitez"],
  [" d avoir", " d'avoir"],
  [" d autres", " d'autres"],
  [" d un ", " d'un "],
  [" d une ", " d'une "],
  ["L etablissement", "L'établissement"],
  ["l etablissement", "l'établissement"],
  [" s il", " s'il"],
  [" qu il", " qu'il"],
  [" c est", " c'est"],
  // Typos
  ["effectuér", "effectuer"],
];

function applyReplacements(text: string): string {
  let result = text;
  for (const [search, replace] of replacements) {
    // Use split/join for global replacement
    while (result.includes(search)) {
      result = result.split(search).join(replace);
    }
  }
  return result;
}

async function main() {
  const { data: templates, error } = await supabase
    .from("email_templates")
    .select("id, key, subject_fr, body_fr, cta_label_fr");

  if (error) {
    console.error("Error fetching templates:", error);
    process.exit(1);
  }

  console.log(`Checking ${templates.length} templates...\n`);

  let fixedCount = 0;

  for (const template of templates) {
    const updates: Record<string, string> = {};
    let hasChanges = false;

    // Check and fix subject_fr
    if (template.subject_fr) {
      const fixed = applyReplacements(template.subject_fr);
      if (fixed !== template.subject_fr) {
        updates.subject_fr = fixed;
        hasChanges = true;
        console.log(`[${template.key}] subject_fr:`);
        console.log(`  AVANT: ${template.subject_fr}`);
        console.log(`  APRÈS: ${fixed}`);
      }
    }

    // Check and fix body_fr
    if (template.body_fr) {
      const fixed = applyReplacements(template.body_fr);
      if (fixed !== template.body_fr) {
        updates.body_fr = fixed;
        hasChanges = true;
        console.log(`[${template.key}] body_fr: CORRIGÉ`);
      }
    }

    // Check and fix cta_label_fr
    if (template.cta_label_fr) {
      const fixed = applyReplacements(template.cta_label_fr);
      if (fixed !== template.cta_label_fr) {
        updates.cta_label_fr = fixed;
        hasChanges = true;
        console.log(`[${template.key}] cta_label_fr:`);
        console.log(`  AVANT: ${template.cta_label_fr}`);
        console.log(`  APRÈS: ${fixed}`);
      }
    }

    // Apply updates if any
    if (hasChanges) {
      const { error: updateError } = await supabase
        .from("email_templates")
        .update(updates)
        .eq("id", template.id);

      if (updateError) {
        console.error(`  ❌ Erreur: ${updateError.message}`);
      } else {
        console.log(`  ✅ Corrigé\n`);
        fixedCount++;
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Templates corrigés: ${fixedCount}`);
}

main().catch(console.error);
