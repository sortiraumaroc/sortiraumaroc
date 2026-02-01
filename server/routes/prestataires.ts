/**
 * Prestataires Module - Server Routes
 * Gestion complète des prestataires avec workflow, documents, audit
 */

import type { RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { requireAdminKey, requireSuperadmin } from "./admin";

// =============================================================================
// HELPERS
// =============================================================================

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asOptionalString(v: unknown): string | null {
  const s = asString(v);
  return s || null;
}

function asInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

function asBool(v: unknown): boolean {
  return v === true || v === "true" || v === 1;
}

function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.trim().split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;
  return token?.trim() || null;
}

async function getUserFromBearerToken(req: Parameters<RequestHandler>[0]) {
  const token = parseBearerToken(req.header("authorization"));
  if (!token) return null;
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) return null;
  return { id: data.user.id, email: data.user.email };
}

// Audit log helper
async function insertPrestataireAudit(args: {
  prestataireId?: string;
  demandeId?: string;
  action: string;
  actorType: "pro" | "partner" | "rc" | "admin" | "system";
  actorUserId?: string;
  actorAdminId?: string;
  actorIp?: string;
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getAdminSupabase();
  await supabase.from("prestataire_audit_logs").insert({
    prestataire_id: args.prestataireId ?? null,
    demande_id: args.demandeId ?? null,
    action: args.action,
    actor_type: args.actorType,
    actor_user_id: args.actorUserId ?? null,
    actor_admin_id: args.actorAdminId ?? null,
    actor_ip: args.actorIp ?? null,
    before_data: args.beforeData ?? null,
    after_data: args.afterData ?? null,
    metadata: args.metadata ?? {},
  });
}

// =============================================================================
// PRO ENDPOINTS - Demandes de prestataires
// =============================================================================

/**
 * PRO: Créer une demande de prestataire
 * POST /api/pro/prestataires/demandes
 */
export const createProPrestataireDemande: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const nom = asString((req.body as any).nom);
  const contactEmail = asOptionalString((req.body as any).contact_email);
  const contactTelephone = asOptionalString(
    (req.body as any).contact_telephone,
  );
  const typePrestation = asOptionalString((req.body as any).type_prestation);
  const ville = asOptionalString((req.body as any).ville);
  const notes = asOptionalString((req.body as any).notes);
  const establishmentId = asOptionalString((req.body as any).establishment_id);

  if (!nom) {
    return res.status(400).json({ error: "nom_required" });
  }

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("prestataire_demandes")
    .insert({
      demandeur_user_id: user.id,
      establishment_id: establishmentId,
      nom,
      contact_email: contactEmail,
      contact_telephone: contactTelephone,
      type_prestation: typePrestation,
      ville,
      notes,
      statut: "NOUVELLE",
    })
    .select("*")
    .single();

  if (error) {
    console.error("[createProPrestataireDemande]", error);
    return res.status(500).json({ error: error.message });
  }

  // Audit log
  await insertPrestataireAudit({
    demandeId: data.id,
    action: "demande.create",
    actorType: "pro",
    actorUserId: user.id,
    actorIp: req.ip,
    afterData: data,
  });

  res.json({ ok: true, demande: data });
};

/**
 * PRO: Lister ses demandes
 * GET /api/pro/prestataires/demandes
 */
export const listProPrestataireDemandes: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("prestataire_demandes")
    .select("*")
    .eq("demandeur_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, items: data ?? [] });
};

/**
 * PRO: Lister les prestataires liés à son établissement
 * GET /api/pro/establishments/:establishmentId/prestataires
 */
export const listProPrestataires: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const establishmentId = asString(req.params.establishmentId);
  if (!establishmentId) {
    return res.status(400).json({ error: "missing_establishment_id" });
  }

  const supabase = getAdminSupabase();

  // Vérifier membership
  const { data: membership } = await supabase
    .from("pro_establishment_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (!membership) {
    return res.status(403).json({ error: "not_member" });
  }

  // Récupérer les prestataires liés via demandes converties
  const { data, error } = await supabase
    .from("prestataires")
    .select(
      `
      id,
      nom_legal,
      type_prestataire,
      categorie_prestation,
      ville,
      statut,
      email,
      telephone
    `,
    )
    .in(
      "id",
      supabase
        .from("prestataire_demandes")
        .select("prestataire_id")
        .eq("establishment_id", establishmentId)
        .eq("statut", "CONVERTIE")
        .not("prestataire_id", "is", null),
    )
    .order("nom_legal");

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, items: data ?? [] });
};

// =============================================================================
// ADMIN/RC ENDPOINTS - Gestion des prestataires
// =============================================================================

/**
 * Admin: Lister toutes les demandes
 * GET /api/admin/prestataires/demandes
 */
export const listAdminPrestataireDemandes: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const statut = asOptionalString(req.query.statut);

  let query = supabase
    .from("prestataire_demandes")
    .select(
      `
      *,
      prestataires(id, nom_legal, statut)
    `,
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (statut) {
    query = query.eq("statut", statut);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, items: data ?? [] });
};

/**
 * Admin: Traiter une demande (convertir en prestataire ou refuser)
 * POST /api/admin/prestataires/demandes/:id/process
 */
export const processAdminPrestataireDemande: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const demandeId = asString(req.params.id);
  const action = asString((req.body as any).action); // 'convert' | 'refuse'
  const motifRefus = asOptionalString((req.body as any).motif_refus);

  if (!demandeId) return res.status(400).json({ error: "missing_demande_id" });
  if (!["convert", "refuse"].includes(action)) {
    return res.status(400).json({ error: "invalid_action" });
  }

  const supabase = getAdminSupabase();

  // Récupérer la demande
  const { data: demande } = await supabase
    .from("prestataire_demandes")
    .select("*")
    .eq("id", demandeId)
    .maybeSingle();

  if (!demande) {
    return res.status(404).json({ error: "demande_not_found" });
  }

  if (demande.statut !== "NOUVELLE" && demande.statut !== "EN_COURS") {
    return res.status(409).json({ error: "demande_already_processed" });
  }

  const now = new Date().toISOString();

  if (action === "refuse") {
    const { error } = await supabase
      .from("prestataire_demandes")
      .update({
        statut: "REFUSEE",
        traite_par: "admin",
        traite_at: now,
        motif_refus: motifRefus,
      })
      .eq("id", demandeId);

    if (error) return res.status(500).json({ error: error.message });

    await insertPrestataireAudit({
      demandeId,
      action: "demande.refuse",
      actorType: "admin",
      actorAdminId: "admin",
      beforeData: demande,
      metadata: { motif: motifRefus },
    });

    return res.json({ ok: true, action: "refused" });
  }

  // Convert: créer un prestataire en BROUILLON
  const { data: prestataire, error: createError } = await supabase
    .from("prestataires")
    .insert({
      nom_legal: demande.nom,
      type_prestataire: "auto_entrepreneur",
      email: demande.contact_email,
      telephone: demande.contact_telephone,
      ville: demande.ville,
      categorie_prestation: demande.type_prestation || "autre",
      statut: "BROUILLON",
      created_by: "admin",
    })
    .select("*")
    .single();

  if (createError) {
    return res.status(500).json({ error: createError.message });
  }

  // Mettre à jour la demande
  await supabase
    .from("prestataire_demandes")
    .update({
      statut: "CONVERTIE",
      prestataire_id: prestataire.id,
      traite_par: "admin",
      traite_at: now,
    })
    .eq("id", demandeId);

  await insertPrestataireAudit({
    demandeId,
    prestataireId: prestataire.id,
    action: "demande.convert",
    actorType: "admin",
    actorAdminId: "admin",
    afterData: prestataire,
  });

  res.json({ ok: true, action: "converted", prestataire });
};

/**
 * Admin: Lister tous les prestataires
 * GET /api/admin/prestataires
 */
export const listAdminPrestataires: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const statut = asOptionalString(req.query.statut);
  const ville = asOptionalString(req.query.ville);
  const categorie = asOptionalString(req.query.categorie);
  const search = asOptionalString(req.query.search);

  let query = supabase
    .from("prestataires")
    .select(
      `
      *,
      prestataire_documents(id, type_document, statut)
    `,
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (statut) query = query.eq("statut", statut);
  if (ville) query = query.eq("ville", ville);
  if (categorie) query = query.eq("categorie_prestation", categorie);
  if (search)
    query = query.or(
      `nom_legal.ilike.%${search}%,email.ilike.%${search}%,ice.ilike.%${search}%`,
    );

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, items: data ?? [] });
};

/**
 * Admin: Obtenir un prestataire avec tous les détails
 * GET /api/admin/prestataires/:id
 */
export const getAdminPrestataire: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const prestataireId = asString(req.params.id);
  if (!prestataireId) return res.status(400).json({ error: "missing_id" });

  const supabase = getAdminSupabase();

  const { data: prestataire, error } = await supabase
    .from("prestataires")
    .select("*")
    .eq("id", prestataireId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!prestataire) return res.status(404).json({ error: "not_found" });

  // Documents
  const { data: documents } = await supabase
    .from("prestataire_documents")
    .select("*")
    .eq("prestataire_id", prestataireId)
    .order("uploaded_at", { ascending: false });

  // Audit logs
  const { data: auditLogs } = await supabase
    .from("prestataire_audit_logs")
    .select("*")
    .eq("prestataire_id", prestataireId)
    .order("created_at", { ascending: false })
    .limit(50);

  // Paiements
  const { data: paiements } = await supabase
    .from("prestataire_paiements")
    .select("*")
    .eq("prestataire_id", prestataireId)
    .order("created_at", { ascending: false })
    .limit(20);

  // Demandes liées
  const { data: demandes } = await supabase
    .from("prestataire_demandes")
    .select("*")
    .eq("prestataire_id", prestataireId)
    .order("created_at", { ascending: false });

  res.json({
    ok: true,
    prestataire,
    documents: documents ?? [],
    audit_logs: auditLogs ?? [],
    paiements: paiements ?? [],
    demandes: demandes ?? [],
  });
};

/**
 * Admin: Créer un prestataire
 * POST /api/admin/prestataires
 */
export const createAdminPrestataire: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const body = req.body as any;

  const nomLegal = asString(body.nom_legal);
  if (!nomLegal) return res.status(400).json({ error: "nom_legal_required" });

  const typePrestataire =
    asString(body.type_prestataire) || "auto_entrepreneur";
  const ice = asOptionalString(body.ice);

  // Valider ICE si fourni
  if (ice && ice.length !== 15) {
    return res.status(400).json({ error: "ice_must_be_15_digits" });
  }

  const supabase = getAdminSupabase();

  // Vérifier unicité ICE
  if (ice) {
    const { data: existing } = await supabase
      .from("prestataires")
      .select("id")
      .eq("ice", ice)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: "ice_already_exists" });
    }
  }

  const insertData = {
    nom_legal: nomLegal,
    type_prestataire: typePrestataire,
    ice,
    identifiant_fiscal: asOptionalString(body.identifiant_fiscal),
    registre_commerce: asOptionalString(body.registre_commerce),
    adresse: asOptionalString(body.adresse),
    ville: asOptionalString(body.ville),
    pays: asOptionalString(body.pays) || "Maroc",
    banque_nom: asOptionalString(body.banque_nom),
    titulaire_compte: asOptionalString(body.titulaire_compte),
    tva_applicable: asBool(body.tva_applicable),
    tva_taux: body.tva_taux != null ? Number(body.tva_taux) : 0,
    email: asOptionalString(body.email),
    telephone: asOptionalString(body.telephone),
    categorie_prestation:
      asOptionalString(body.categorie_prestation) || "autre",
    zone_intervention: Array.isArray(body.zone_intervention)
      ? body.zone_intervention
      : null,
    referent_interne_id: asOptionalString(body.referent_interne_id),
    statut: "BROUILLON",
    created_by: "admin",
  };

  const { data, error } = await supabase
    .from("prestataires")
    .insert(insertData)
    .select("*")
    .single();

  if (error) {
    console.error("[createAdminPrestataire]", error);
    return res.status(500).json({ error: error.message });
  }

  await insertPrestataireAudit({
    prestataireId: data.id,
    action: "prestataire.create",
    actorType: "admin",
    actorAdminId: "admin",
    afterData: data,
  });

  res.json({ ok: true, prestataire: data });
};

/**
 * Admin: Mettre à jour un prestataire
 * POST /api/admin/prestataires/:id/update
 */
export const updateAdminPrestataire: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const prestataireId = asString(req.params.id);
  if (!prestataireId) return res.status(400).json({ error: "missing_id" });

  const supabase = getAdminSupabase();

  // Récupérer l'état avant
  const { data: before } = await supabase
    .from("prestataires")
    .select("*")
    .eq("id", prestataireId)
    .maybeSingle();

  if (!before) return res.status(404).json({ error: "not_found" });

  const body = req.body as any;
  const updateData: Record<string, unknown> = {};

  // Champs modifiables
  const fields = [
    "nom_legal",
    "type_prestataire",
    "ice",
    "identifiant_fiscal",
    "registre_commerce",
    "adresse",
    "ville",
    "pays",
    "banque_nom",
    "titulaire_compte",
    "tva_applicable",
    "tva_taux",
    "email",
    "telephone",
    "categorie_prestation",
    "zone_intervention",
    "referent_interne_id",
    "internal_notes",
  ];

  for (const field of fields) {
    if (body[field] !== undefined) {
      if (field === "tva_applicable") {
        updateData[field] = asBool(body[field]);
      } else if (field === "tva_taux") {
        updateData[field] = Number(body[field]) || 0;
      } else if (field === "zone_intervention") {
        updateData[field] = Array.isArray(body[field]) ? body[field] : null;
      } else {
        updateData[field] = asOptionalString(body[field]);
      }
    }
  }

  // Validation ICE si modifié
  if (updateData.ice && updateData.ice !== before.ice) {
    const ice = updateData.ice as string;
    if (ice.length !== 15) {
      return res.status(400).json({ error: "ice_must_be_15_digits" });
    }

    const { data: existing } = await supabase
      .from("prestataires")
      .select("id")
      .eq("ice", ice)
      .neq("id", prestataireId)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: "ice_already_exists" });
    }
  }

  const { data: after, error } = await supabase
    .from("prestataires")
    .update(updateData)
    .eq("id", prestataireId)
    .select("*")
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  await insertPrestataireAudit({
    prestataireId,
    action: "prestataire.update",
    actorType: "admin",
    actorAdminId: "admin",
    beforeData: before,
    afterData: after,
  });

  res.json({ ok: true, prestataire: after });
};

/**
 * Admin: Changer le statut d'un prestataire
 * POST /api/admin/prestataires/:id/status
 */
export const updateAdminPrestataireStatus: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const prestataireId = asString(req.params.id);
  const newStatut = asString((req.body as any).statut);
  const raison = asOptionalString((req.body as any).raison);

  if (!prestataireId) return res.status(400).json({ error: "missing_id" });

  const validStatuts = [
    "BROUILLON",
    "EN_VALIDATION",
    "VALIDE",
    "BLOQUE",
    "REFUSE",
    "ARCHIVE",
  ];
  if (!validStatuts.includes(newStatut)) {
    return res.status(400).json({ error: "invalid_statut" });
  }

  const supabase = getAdminSupabase();

  const { data: before } = await supabase
    .from("prestataires")
    .select("*")
    .eq("id", prestataireId)
    .maybeSingle();

  if (!before) return res.status(404).json({ error: "not_found" });

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { statut: newStatut };

  if (newStatut === "VALIDE") {
    updateData.validated_by = "admin";
    updateData.validated_at = now;
    updateData.raison_blocage = null;
  } else if (newStatut === "BLOQUE" || newStatut === "REFUSE") {
    updateData.blocked_by = "admin";
    updateData.blocked_at = now;
    updateData.raison_blocage = raison;
  }

  const { data: after, error } = await supabase
    .from("prestataires")
    .update(updateData)
    .eq("id", prestataireId)
    .select("*")
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  await insertPrestataireAudit({
    prestataireId,
    action: `prestataire.status.${newStatut.toLowerCase()}`,
    actorType: "admin",
    actorAdminId: "admin",
    beforeData: before,
    afterData: after,
    metadata: { raison },
  });

  res.json({ ok: true, prestataire: after });
};

/**
 * Admin: Valider/refuser un document
 * POST /api/admin/prestataires/:id/documents/:docId/review
 */
export const reviewAdminPrestataireDocument: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const prestataireId = asString(req.params.id);
  const docId = asString(req.params.docId);
  const action = asString((req.body as any).action); // 'validate' | 'refuse'
  const note = asOptionalString((req.body as any).note);

  if (!prestataireId || !docId) {
    return res.status(400).json({ error: "missing_params" });
  }
  if (!["validate", "refuse"].includes(action)) {
    return res.status(400).json({ error: "invalid_action" });
  }

  const supabase = getAdminSupabase();

  const { data: doc } = await supabase
    .from("prestataire_documents")
    .select("*")
    .eq("id", docId)
    .eq("prestataire_id", prestataireId)
    .maybeSingle();

  if (!doc) return res.status(404).json({ error: "document_not_found" });

  const now = new Date().toISOString();
  const newStatut = action === "validate" ? "VALIDE" : "REFUSE";
  const refusCount =
    action === "refuse" ? (doc.refus_count || 0) + 1 : doc.refus_count;

  const { error } = await supabase
    .from("prestataire_documents")
    .update({
      statut: newStatut,
      reviewed_by: "admin",
      reviewed_at: now,
      review_note: note,
      refus_count: refusCount,
    })
    .eq("id", docId);

  if (error) return res.status(500).json({ error: error.message });

  // Si refus multiple, augmenter risk_score
  if (action === "refuse" && refusCount >= 2) {
    await supabase
      .from("prestataires")
      .update({
        risk_score: supabase.rpc("least", [100, (doc as any).risk_score + 20]),
      })
      .eq("id", prestataireId);
  }

  await insertPrestataireAudit({
    prestataireId,
    action: `document.${action}`,
    actorType: "admin",
    actorAdminId: "admin",
    metadata: { doc_id: docId, doc_type: doc.type_document, note },
  });

  res.json({ ok: true, action, statut: newStatut });
};

// =============================================================================
// SUPERADMIN ENDPOINTS - Dashboard & Actions en masse
// =============================================================================

/**
 * SuperAdmin: Dashboard stats
 * GET /api/admin/prestataires/dashboard
 */
export const getAdminPrestatairesDashboard: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();

  // Compter par statut
  const { data: statutCounts } = await supabase
    .from("prestataires")
    .select("statut")
    .then(({ data }) => {
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        counts[row.statut] = (counts[row.statut] || 0) + 1;
      }
      return { data: counts };
    });

  // Compter à risque (risk_score > 50)
  const { count: atRisk } = await supabase
    .from("prestataires")
    .select("id", { count: "exact", head: true })
    .gt("risk_score", 50);

  // Compter paiements gelés
  const { count: paiementsGeles } = await supabase
    .from("prestataire_paiements")
    .select("id", { count: "exact", head: true })
    .eq("statut", "GELE");

  // Demandes en attente
  const { count: demandesEnAttente } = await supabase
    .from("prestataire_demandes")
    .select("id", { count: "exact", head: true })
    .eq("statut", "NOUVELLE");

  res.json({
    ok: true,
    stats: {
      total: Object.values(statutCounts ?? {}).reduce((a, b) => a + b, 0),
      par_statut: statutCounts ?? {},
      a_risque: atRisk ?? 0,
      paiements_geles: paiementsGeles ?? 0,
      demandes_en_attente: demandesEnAttente ?? 0,
    },
  });
};

/**
 * SuperAdmin: Actions en masse
 * POST /api/admin/prestataires/batch-action
 */
export const batchAdminPrestatairesAction: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const ids = (req.body as any).ids;
  const action = asString((req.body as any).action);
  const raison = asOptionalString((req.body as any).raison);

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids_required" });
  }

  const validActions = ["validate", "block", "unblock", "archive"];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: "invalid_action" });
  }

  if ((action === "block" || action === "archive") && !raison) {
    return res.status(400).json({ error: "raison_required" });
  }

  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  let updateData: Record<string, unknown> = {};

  switch (action) {
    case "validate":
      updateData = {
        statut: "VALIDE",
        validated_by: "admin",
        validated_at: now,
        raison_blocage: null,
      };
      break;
    case "block":
      updateData = {
        statut: "BLOQUE",
        blocked_by: "admin",
        blocked_at: now,
        raison_blocage: raison,
      };
      break;
    case "unblock":
      updateData = { statut: "VALIDE", raison_blocage: null };
      break;
    case "archive":
      updateData = { statut: "ARCHIVE", raison_blocage: raison };
      break;
  }

  const { error } = await supabase
    .from("prestataires")
    .update(updateData)
    .in("id", ids);

  if (error) return res.status(500).json({ error: error.message });

  // Audit pour chaque
  for (const id of ids) {
    await insertPrestataireAudit({
      prestataireId: id,
      action: `batch.${action}`,
      actorType: "admin",
      actorAdminId: "admin",
      metadata: { raison, batch_size: ids.length },
    });
  }

  res.json({ ok: true, updated: ids.length });
};

/**
 * Admin: Exporter les prestataires (superadmin only)
 * GET /api/admin/prestataires/export
 */
export const exportAdminPrestataires: RequestHandler = async (req, res) => {
  if (!requireSuperadmin(req, res)) return;

  const format = asString(req.query.format) || "json";
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("prestataires")
    .select(
      `
      id,
      nom_legal,
      type_prestataire,
      ice,
      identifiant_fiscal,
      ville,
      email,
      telephone,
      categorie_prestation,
      statut,
      tva_applicable,
      tva_taux,
      risk_score,
      created_at,
      validated_at
    `,
    )
    .order("nom_legal");

  if (error) return res.status(500).json({ error: error.message });

  if (format === "csv") {
    const headers = [
      "ID",
      "Nom Legal",
      "Type",
      "ICE",
      "IF",
      "Ville",
      "Email",
      "Telephone",
      "Categorie",
      "Statut",
      "TVA Applicable",
      "Taux TVA",
      "Risk Score",
      "Cree le",
      "Valide le",
    ];

    const rows = (data ?? []).map((p) =>
      [
        p.id,
        p.nom_legal,
        p.type_prestataire,
        p.ice || "",
        p.identifiant_fiscal || "",
        p.ville || "",
        p.email || "",
        p.telephone || "",
        p.categorie_prestation || "",
        p.statut,
        p.tva_applicable ? "Oui" : "Non",
        p.tva_taux || 0,
        p.risk_score || 0,
        p.created_at,
        p.validated_at || "",
      ].join(";"),
    );

    const csv = [headers.join(";"), ...rows].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=prestataires.csv",
    );
    return res.send(csv);
  }

  res.json({ ok: true, items: data ?? [] });
};

/**
 * Admin: Journal d'audit
 * GET /api/admin/prestataires/audit-logs
 */
export const listAdminPrestataireAuditLogs: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const prestataireId = asOptionalString(req.query.prestataire_id);
  const limit = asInt(req.query.limit) ?? 100;

  const supabase = getAdminSupabase();

  let query = supabase
    .from("prestataire_audit_logs")
    .select(
      `
      *,
      prestataires(nom_legal)
    `,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (prestataireId) {
    query = query.eq("prestataire_id", prestataireId);
  }

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: data ?? [] });
};

// =============================================================================
// PRO ENDPOINTS - Gestion complète des prestataires
// =============================================================================

/**
 * Helper: Vérifier que l'utilisateur PRO a accès à ce prestataire
 * Un PRO a accès aux prestataires liés à ses établissements via demandes converties
 */
async function checkProPrestataireAccess(
  userId: string,
  prestataireId: string,
): Promise<{ hasAccess: boolean; establishmentId?: string }> {
  const supabase = getAdminSupabase();

  // Vérifier via les demandes converties
  const { data: demande } = await supabase
    .from("prestataire_demandes")
    .select("establishment_id")
    .eq("prestataire_id", prestataireId)
    .eq("statut", "CONVERTIE")
    .maybeSingle();

  if (!demande?.establishment_id) {
    // Vérifier si le PRO a créé directement ce prestataire
    const { data: prest } = await supabase
      .from("prestataires")
      .select("created_by_user_id")
      .eq("id", prestataireId)
      .maybeSingle();

    if (prest?.created_by_user_id === userId) {
      return { hasAccess: true };
    }
    return { hasAccess: false };
  }

  // Vérifier membership sur l'établissement
  const { data: membership } = await supabase
    .from("pro_establishment_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("establishment_id", demande.establishment_id)
    .maybeSingle();

  return {
    hasAccess: !!membership,
    establishmentId: demande.establishment_id,
  };
}

/**
 * PRO: Créer un prestataire (en mode BROUILLON)
 * POST /api/pro/prestataires
 */
export const createProPrestataire: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const body = req.body as Record<string, unknown>;
  const nomLegal = asString(body.nom_legal);
  const typePrestataire =
    asOptionalString(body.type_prestataire) ?? "auto_entrepreneur";
  const categoriePrestation =
    asOptionalString(body.categorie_prestation) ?? "autre";
  const establishmentId = asOptionalString(body.establishment_id);

  if (!nomLegal) {
    return res.status(400).json({ error: "nom_legal_required" });
  }

  // Vérifier membership si establishment_id fourni
  if (establishmentId) {
    const supabase = getAdminSupabase();
    const { data: membership } = await supabase
      .from("pro_establishment_memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    if (!membership) {
      return res.status(403).json({ error: "not_member" });
    }
  }

  const supabase = getAdminSupabase();

  const insertData: Record<string, unknown> = {
    nom_legal: nomLegal,
    type_prestataire: typePrestataire,
    categorie_prestation: categoriePrestation,
    statut: "BROUILLON",
    created_by_user_id: user.id,
    ice: asOptionalString(body.ice),
    identifiant_fiscal: asOptionalString(body.identifiant_fiscal),
    registre_commerce: asOptionalString(body.registre_commerce),
    adresse: asOptionalString(body.adresse),
    ville: asOptionalString(body.ville),
    pays: asOptionalString(body.pays) ?? "Maroc",
    email: asOptionalString(body.email),
    telephone: asOptionalString(body.telephone),
    banque_nom: asOptionalString(body.banque_nom),
    titulaire_compte: asOptionalString(body.titulaire_compte),
    tva_applicable: asBool(body.tva_applicable),
    tva_taux: asBool(body.tva_applicable) ? (asInt(body.tva_taux) ?? 20) : 0,
    zone_intervention: asOptionalString(body.zone_intervention),
  };

  const { data, error } = await supabase
    .from("prestataires")
    .insert(insertData)
    .select("*")
    .single();

  if (error) {
    console.error("[createProPrestataire]", error);
    return res.status(500).json({ error: error.message });
  }

  // Si establishment_id, créer la liaison via une demande convertie
  if (establishmentId) {
    await supabase.from("prestataire_demandes").insert({
      demandeur_user_id: user.id,
      establishment_id: establishmentId,
      nom: nomLegal,
      prestataire_id: data.id,
      statut: "CONVERTIE",
      traite_par: user.id,
      traite_at: new Date().toISOString(),
    });
  }

  // Audit log
  await insertPrestataireAudit({
    prestataireId: data.id,
    action: "pro.create",
    actorType: "pro",
    actorUserId: user.id,
    actorIp: req.ip,
    afterData: data,
  });

  res.json({ ok: true, prestataire: data });
};

/**
 * PRO: Obtenir les détails d'un prestataire
 * GET /api/pro/prestataires/:id
 */
export const getProPrestataire: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const prestataireId = asString(req.params.id);
  if (!prestataireId) return res.status(400).json({ error: "missing_id" });

  const access = await checkProPrestataireAccess(user.id, prestataireId);
  if (!access.hasAccess) {
    return res.status(403).json({ error: "access_denied" });
  }

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("prestataires")
    .select(
      `
      *,
      prestataire_documents(*)
    `,
    )
    .eq("id", prestataireId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "not_found" });

  // Calculer le score de conformité
  const conformityScore = calculateConformityScore(data);

  res.json({
    ok: true,
    prestataire: data,
    documents: data.prestataire_documents ?? [],
    conformity_score: conformityScore,
  });
};

function calculateConformityScore(p: Record<string, unknown>): {
  score: number;
  checklist: { key: string; label: string; ok: boolean }[];
} {
  const checks = [
    { key: "ice", label: "ICE renseigné", ok: !!(p.ice as string)?.trim() },
    {
      key: "if",
      label: "IF renseigné",
      ok: !!(p.identifiant_fiscal as string)?.trim(),
    },
    {
      key: "adresse",
      label: "Adresse complète",
      ok: !!(p.adresse as string)?.trim(),
    },
    {
      key: "ville",
      label: "Ville renseignée",
      ok: !!(p.ville as string)?.trim(),
    },
    {
      key: "banque",
      label: "Coordonnées bancaires",
      ok: !!(p.banque_nom as string)?.trim(),
    },
    {
      key: "titulaire",
      label: "Titulaire compte",
      ok: !!(p.titulaire_compte as string)?.trim(),
    },
    { key: "email", label: "Email fourni", ok: !!(p.email as string)?.trim() },
    {
      key: "telephone",
      label: "Téléphone fourni",
      ok: !!(p.telephone as string)?.trim(),
    },
  ];

  // Si SOCIETE/SARL/SA, le RC est obligatoire
  const type = (p.type_prestataire as string) ?? "";
  if (
    ["sarl", "sa", "sas", "entreprise_individuelle"].includes(
      type.toLowerCase(),
    )
  ) {
    checks.push({
      key: "rc",
      label: "Registre de Commerce",
      ok: !!(p.registre_commerce as string)?.trim(),
    });
  }

  const docs = (p.prestataire_documents as any[]) ?? [];
  const hasCarteDoc = docs.some(
    (d) => d.type_document === "CARTE_AE_OU_RC" && d.statut === "VALIDE",
  );
  const hasRibDoc = docs.some(
    (d) => d.type_document === "RIB_SCAN" && d.statut === "VALIDE",
  );

  checks.push({
    key: "doc_carte",
    label: "Document RC/Carte AE",
    ok: hasCarteDoc,
  });
  checks.push({ key: "doc_rib", label: "Scan RIB", ok: hasRibDoc });

  const passed = checks.filter((c) => c.ok).length;
  const score = Math.round((passed / checks.length) * 100);

  return { score, checklist: checks };
}

/**
 * PRO: Mettre à jour un prestataire
 * POST /api/pro/prestataires/:id/update
 */
export const updateProPrestataire: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const prestataireId = asString(req.params.id);
  if (!prestataireId) return res.status(400).json({ error: "missing_id" });

  const access = await checkProPrestataireAccess(user.id, prestataireId);
  if (!access.hasAccess) {
    return res.status(403).json({ error: "access_denied" });
  }

  const supabase = getAdminSupabase();

  // Récupérer le prestataire actuel
  const { data: current } = await supabase
    .from("prestataires")
    .select("*")
    .eq("id", prestataireId)
    .single();

  if (!current) return res.status(404).json({ error: "not_found" });

  // Si BLOQUE, seuls les champs contact sont modifiables
  const isBlocked = current.statut === "BLOQUE";
  const body = req.body as Record<string, unknown>;

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (isBlocked) {
    // Champs limités si bloqué
    if (body.email !== undefined) update.email = asOptionalString(body.email);
    if (body.telephone !== undefined)
      update.telephone = asOptionalString(body.telephone);
  } else {
    // Tous les champs éditables (sauf statut)
    if (body.nom_legal !== undefined)
      update.nom_legal = asString(body.nom_legal) || current.nom_legal;
    if (body.type_prestataire !== undefined)
      update.type_prestataire = asOptionalString(body.type_prestataire);
    if (body.categorie_prestation !== undefined)
      update.categorie_prestation = asOptionalString(body.categorie_prestation);
    if (body.ice !== undefined) update.ice = asOptionalString(body.ice);
    if (body.identifiant_fiscal !== undefined)
      update.identifiant_fiscal = asOptionalString(body.identifiant_fiscal);
    if (body.registre_commerce !== undefined)
      update.registre_commerce = asOptionalString(body.registre_commerce);
    if (body.adresse !== undefined)
      update.adresse = asOptionalString(body.adresse);
    if (body.ville !== undefined) update.ville = asOptionalString(body.ville);
    if (body.pays !== undefined) update.pays = asOptionalString(body.pays);
    if (body.email !== undefined) update.email = asOptionalString(body.email);
    if (body.telephone !== undefined)
      update.telephone = asOptionalString(body.telephone);
    if (body.banque_nom !== undefined)
      update.banque_nom = asOptionalString(body.banque_nom);
    if (body.titulaire_compte !== undefined)
      update.titulaire_compte = asOptionalString(body.titulaire_compte);
    if (body.tva_applicable !== undefined) {
      update.tva_applicable = asBool(body.tva_applicable);
      update.tva_taux = asBool(body.tva_applicable)
        ? (asInt(body.tva_taux) ?? 20)
        : 0;
    } else if (body.tva_taux !== undefined && current.tva_applicable) {
      update.tva_taux = asInt(body.tva_taux) ?? 20;
    }
    if (body.zone_intervention !== undefined)
      update.zone_intervention = asOptionalString(body.zone_intervention);
  }

  const { data, error } = await supabase
    .from("prestataires")
    .update(update)
    .eq("id", prestataireId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Audit log
  await insertPrestataireAudit({
    prestataireId,
    action: "pro.update",
    actorType: "pro",
    actorUserId: user.id,
    actorIp: req.ip,
    beforeData: current,
    afterData: data,
  });

  res.json({ ok: true, prestataire: data });
};

/**
 * PRO: Soumettre un prestataire à validation (BROUILLON -> EN_VALIDATION)
 * POST /api/pro/prestataires/:id/submit
 */
export const submitProPrestataireForValidation: RequestHandler = async (
  req,
  res,
) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const prestataireId = asString(req.params.id);
  if (!prestataireId) return res.status(400).json({ error: "missing_id" });

  const access = await checkProPrestataireAccess(user.id, prestataireId);
  if (!access.hasAccess) {
    return res.status(403).json({ error: "access_denied" });
  }

  const supabase = getAdminSupabase();

  const { data: current } = await supabase
    .from("prestataires")
    .select("*")
    .eq("id", prestataireId)
    .single();

  if (!current) return res.status(404).json({ error: "not_found" });

  if (current.statut !== "BROUILLON") {
    return res.status(400).json({
      error: "invalid_status",
      message: "Seul un prestataire en BROUILLON peut être soumis à validation",
    });
  }

  // Vérifier les champs obligatoires pour soumission
  const missing: string[] = [];
  if (!current.nom_legal?.trim()) missing.push("nom_legal");
  if (!current.ice?.trim()) missing.push("ice");
  if (!current.identifiant_fiscal?.trim()) missing.push("identifiant_fiscal");

  if (missing.length > 0) {
    return res.status(400).json({
      error: "missing_required_fields",
      fields: missing,
      message: `Champs obligatoires manquants: ${missing.join(", ")}`,
    });
  }

  const { data, error } = await supabase
    .from("prestataires")
    .update({
      statut: "EN_VALIDATION",
      updated_at: new Date().toISOString(),
    })
    .eq("id", prestataireId)
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Audit log
  await insertPrestataireAudit({
    prestataireId,
    action: "pro.submit_validation",
    actorType: "pro",
    actorUserId: user.id,
    actorIp: req.ip,
    beforeData: { statut: current.statut },
    afterData: { statut: "EN_VALIDATION" },
  });

  res.json({ ok: true, prestataire: data });
};

/**
 * PRO: Lister les documents d'un prestataire
 * GET /api/pro/prestataires/:id/documents
 */
export const listProPrestataireDocuments: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const prestataireId = asString(req.params.id);
  if (!prestataireId) return res.status(400).json({ error: "missing_id" });

  const access = await checkProPrestataireAccess(user.id, prestataireId);
  if (!access.hasAccess) {
    return res.status(403).json({ error: "access_denied" });
  }

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("prestataire_documents")
    .select("*")
    .eq("prestataire_id", prestataireId)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: data ?? [] });
};

/**
 * PRO: Uploader un document pour un prestataire
 * POST /api/pro/prestataires/:id/documents
 */
export const uploadProPrestataireDocument: RequestHandler = async (
  req,
  res,
) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });

  const prestataireId = asString(req.params.id);
  if (!prestataireId) return res.status(400).json({ error: "missing_id" });

  const access = await checkProPrestataireAccess(user.id, prestataireId);
  if (!access.hasAccess) {
    return res.status(403).json({ error: "access_denied" });
  }

  const body = req.body as Record<string, unknown>;
  const typeDocument = asString(body.type_document);
  const fileName = asString(body.file_name);
  const fileBase64 = asString(body.file_base64);
  const mimeType = asOptionalString(body.mime_type) ?? "application/pdf";

  if (!typeDocument || !fileName || !fileBase64) {
    return res.status(400).json({ error: "missing_fields" });
  }

  const validTypes = [
    "CARTE_AE_OU_RC",
    "ATTESTATION_ICE_IF",
    "RIB_SCAN",
    "AUTRE",
  ];
  if (!validTypes.includes(typeDocument)) {
    return res.status(400).json({ error: "invalid_type_document" });
  }

  const supabase = getAdminSupabase();

  // Vérifier que le prestataire n'est pas bloqué
  const { data: prest } = await supabase
    .from("prestataires")
    .select("statut")
    .eq("id", prestataireId)
    .single();

  if (prest?.statut === "BLOQUE") {
    return res.status(403).json({ error: "prestataire_bloque" });
  }

  // Upload to storage
  const fileBuffer = Buffer.from(fileBase64, "base64");
  const storagePath = `prestataires/${prestataireId}/${Date.now()}_${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("prestataire-docs")
    .upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    console.error("[uploadProPrestataireDocument] Storage error:", uploadError);
    return res.status(500).json({ error: uploadError.message });
  }

  // Créer l'entrée en DB
  const { data, error } = await supabase
    .from("prestataire_documents")
    .insert({
      prestataire_id: prestataireId,
      type_document: typeDocument,
      file_name: fileName,
      file_path: storagePath,
      mime_type: mimeType,
      file_size_bytes: fileBuffer.length,
      statut: "UPLOADED",
      uploaded_by_user_id: user.id,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[uploadProPrestataireDocument] DB error:", error);
    return res.status(500).json({ error: error.message });
  }

  // Audit log
  await insertPrestataireAudit({
    prestataireId,
    action: "pro.upload_document",
    actorType: "pro",
    actorUserId: user.id,
    actorIp: req.ip,
    metadata: {
      document_id: data.id,
      type_document: typeDocument,
      file_name: fileName,
    },
  });

  res.json({ ok: true, document: data });
};

/**
 * PRO: Supprimer un document
 * POST /api/pro/prestataires/:id/documents/:docId/delete
 */
export const deleteProPrestataireDocument: RequestHandler = async (
  req,
  res,
) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const prestataireId = asString(req.params.id);
  const docId = asString(req.params.docId);
  if (!prestataireId || !docId)
    return res.status(400).json({ error: "missing_ids" });

  const access = await checkProPrestataireAccess(user.id, prestataireId);
  if (!access.hasAccess) {
    return res.status(403).json({ error: "access_denied" });
  }

  const supabase = getAdminSupabase();

  // Vérifier que le document appartient au prestataire et n'est pas validé
  const { data: doc } = await supabase
    .from("prestataire_documents")
    .select("*")
    .eq("id", docId)
    .eq("prestataire_id", prestataireId)
    .single();

  if (!doc) return res.status(404).json({ error: "document_not_found" });

  if (doc.statut === "VALIDE") {
    return res.status(403).json({ error: "cannot_delete_validated_document" });
  }

  // Supprimer du storage
  if (doc.file_path) {
    await supabase.storage.from("prestataire-docs").remove([doc.file_path]);
  }

  // Supprimer de la DB
  const { error } = await supabase
    .from("prestataire_documents")
    .delete()
    .eq("id", docId);

  if (error) return res.status(500).json({ error: error.message });

  // Audit log
  await insertPrestataireAudit({
    prestataireId,
    action: "pro.delete_document",
    actorType: "pro",
    actorUserId: user.id,
    actorIp: req.ip,
    metadata: { document_id: docId, type_document: doc.type_document },
  });

  res.json({ ok: true });
};

// =============================================================================
// PRO: Messages pour prestataires
// =============================================================================

/**
 * PRO: Lister les messages d'un prestataire
 * GET /api/pro/prestataires/:id/messages
 */
export const listProPrestataireMessages: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const prestataireId = asString(req.params.id);
  if (!prestataireId) return res.status(400).json({ error: "missing_id" });

  const supabase = getAdminSupabase();
  const access = await checkProPrestataireAccess(user.id, prestataireId);
  if (!access.hasAccess) {
    return res.status(403).json({ error: "access_denied" });
  }

  const { data: messages, error } = await supabase
    .from("prestataire_messages")
    .select("*")
    .eq("prestataire_id", prestataireId)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: messages ?? [] });
};

/**
 * PRO: Envoyer un message pour un prestataire
 * POST /api/pro/prestataires/:id/messages
 */
export const sendProPrestataireMessage: RequestHandler = async (req, res) => {
  const user = await getUserFromBearerToken(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });

  const prestataireId = asString(req.params.id);
  if (!prestataireId) return res.status(400).json({ error: "missing_id" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });
  const body = asString((req.body as any).body);
  const topic = asOptionalString((req.body as any).topic) || "general";

  if (!body) return res.status(400).json({ error: "missing_body" });

  const supabase = getAdminSupabase();
  const access = await checkProPrestataireAccess(user.id, prestataireId);
  if (!access.hasAccess) {
    return res.status(403).json({ error: "access_denied" });
  }

  const { data, error } = await supabase
    .from("prestataire_messages")
    .insert({
      prestataire_id: prestataireId,
      sender_type: "pro",
      sender_user_id: user.id,
      body,
      topic,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[sendProPrestataireMessage]", error);
    return res.status(500).json({ error: error.message });
  }

  // Audit log
  await insertPrestataireAudit({
    prestataireId,
    action: "pro.send_message",
    actorType: "pro",
    actorUserId: user.id,
    actorIp: req.ip,
    metadata: { message_id: data.id, topic },
  });

  res.json({ ok: true, message: data });
};

/**
 * Admin: Lister les messages d'un prestataire
 * GET /api/admin/prestataires/:id/messages
 */
export const listAdminPrestataireMessages: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const prestataireId = asString(req.params.id);
  if (!prestataireId) return res.status(400).json({ error: "missing_id" });

  const supabase = getAdminSupabase();

  const { data: messages, error } = await supabase
    .from("prestataire_messages")
    .select("*")
    .eq("prestataire_id", prestataireId)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: messages ?? [] });
};

/**
 * Admin: Envoyer un message pour un prestataire
 * POST /api/admin/prestataires/:id/messages
 */
export const sendAdminPrestataireMessage: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const prestataireId = asString(req.params.id);
  if (!prestataireId) return res.status(400).json({ error: "missing_id" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "invalid_body" });
  const body = asString((req.body as any).body);
  const topic = asOptionalString((req.body as any).topic) || "general";
  const isInternal = asBool((req.body as any).is_internal);

  if (!body) return res.status(400).json({ error: "missing_body" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("prestataire_messages")
    .insert({
      prestataire_id: prestataireId,
      sender_type: "admin",
      sender_admin_id: "admin",
      body,
      topic,
      is_internal: isInternal,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[sendAdminPrestataireMessage]", error);
    return res.status(500).json({ error: error.message });
  }

  // Audit log
  await insertPrestataireAudit({
    prestataireId,
    action: "admin.send_message",
    actorType: "admin",
    actorAdminId: "admin",
    actorIp: req.ip,
    metadata: { message_id: data.id, topic, is_internal: isInternal },
  });

  res.json({ ok: true, message: data });
};
