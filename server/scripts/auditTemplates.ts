/**
 * Audit all email templates for missing French accents
 * Run with: npx tsx server/scripts/auditTemplates.ts
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
    .select("id,name,subject_fr,subject_en,body_fr,body_en,cta_label_fr,cta_label_en,cta_url")
    .order("name");

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  console.log("=== AUDIT COMPLET DES " + templates.length + " TEMPLATES ===\n");

  // Words without accents to find (in French fields only)
  const wordsToFind = [
    "reservation",
    "reservations",
    "premiere",
    "premieres",
    "confirmee",
    "confirmees",
    "recue",
    "recues",
    "expiree",
    "expirees",
    "gagnee",
    "gagnees",
    "creditee",
    "creditees",
    "credite",
    "effectue",
    "effectuee",
    "rembourse",
    "remboursee",
    "creee",
    "cree",
    "activee",
    "desactivee",
    "desactive",
    "modifiee",
    "modifie",
    "supprimee",
    "supprime",
    "envoyee",
    "envoye",
    "ajoutee",
    "ajoute",
    "annulee",
    "ete",
    "deja",
    "prealable",
    "etablissement",
    "equipe",
    "numero",
    "telephone",
    "evenement",
    "preference",
    "preferences",
    "validee",
    "valide",
    "generee",
    "genere",
    "verifiee",
    "verifie",
    "acceptee",
    "accepte",
    "refusee",
    "refuse",
    "traitee",
    "traite",
    "cloturee",
    "cloture",
    "terminee",
    "termine",
    "planifiee",
    "planifie",
    "programmee",
    "programme",
    "selectionnee",
    "selectionne",
  ];

  let totalIssues = 0;

  for (const tpl of templates as any[]) {
    const fields = ["name", "subject_fr", "body_fr"];
    const foundIssues: string[] = [];

    for (const field of fields) {
      const text = tpl[field];
      if (typeof text !== "string") continue;

      const textLower = text.toLowerCase();

      for (const word of wordsToFind) {
        if (textLower.includes(word)) {
          // Make sure it's not already accented
          const accentedVersions = [
            "réservation", "réservations", "première", "premières",
            "confirmée", "confirmées", "reçue", "reçues", "expirée", "expirées",
            "gagnée", "gagnées", "créditée", "créditées", "crédité",
            "effectué", "effectuée", "remboursé", "remboursée",
            "créée", "créé", "activée", "désactivée", "désactivé",
            "modifiée", "modifié", "supprimée", "supprimé",
            "envoyée", "envoyé", "ajoutée", "ajouté", "annulée",
            "été", "déjà", "préalable", "établissement", "équipe",
            "numéro", "téléphone", "événement", "préférence", "préférences",
            "validée", "validé", "générée", "généré", "vérifiée", "vérifié",
            "acceptée", "accepté", "refusée", "refusé", "traitée", "traité",
            "clôturée", "clôturé", "terminée", "terminé", "planifiée", "planifié",
            "programmée", "programmé", "sélectionnée", "sélectionné"
          ];

          // Check if the word appears without being part of an accented version
          const hasUnaccented = new RegExp("\\b" + word + "\\b", "i").test(text);
          if (hasUnaccented) {
            foundIssues.push(`${field}: "${word}"`);
          }
        }
      }
    }

    // Remove duplicates
    const uniqueIssues = [...new Set(foundIssues)];

    if (uniqueIssues.length > 0) {
      totalIssues++;
      console.log("❌ " + (tpl.name || tpl.id));
      for (const issue of uniqueIssues) {
        console.log("   - " + issue);
      }
      console.log("");
    }
  }

  console.log("\n=== RÉSUMÉ ===");
  console.log("Templates avec problèmes:", totalIssues);
  console.log("Templates OK:", templates.length - totalIssues);
}

run().catch(console.error);
