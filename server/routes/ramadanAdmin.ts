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
  const effectiveStatus = status || "pending_moderation";
  const supabase = getAdminSupabase();

  // 1. Ramadan offers
  const { data: offersData, error: offersError } = await supabase
    .from("ramadan_offers")
    .select("*, establishments(id, name, slug, city)")
    .eq("moderation_status", effectiveStatus)
    .order("created_at", { ascending: false })
    .limit(200);

  if (offersError) return res.status(500).json({ error: offersError.message });

  // 2. Ftour slots (only for statuses that apply)
  const SLOT_STATUSES = ["pending_moderation", "active", "rejected", "suspended"];
  let slotsData: unknown[] = [];
  if (SLOT_STATUSES.includes(effectiveStatus)) {
    const { data, error } = await supabase
      .from("pro_slots")
      .select("*, establishments!inner(id, name, city)")
      .eq("service_label", "Ftour")
      .eq("moderation_status", effectiveStatus)
      .order("created_at", { ascending: false })
      .limit(200);

    if (!error && data) slotsData = data;
  }

  // 3. Tag ramadan offers
  const offers = (offersData ?? []).map((o: any) => ({ ...o, item_type: "ramadan_offer" }));

  // 4. Group ftour slots by establishment
  const slotsByEstab = new Map<string, any[]>();
  for (const s of slotsData as any[]) {
    const eid = s.establishment_id ?? s.establishments?.id;
    if (!eid) continue;
    if (!slotsByEstab.has(eid)) slotsByEstab.set(eid, []);
    slotsByEstab.get(eid)!.push(s);
  }

  const ftourGroups = Array.from(slotsByEstab.entries()).map(([estabId, slots]) => {
    const sorted = [...slots].sort(
      (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const latestCreated = slots.reduce((latest: number, s: any) => {
      const d = new Date(s.created_at).getTime();
      return d > latest ? d : latest;
    }, 0);

    return {
      id: `ftour_group_${estabId}`,
      item_type: "ftour_group",
      establishment_id: estabId,
      establishments: first.establishments,
      moderation_status: effectiveStatus,
      slot_ids: slots.map((s: any) => s.id),
      slot_count: slots.length,
      date_from: first.starts_at,
      date_to: last.starts_at,
      total_capacity: slots.reduce((sum: number, s: any) => sum + (s.capacity ?? 0), 0),
      base_price: first.base_price,
      promo_type: first.promo_type,
      promo_value: first.promo_value,
      promo_label: first.promo_label,
      cover_url: first.cover_url,
      is_featured: !!(first as any).is_featured,
      created_at: new Date(latestCreated).toISOString(),
      // Détail des slots individuels (pour dialog de correction)
      slots: sorted.map((s: any) => ({
        id: s.id,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        base_price: s.base_price,
        capacity: s.capacity,
        promo_type: s.promo_type,
        promo_value: s.promo_value,
        promo_label: s.promo_label,
      })),
    };
  });

  const items = [...offers, ...ftourGroups].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return res.json({ offers: items });
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

  // Ftour slots counts — count distinct establishments (grouped in moderation queue)
  const { data: allSlots } = await supabase
    .from("pro_slots")
    .select("moderation_status, establishment_id")
    .eq("service_label", "Ftour");

  const ftourEstabsByStatus = new Map<string, Set<string>>();
  for (const s of (allSlots ?? []) as Array<{ moderation_status: string; establishment_id: string }>) {
    const st = s.moderation_status ?? "active";
    if (!ftourEstabsByStatus.has(st)) ftourEstabsByStatus.set(st, new Set());
    ftourEstabsByStatus.get(st)!.add(s.establishment_id);
  }
  for (const [st, estabs] of ftourEstabsByStatus) {
    byStatus[st] = (byStatus[st] ?? 0) + estabs.size;
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
      total_offers: offers.length + Array.from(ftourEstabsByStatus.values()).reduce((sum, s) => sum + s.size, 0),
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
// POST /api/admin/ramadan/:id/activate — Publier immédiatement (admin)
// ---------------------------------------------------------------------------
router.post("/:id/activate", (async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const offerId = req.params.id;
  if (!offerId || !isValidUUID(offerId)) return res.status(400).json({ error: "ID invalide." });

  const supabase = getAdminSupabase();
  const { data: offer } = await supabase
    .from("ramadan_offers")
    .select("id, moderation_status")
    .eq("id", offerId)
    .maybeSingle();

  if (!offer) return res.status(404).json({ error: "Offre introuvable." });
  if ((offer as any).moderation_status !== "approved") {
    return res.status(400).json({ error: "Seules les offres approuvées peuvent être activées." });
  }

  const { error } = await supabase
    .from("ramadan_offers")
    .update({
      moderation_status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", offerId);

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// PATCH /api/admin/ramadan/:id/cover — Mettre à jour la photo de couverture
// ---------------------------------------------------------------------------
router.patch("/:id/cover", (async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const offerId = req.params.id;
  if (!offerId || !isValidUUID(offerId)) return res.status(400).json({ error: "ID invalide." });

  const coverUrl = typeof req.body?.cover_url === "string" ? req.body.cover_url.trim() : null;

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from("ramadan_offers")
    .update({ cover_url: coverUrl || null })
    .eq("id", offerId);

  if (error) return res.status(500).json({ error: error.message });

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

// =============================================================================
// Ftour Slot bulk actions
// =============================================================================

// PATCH /api/admin/ramadan/slots/cover — Mettre à jour la cover pour un groupe ftour
router.patch("/slots/cover", (async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const { slot_ids, cover_url } = req.body ?? {};
  if (!Array.isArray(slot_ids) || !slot_ids.length || !slot_ids.every(isValidUUID)) {
    return res.status(400).json({ error: "slot_ids invalides." });
  }
  const url = typeof cover_url === "string" ? cover_url.trim() : null;

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from("pro_slots")
    .update({ cover_url: url || null })
    .in("id", slot_ids);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}) as RequestHandler);

// POST /api/admin/ramadan/slots/feature — Mettre en avant un groupe ftour
router.post("/slots/feature", (async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const { slot_ids, featured } = req.body ?? {};
  if (!Array.isArray(slot_ids) || !slot_ids.length || !slot_ids.every(isValidUUID)) {
    return res.status(400).json({ error: "slot_ids invalides." });
  }

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from("pro_slots")
    .update({ is_featured: !!featured })
    .in("id", slot_ids);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}) as RequestHandler);

// POST /api/admin/ramadan/slots/bulk-action
router.post("/slots/bulk-action", (async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const { slot_ids, action, reason } = req.body ?? {};
  if (!Array.isArray(slot_ids) || !slot_ids.length) {
    return res.status(400).json({ error: "slot_ids requis." });
  }
  if (!slot_ids.every((id: unknown) => typeof id === "string" && isValidUUID(id))) {
    return res.status(400).json({ error: "IDs invalides." });
  }

  const validActions = ["approve", "reject", "suspend", "resume", "delete"];
  if (typeof action !== "string" || !validActions.includes(action)) {
    return res.status(400).json({ error: "Action invalide." });
  }

  const supabase = getAdminSupabase();
  const adminId = getAdminId(req);
  const now = new Date().toISOString();

  if (action === "delete") {
    const { error: delErr } = await supabase
      .from("pro_slots")
      .delete()
      .in("id", slot_ids);

    if (delErr) {
      // FK violation → deactivate instead
      await supabase
        .from("pro_slots")
        .update({ active: false, moderation_status: "rejected" })
        .in("id", slot_ids);
    }
    return res.json({ ok: true });
  }

  const updateMap: Record<string, Record<string, unknown>> = {
    approve: {
      moderation_status: "active",
      active: true,
      moderated_by: adminId,
      moderated_at: now,
    },
    reject: {
      moderation_status: "rejected",
      active: false,
      moderated_by: adminId,
      moderated_at: now,
      moderation_note: (typeof reason === "string" ? reason.trim() : "") || null,
    },
    suspend: { moderation_status: "suspended", active: false },
    resume: { moderation_status: "active", active: true },
  };

  const { error } = await supabase
    .from("pro_slots")
    .update(updateMap[action])
    .in("id", slot_ids);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}) as RequestHandler);

// =============================================================================
// Ftour Slot update (admin correction)
// =============================================================================

// PATCH /api/admin/ramadan/slot/:id — Modifier les détails d'un créneau
router.patch("/slot/:id", (async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  const slotId = req.params.id;
  if (!slotId || !isValidUUID(slotId)) return res.status(400).json({ error: "ID invalide." });

  const supabase = getAdminSupabase();
  const { data: slot } = await supabase
    .from("pro_slots")
    .select("id")
    .eq("id", slotId)
    .maybeSingle();

  if (!slot) return res.status(404).json({ error: "Créneau introuvable." });

  // Only allow updating specific safe fields
  const updates: Record<string, unknown> = {};
  const body = req.body ?? {};

  if (body.base_price !== undefined) {
    const p = Number(body.base_price);
    if (!Number.isNaN(p) && p >= 0) updates.base_price = Math.round(p);
  }
  if (body.capacity !== undefined) {
    const c = Number(body.capacity);
    if (!Number.isNaN(c) && c > 0) updates.capacity = Math.round(c);
  }
  if (body.promo_type !== undefined) {
    updates.promo_type = body.promo_type || null;
  }
  if (body.promo_value !== undefined) {
    const v = Number(body.promo_value);
    updates.promo_value = !Number.isNaN(v) && v > 0 ? v : null;
  }
  if (body.promo_label !== undefined) {
    updates.promo_label = typeof body.promo_label === "string" ? body.promo_label.trim() || null : null;
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: "Aucun champ à modifier." });
  }

  const { error } = await supabase
    .from("pro_slots")
    .update(updates)
    .eq("id", slotId);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}) as RequestHandler);

// =============================================================================
// Ftour Slot individual actions (kept for backward compat)
// =============================================================================

// POST /api/admin/ramadan/slot/:id/approve
router.post("/slot/:id/approve", (async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  const slotId = req.params.id;
  if (!slotId || !isValidUUID(slotId)) return res.status(400).json({ error: "ID invalide." });

  const supabase = getAdminSupabase();
  const { data: slot } = await supabase
    .from("pro_slots")
    .select("id, moderation_status")
    .eq("id", slotId)
    .maybeSingle();

  if (!slot) return res.status(404).json({ error: "Créneau introuvable." });
  if ((slot as any).moderation_status !== "pending_moderation") {
    return res.status(400).json({ error: "Ce créneau n'est pas en attente de modération." });
  }

  const adminId = getAdminId(req);
  const { error } = await supabase
    .from("pro_slots")
    .update({
      moderation_status: "active",
      active: true,
      moderated_by: adminId,
      moderated_at: new Date().toISOString(),
    })
    .eq("id", slotId);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}) as RequestHandler);

// POST /api/admin/ramadan/slot/:id/reject
router.post("/slot/:id/reject", (async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  const slotId = req.params.id;
  if (!slotId || !isValidUUID(slotId)) return res.status(400).json({ error: "ID invalide." });

  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

  const supabase = getAdminSupabase();
  const adminId = getAdminId(req);
  const { error } = await supabase
    .from("pro_slots")
    .update({
      moderation_status: "rejected",
      active: false,
      moderated_by: adminId,
      moderated_at: new Date().toISOString(),
      moderation_note: reason || null,
    })
    .eq("id", slotId);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}) as RequestHandler);

// POST /api/admin/ramadan/slot/:id/suspend
router.post("/slot/:id/suspend", (async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  const slotId = req.params.id;
  if (!slotId || !isValidUUID(slotId)) return res.status(400).json({ error: "ID invalide." });

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from("pro_slots")
    .update({ moderation_status: "suspended", active: false })
    .eq("id", slotId);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}) as RequestHandler);

// POST /api/admin/ramadan/slot/:id/resume
router.post("/slot/:id/resume", (async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  const slotId = req.params.id;
  if (!slotId || !isValidUUID(slotId)) return res.status(400).json({ error: "ID invalide." });

  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from("pro_slots")
    .update({ moderation_status: "active", active: true })
    .eq("id", slotId);

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
}) as RequestHandler);

// DELETE /api/admin/ramadan/slot/:id
router.delete("/slot/:id", (async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  const slotId = req.params.id;
  if (!slotId || !isValidUUID(slotId)) return res.status(400).json({ error: "ID invalide." });

  const supabase = getAdminSupabase();
  const { error } = await supabase.from("pro_slots").delete().eq("id", slotId);

  if (error) {
    // FK violation → deactivate instead
    if (error.code === "23503" || error.message?.includes("foreign key")) {
      await supabase.from("pro_slots").update({ active: false, moderation_status: "rejected" }).eq("id", slotId);
      return res.json({ ok: true, deactivated: true });
    }
    return res.status(500).json({ error: error.message });
  }
  return res.json({ ok: true });
}) as RequestHandler);

export default router;
