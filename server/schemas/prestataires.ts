/**
 * Zod Schemas for Prestataires Routes
 */
import { z } from "zod";
import { zUuid } from "../lib/validate";

// ── Route Params ────────────────────────────────────────────────────────────

/** :establishmentId */
export const PrestataireEstablishmentIdParams = z.object({ establishmentId: zUuid });

/** :id + :docId */
export const PrestataireIdDocIdParams = z.object({ id: zUuid, docId: zUuid });

// ── Pro: Demandes ────────────────────────────────────────────────────────────

export const CreateProPrestataireDemandeSchema = z.object({
  nom: z.string(),
  contact_email: z.string().nullable().optional(),
  contact_telephone: z.string().nullable().optional(),
  type_prestation: z.string().nullable().optional(),
  ville: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  establishment_id: z.string().nullable().optional(),
});

// ── Admin: Process demande ───────────────────────────────────────────────────

export const ProcessAdminPrestataireDemandeSchema = z.object({
  action: z.enum(["convert", "refuse"]),
  motif_refus: z.string().nullable().optional(),
});

// ── Admin: Create prestataire ────────────────────────────────────────────────

export const CreateAdminPrestataireSchema = z.object({
  nom_legal: z.string(),
  type_prestataire: z.string().optional(),
  ice: z.string().nullable().optional(),
  identifiant_fiscal: z.string().nullable().optional(),
  registre_commerce: z.string().nullable().optional(),
  adresse: z.string().nullable().optional(),
  ville: z.string().nullable().optional(),
  pays: z.string().nullable().optional(),
  banque_nom: z.string().nullable().optional(),
  titulaire_compte: z.string().nullable().optional(),
  tva_applicable: z.any().optional(),
  tva_taux: z.any().optional(),
  email: z.string().nullable().optional(),
  telephone: z.string().nullable().optional(),
  categorie_prestation: z.string().nullable().optional(),
  zone_intervention: z.any().optional(),
  referent_interne_id: z.string().nullable().optional(),
});

// ── Admin: Update prestataire ────────────────────────────────────────────────

export const UpdateAdminPrestataireSchema = z.object({
  nom_legal: z.string().optional(),
  type_prestataire: z.string().nullable().optional(),
  ice: z.string().nullable().optional(),
  identifiant_fiscal: z.string().nullable().optional(),
  registre_commerce: z.string().nullable().optional(),
  adresse: z.string().nullable().optional(),
  ville: z.string().nullable().optional(),
  pays: z.string().nullable().optional(),
  banque_nom: z.string().nullable().optional(),
  titulaire_compte: z.string().nullable().optional(),
  tva_applicable: z.any().optional(),
  tva_taux: z.any().optional(),
  email: z.string().nullable().optional(),
  telephone: z.string().nullable().optional(),
  categorie_prestation: z.string().nullable().optional(),
  zone_intervention: z.any().optional(),
  referent_interne_id: z.string().nullable().optional(),
  internal_notes: z.string().nullable().optional(),
});

// ── Admin: Status change ─────────────────────────────────────────────────────

export const UpdateAdminPrestataireStatusSchema = z.object({
  statut: z.string(),
  raison: z.string().nullable().optional(),
});

// ── Admin: Review document ───────────────────────────────────────────────────

export const ReviewAdminPrestataireDocumentSchema = z.object({
  action: z.enum(["validate", "refuse"]),
  note: z.string().nullable().optional(),
});

// ── Admin: Batch action ──────────────────────────────────────────────────────

export const BatchAdminPrestatairesActionSchema = z.object({
  ids: z.array(z.string()),
  action: z.enum(["validate", "block", "unblock", "archive"]),
  raison: z.string().nullable().optional(),
});

// ── Pro: Create prestataire ──────────────────────────────────────────────────

export const CreateProPrestataireSchema = z.object({
  nom_legal: z.string(),
  type_prestataire: z.string().nullable().optional(),
  categorie_prestation: z.string().nullable().optional(),
  establishment_id: z.string().nullable().optional(),
  ice: z.string().nullable().optional(),
  identifiant_fiscal: z.string().nullable().optional(),
  registre_commerce: z.string().nullable().optional(),
  adresse: z.string().nullable().optional(),
  ville: z.string().nullable().optional(),
  pays: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  telephone: z.string().nullable().optional(),
  banque_nom: z.string().nullable().optional(),
  titulaire_compte: z.string().nullable().optional(),
  tva_applicable: z.any().optional(),
  tva_taux: z.any().optional(),
  zone_intervention: z.any().optional(),
});

// ── Pro: Update prestataire ──────────────────────────────────────────────────

export const UpdateProPrestataireSchema = z.object({
  nom_legal: z.string().optional(),
  type_prestataire: z.string().nullable().optional(),
  categorie_prestation: z.string().nullable().optional(),
  ice: z.string().nullable().optional(),
  identifiant_fiscal: z.string().nullable().optional(),
  registre_commerce: z.string().nullable().optional(),
  adresse: z.string().nullable().optional(),
  ville: z.string().nullable().optional(),
  pays: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  telephone: z.string().nullable().optional(),
  banque_nom: z.string().nullable().optional(),
  titulaire_compte: z.string().nullable().optional(),
  tva_applicable: z.any().optional(),
  tva_taux: z.any().optional(),
  zone_intervention: z.any().optional(),
});

// ── Pro: Upload document ─────────────────────────────────────────────────────

export const UploadProPrestataireDocumentSchema = z.object({
  type_document: z.string(),
  file_name: z.string(),
  file_base64: z.string(),
  mime_type: z.string().optional(),
});

// ── Messages ─────────────────────────────────────────────────────────────────

export const SendProPrestataireMessageSchema = z.object({
  body: z.string(),
  topic: z.string().optional(),
});

export const SendAdminPrestataireMessageSchema = z.object({
  body: z.string(),
  topic: z.string().optional(),
  is_internal: z.any().optional(),
});
