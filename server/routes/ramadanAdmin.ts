/**
 * Routes Admin Ramadan — Modération et gestion des offres Ramadan
 *
 * GET    /api/admin/ramadan/moderation        — queue de modération
 * GET    /api/admin/ramadan/offers             — toutes les offres
 * GET    /api/admin/ramadan/stats              — statistiques globales
 * POST   /api/admin/ramadan/:id/approve        — approuver
 * POST   /api/admin/ramadan/:id/reject         — rejeter
 * POST   /api/admin/ramadan/:id/request-modification — demander modification
 * POST   /api/admin/ramadan/:id/feature        — mettre en avant
 * POST   /api/admin/ramadan/:id/unfeature      — retirer mise en avant
 * POST   /api/admin/ramadan/:id/suspend        — suspendre (admin)
 * POST   /api/admin/ramadan/:id/resume         — réactiver (admin)
 * DELETE /api/admin/ramadan/:id                — supprimer (admin)
 */

import { Router } from "express";
import type { RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { requireAdminKey } from "./admin";
import { zBody } from "../lib/validate";
import {
  ApproveRamadanOfferSchema,
  RejectRamadanOfferSchema,
  RequestModificationSchema,
} from "../schemas/ramadanAdmin";
import {
  approveRamadanOffer,
  rejectRamadanOffer,
  requestRamadanOfferModification,
  featureRamadanOffer,
  suspendRamadanOffer,
  resumeRamadanOffer,
  deleteRamadanOffer,
} from "../ramadanOfferLogic";

// =============================================================================
// Helpers
// =============================================================================

/** Extraire l'identifiant admin depuis la session JWT ou fallback null. */
function getAdminId(req: Parameters<RequestHandler>[0]): string | null {
  return (req as any).adminSession?.sub ?? null;
}

function isValidUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// =============================================================================
// Router
// =============================================================================

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/admin/ramadan/moderation — Queue de modération
// ---------------------------------------------------------------------------
router.get("/moderation", (async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const status = typeof req.query.status === "string" ? req.query.status.trim() : undefined;
  const supabase = getAdminSupabase();

  let query = supabase
    .from("ramadan_offers")
    .select("*, establishments(id, name, slug, city)")
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("moderation_status", status);
  } else {
    // Par défaut : offres en attente de modération
    query = query.eq("moderation_status", "pending_moderation");
  }

  const { data, error } = await query.limit(200);
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ offers: data ?? [] });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// GET /api/admin/ramadan/offers — Toutes les offres
// ---------------------------------------------------------------------------
router.get("/offers", (async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const status = typeof req.query.status === "string" ? req.query.status.trim() : undefined;
  const type = typeof req.query.type === "string" ? req.query.type.trim() : undefined;

  let query = supabase
    .from("ramadan_offers")
    .select("*, establishments(id, name, slug, city)")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("moderation_status", status);
  if (type) query = query.eq("type", type);

  const { data, error } = await query.limit(500);
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ offers: data ?? [] });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// GET /api/admin/ramadan/stats — Statistiques globales
// ---------------------------------------------------------------------------
router.get("/stats", (async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();

  // Compteurs par statut
  const { data: allOffers } = await supabase
    .from("ramadan_offers")
    .select("moderation_status, type");

  const offers = (allOffers ?? []) as Array<{ moderation_status: string; type: string }>;

  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const o of offers) {
    byStatus[o.moderation_status] = (byStatus[o.moderation_status] ?? 0) + 1;
    byType[o.type] = (byType[o.type] ?? 0) + 1;
  }

  // Réservations Ramadan
  const { count: totalReservations } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .not("ramadan_offer_id", "is", null);

  // Scans QR
  const { count: totalScans } = await supabase
    .from("ramadan_qr_scans")
    .select("id", { count: "exact", head: true })
    .eq("scan_status", "valid");

  return res.json({
    stats: {
      total_offers: offers.length,
      by_status: byStatus,
      by_type: byType,
      total_reservations: totalReservations ?? 0,
      total_valid_scans: totalScans ?? 0,
    },
  });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// POST /api/admin/ramadan/:id/approve — Approuver
// ---------------------------------------------------------------------------
router.post("/:id/approve", zBody(ApproveRamadanOfferSchema), (async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  const adminId = getAdminId(req);

  const offerId = req.params.id;
  if (!offerId || !isValidUUID(offerId)) return res.status(400).json({ error: "ID invalide." });

  const note = typeof req.body?.note === "string" ? req.body.note.trim() : undefined;
  const result = await approveRamadanOffer(offerId, adminId, note);

  if (!result.ok) return res.status(400).json({ error: result.error });
  return res.json({ ok: true });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// POST /api/admin/ramadan/:id/reject — Rejeter
// ---------------------------------------------------------------------------
router.post("/:id/reject", zBody(RejectRamadanOfferSchema), (async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  const adminId = getAdminId(req);

  const offerId = req.params.id;
  if (!offerId || !isValidUUID(offerId)) return res.status(400).json({ error: "ID invalide." });

  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!reason) return res.status(400).json({ error: "Motif de rejet requis." });

  const result = await rejectRamadanOffer(offerId, adminId, reason);
  if (!result.ok) return res.status(400).json({ error: result.error });

  return res.json({ ok: true });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// POST /api/admin/ramadan/:id/request-modification — Demander modification
// ---------------------------------------------------------------------------
router.post("/:id/request-modification", zBody(RequestModificationSchema), (async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  const adminId = getAdminId(req);

  const offerId = req.params.id;
  if (!offerId || !isValidUUID(offerId)) return res.status(400).json({ error: "ID invalide." });

  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  if (!note) return res.status(400).json({ error: "Note requise." });

  const result = await requestRamadanOfferModification(offerId, adminId, note);
  if (!result.ok) return res.status(400).json({ error: result.error });

  return res.json({ ok: true });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// POST /api/admin/ramadan/:id/feature — Mettre en avant
// ---------------------------------------------------------------------------
router.post("/:id/feature", (async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const offerId = req.params.id;
  if (!offerId || !isValidUUID(offerId)) return res.status(400).json({ error: "ID invalide." });

  const result = await featureRamadanOffer(offerId, true);
  if (!result.ok) return res.status(400).json({ error: result.error });

  return res.json({ ok: true });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// POST /api/admin/ramadan/:id/unfeature — Retirer mise en avant
// ---------------------------------------------------------------------------
router.post("/:id/unfeature", (async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const offerId = req.params.id;
  if (!offerId || !isValidUUID(offerId)) return res.status(400).json({ error: "ID invalide." });

  const result = await featureRamadanOffer(offerId, false);
  if (!result.ok) return res.status(400).json({ error: result.error });

  return res.json({ ok: true });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// POST /api/admin/ramadan/:id/suspend — Suspendre (admin)
// ---------------------------------------------------------------------------
router.post("/:id/suspend", (async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const offerId = req.params.id;
  if (!offerId || !isValidUUID(offerId)) return res.status(400).json({ error: "ID invalide." });

  // Récupérer l'établissement pour la suspension
  const supabase = getAdminSupabase();
  const { data: offer } = await supabase
    .from("ramadan_offers")
    .select("establishment_id")
    .eq("id", offerId)
    .maybeSingle();

  if (!offer) return res.status(404).json({ error: "Offre introuvable." });

  const result = await suspendRamadanOffer(offerId, (offer as any).establishment_id);
  if (!result.ok) return res.status(400).json({ error: result.error });

  return res.json({ ok: true });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// POST /api/admin/ramadan/:id/resume — Réactiver une offre suspendue (admin)
// ---------------------------------------------------------------------------
router.post("/:id/resume", (async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const offerId = req.params.id;
  if (!offerId || !isValidUUID(offerId)) return res.status(400).json({ error: "ID invalide." });

  const supabase = getAdminSupabase();
  const { data: offer } = await supabase
    .from("ramadan_offers")
    .select("establishment_id")
    .eq("id", offerId)
    .maybeSingle();

  if (!offer) return res.status(404).json({ error: "Offre introuvable." });

  const result = await resumeRamadanOffer(offerId, (offer as any).establishment_id);
  if (!result.ok) return res.status(400).json({ error: result.error });

  return res.json({ ok: true });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// DELETE /api/admin/ramadan/:id — Supprimer une offre (admin)
// ---------------------------------------------------------------------------
router.delete("/:id", (async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const offerId = req.params.id;
  if (!offerId || !isValidUUID(offerId)) return res.status(400).json({ error: "ID invalide." });

  const supabase = getAdminSupabase();
  const { data: offer } = await supabase
    .from("ramadan_offers")
    .select("establishment_id")
    .eq("id", offerId)
    .maybeSingle();

  if (!offer) return res.status(404).json({ error: "Offre introuvable." });

  const result = await deleteRamadanOffer(offerId, (offer as any).establishment_id, true);
  if (!result.ok) return res.status(400).json({ error: result.error });

  return res.json({ ok: true });
}) as RequestHandler);

export default router;
