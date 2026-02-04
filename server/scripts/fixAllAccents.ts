/**
 * Fix ALL French accents in email templates
 * Run with: npx tsx server/scripts/fixAllAccents.ts
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || "https://ogjghzgzkxxoggocadln.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9namdoemd6a3h4b2dnb2NhZGxuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE3NTAyOCwiZXhwIjoyMDgxNzUxMDI4fQ.sniHdQ-EWw2ZdMj2gEjnrIvwLyinoLlVQ0aJL3-BNww"
);

async function run() {
  const { data: templates, error } = await supabase
    .from("email_templates")
    .select("id,name,subject_fr,body_fr");

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  console.log("Found", templates.length, "templates\n");

  // Complete list of French accent replacements
  // Format: [pattern, replacement]
  const replacements: [RegExp, string][] = [
    // été (past participle of être)
    [/\ba ete\b/g, "a été"],
    [/\bA ete\b/g, "A été"],
    [/\bn'a pas ete\b/g, "n'a pas été"],
    [/\bont ete\b/g, "ont été"],
    [/\bavait ete\b/g, "avait été"],
    [/\betes\b/g, "êtes"],

    // équipe
    [/\bequipe\b/g, "équipe"],
    [/\bEquipe\b/g, "Équipe"],
    [/\bL'equipe\b/g, "L'équipe"],
    [/\bl'equipe\b/g, "l'équipe"],

    // établissement
    [/\betablissement\b/g, "établissement"],
    [/\bEtablissement\b/g, "Établissement"],
    [/\betablissements\b/g, "établissements"],

    // réservation
    [/\breservation\b/g, "réservation"],
    [/\bReservation\b/g, "Réservation"],
    [/\breservations\b/g, "réservations"],
    [/\bReservations\b/g, "Réservations"],

    // créé(e)
    [/\bcreee\b/g, "créée"],
    [/\bCreee\b/g, "Créée"],
    [/\bcree\b/g, "créé"],
    [/\bCree\b/g, "Créé"],

    // première
    [/\bpremiere\b/g, "première"],
    [/\bPremiere\b/g, "Première"],
    [/\bpremieres\b/g, "premières"],

    // confirmée
    [/\bconfirmee\b/g, "confirmée"],
    [/\bconfirmees\b/g, "confirmées"],

    // reçu(e)
    [/\brecue\b/g, "reçue"],
    [/\bRecue\b/g, "Reçue"],
    [/\brecues\b/g, "reçues"],
    [/\brecu\b/g, "reçu"],
    [/\bRecu\b/g, "Reçu"],

    // expirée
    [/\bexpiree\b/g, "expirée"],
    [/\bExpiree\b/g, "Expirée"],
    [/\bexpirees\b/g, "expirées"],

    // gagnée
    [/\bgagnee\b/g, "gagnée"],
    [/\bGagnee\b/g, "Gagnée"],
    [/\bgagnees\b/g, "gagnées"],

    // crédité(e)
    [/\bcreditee\b/g, "créditée"],
    [/\bcredite\b/g, "crédité"],
    [/\bCredite\b/g, "Crédité"],

    // effectué(e)
    [/\beffectuee\b/g, "effectuée"],
    [/\beffectue\b/g, "effectué"],
    [/\bEffectue\b/g, "Effectué"],

    // remboursé(e)
    [/\bremboursee\b/g, "remboursée"],
    [/\brembourse\b/g, "remboursé"],
    [/\bRembourse\b/g, "Remboursé"],

    // activé(e)
    [/\bactivee\b/g, "activée"],
    [/\bactive\b/g, "activé"],  // careful - "active" can be adjective

    // désactivé(e)
    [/\bdesactivee\b/g, "désactivée"],
    [/\bdesactive\b/g, "désactivé"],

    // modifié(e)
    [/\bmodifiee\b/g, "modifiée"],
    [/\bmodifie\b/g, "modifié"],

    // supprimé(e)
    [/\bsupprimee\b/g, "supprimée"],
    [/\bsupprime\b/g, "supprimé"],

    // envoyé(e)
    [/\benvoyee\b/g, "envoyée"],
    [/\benvoye\b/g, "envoyé"],

    // ajouté(e)
    [/\bajoutee\b/g, "ajoutée"],
    [/\bajoute\b/g, "ajouté"],
    [/\bAjoute\b/g, "Ajouté"],

    // annulée
    [/\bannulee\b/g, "annulée"],
    [/\bAnnulee\b/g, "Annulée"],

    // validé(e)
    [/\bvalidee\b/g, "validée"],
    [/\bvalide\b/g, "validé"],
    [/\bValide\b/g, "Validé"],

    // généré(e)
    [/\bgeneree\b/g, "générée"],
    [/\bgenere\b/g, "généré"],

    // vérifié(e)
    [/\bverifiee\b/g, "vérifiée"],
    [/\bverifie\b/g, "vérifié"],

    // accepté(e)
    [/\bacceptee\b/g, "acceptée"],
    [/\baccepte\b/g, "accepté"],

    // refusé(e)
    [/\brefusee\b/g, "refusée"],
    [/\bRefusee\b/g, "Refusée"],
    [/\brefuse\b/g, "refusé"],

    // traité(e)
    [/\btraitee\b/g, "traitée"],
    [/\btraite\b/g, "traité"],

    // clôturé(e)
    [/\bcloturee\b/g, "clôturée"],
    [/\bcloture\b/g, "clôturé"],

    // terminé(e)
    [/\bterminee\b/g, "terminée"],
    [/\btermine\b/g, "terminé"],

    // planifié(e)
    [/\bplanifiee\b/g, "planifiée"],
    [/\bplanifie\b/g, "planifié"],

    // programmé(e)
    [/\bprogrammee\b/g, "programmée"],
    [/\bprogramme\b/g, "programmé"],

    // sélectionné(e)
    [/\bselectionnee\b/g, "sélectionnée"],
    [/\bselectionne\b/g, "sélectionné"],

    // déjà
    [/\bdeja\b/g, "déjà"],
    [/\bDeja\b/g, "Déjà"],

    // préalable
    [/\bprealable\b/g, "préalable"],
    [/\bprealables\b/g, "préalables"],

    // numéro
    [/\bnumero\b/g, "numéro"],
    [/\bNumero\b/g, "Numéro"],
    [/\bnumeros\b/g, "numéros"],

    // téléphone
    [/\btelephone\b/g, "téléphone"],
    [/\bTelephone\b/g, "Téléphone"],

    // événement
    [/\bevenement\b/g, "événement"],
    [/\bEvenement\b/g, "Événement"],
    [/\bevenements\b/g, "événements"],

    // préférence
    [/\bpreference\b/g, "préférence"],
    [/\bpreferences\b/g, "préférences"],

    // détails
    [/\bdetails\b/g, "détails"],
    [/\bDetails\b/g, "Détails"],

    // également
    [/\begalement\b/g, "également"],

    // télécharger
    [/\btelecharger\b/g, "télécharger"],

    // personnalisé
    [/\bpersonnalise\b/g, "personnalisé"],
    [/\bpersonnalisee\b/g, "personnalisée"],

    // payée
    [/\bpayee\b/g, "payée"],
  ];

  let updatedCount = 0;

  for (const tpl of templates as any[]) {
    const updates: Record<string, string> = {};
    const changedFields: string[] = [];

    const fields = ["name", "subject_fr", "body_fr"];

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
