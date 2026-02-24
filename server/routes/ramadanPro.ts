/**
 * Routes Pro Ramadan — Gestion des offres Ramadan par les professionnels
 *
 * POST   /api/pro/ramadan-offers              — créer une offre
 * GET    /api/pro/ramadan-offers              — lister mes offres
 * GET    /api/pro/ramadan-offers/:id          — détail d'une offre
 * PUT    /api/pro/ramadan-offers/:id          — modifier une offre
 * POST   /api/pro/ramadan-offers/:id/submit   — soumettre pour modération
 * DELETE /api/pro/ramadan-offers/:id          — supprimer un brouillon
 * GET    /api/pro/ramadan-offers/:id/reservations — réservations liées
 * GET    /api/pro/ramadan-offers/:id/stats    — statistiques
 */

import { Router } from "express";
import type { RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import {
  createRamadanOffer,
  updateRamadanOffer,
  submitRamadanOfferForModeration,
  suspendRamadanOffer,
  resumeRamadanOffer,
  deleteRamadanOffer,
} from "../ramadanOfferLogic";
import type { RamadanOfferType } from "../../shared/ramadanTypes";
import { zBody } from "../lib/validate";
import {
  createRamadanOfferSchema,
  updateRamadanOfferSchema,
  ramadanOfferEstablishmentSchema,
} from "../schemas/ramadanPro";

// =============================================================================
// Auth helpers (même pattern que packsPro.ts)
// =============================================================================

type ProUser = { id: string; email?: string | null };

function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const [scheme, token] = trimmed.split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;
  return token && token.trim() ? token.trim() : null;
}

async function getProUser(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
): Promise<ProUser | null> {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return null;
  }

  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  return { id: data.user.id, email: data.user.email };
}

async function ensureEstablishmentMember(
  userId: string,
  establishmentId: string,
): Promise<boolean> {
  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from("pro_establishment_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  return !!data;
}

async function getProEstablishmentIds(userId: string): Promise<string[]> {
  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from("pro_establishment_memberships")
    .select("establishment_id")
    .eq("user_id", userId);

  if (!data) return [];
  return (data as any[]).map((r) => r.establishment_id);
}

// =============================================================================
// Helpers
// =============================================================================

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function isValidUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

const VALID_OFFER_TYPES: RamadanOfferType[] = ["ftour", "shour", "traiteur", "pack_famille", "special"];

// =============================================================================
// Router
// =============================================================================

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/pro/ramadan-offers — Créer une offre
// ---------------------------------------------------------------------------
router.post("/", zBody(createRamadanOfferSchema), (async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const body = req.body ?? {};
  const establishmentId = asString(body.establishment_id);

  if (!establishmentId || !isValidUUID(establishmentId)) {
    return res.status(400).json({ error: "establishment_id requis." });
  }

  const isMember = await ensureEstablishmentMember(user.id, establishmentId);
  if (!isMember) {
    return res.status(403).json({ error: "Accès refusé à cet établissement." });
  }

  const title = asString(body.title);
  if (!title) return res.status(400).json({ error: "Titre requis." });

  const type = asString(body.type) as RamadanOfferType | undefined;
  if (!type || !VALID_OFFER_TYPES.includes(type)) {
    return res.status(400).json({ error: "Type invalide. Valeurs possibles : ftour, shour, traiteur, pack_famille, special." });
  }

  const price = typeof body.price === "number" ? body.price : undefined;
  if (!price || price <= 0) return res.status(400).json({ error: "Prix requis (en centimes, > 0)." });

  const validFrom = asString(body.valid_from);
  const validTo = asString(body.valid_to);
  if (!validFrom || !validTo) {
    return res.status(400).json({ error: "Dates valid_from et valid_to requises." });
  }

  const timeSlots = Array.isArray(body.time_slots) ? body.time_slots : [];

  const result = await createRamadanOffer({
    establishmentId,
    title,
    descriptionFr: asString(body.description_fr) ?? null,
    descriptionAr: asString(body.description_ar) ?? null,
    type,
    price,
    originalPrice: typeof body.original_price === "number" ? body.original_price : null,
    capacityPerSlot: typeof body.capacity_per_slot === "number" ? body.capacity_per_slot : 20,
    timeSlots,
    photos: Array.isArray(body.photos) ? body.photos : [],
    coverUrl: asString(body.cover_url) ?? null,
    conditionsFr: asString(body.conditions_fr) ?? null,
    conditionsAr: asString(body.conditions_ar) ?? null,
    validFrom,
    validTo,
  }, user.id);

  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }

  return res.json({ ok: true, offer_id: result.data.offerId });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// GET /api/pro/ramadan-offers — Lister mes offres
// ---------------------------------------------------------------------------
router.get("/", (async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const establishmentId = asString(req.query.establishment_id as string);
  const supabase = getAdminSupabase();

  let query = supabase
    .from("ramadan_offers")
    .select("*")
    .order("created_at", { ascending: false });

  if (establishmentId && isValidUUID(establishmentId)) {
    const isMember = await ensureEstablishmentMember(user.id, establishmentId);
    if (!isMember) return res.status(403).json({ error: "Accès refusé." });
    query = query.eq("establishment_id", establishmentId);
  } else {
    const estIds = await getProEstablishmentIds(user.id);
    if (!estIds.length) return res.json({ offers: [] });
    query = query.in("establishment_id", estIds);
  }

  const { data, error } = await query.limit(200);
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ offers: data ?? [] });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// GET /api/pro/ramadan-offers/:id — Détail
// ---------------------------------------------------------------------------
router.get("/:id", (async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const offerId = req.params.id;
  if (!offerId || !isValidUUID(offerId)) return res.status(400).json({ error: "ID invalide." });

  const supabase = getAdminSupabase();
  const { data: offer, error } = await supabase
    .from("ramadan_offers")
    .select("*")
    .eq("id", offerId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!offer) return res.status(404).json({ error: "Offre introuvable." });

  const isMember = await ensureEstablishmentMember(user.id, (offer as any).establishment_id);
  if (!isMember) return res.status(403).json({ error: "Accès refusé." });

  return res.json({ offer });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// PUT /api/pro/ramadan-offers/:id — Modifier
// ---------------------------------------------------------------------------
router.put("/:id", zBody(updateRamadanOfferSchema), (async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const offerId = req.params.id;
  if (!offerId || !isValidUUID(offerId)) return res.status(400).json({ error: "ID invalide." });

  const body = req.body ?? {};
  const establishmentId = asString(body.establishment_id);

  if (!establishmentId || !isValidUUID(establishmentId)) {
    return res.status(400).json({ error: "establishment_id requis." });
  }

  const isMember = await ensureEstablishmentMember(user.id, establishmentId);
  if (!isMember) return res.status(403).json({ error: "Accès refusé." });

  const result = await updateRamadanOffer(offerId, establishmentId, {
    title: asString(body.title),
    descriptionFr: body.description_fr !== undefined ? (asString(body.description_fr) ?? null) : undefined,
    descriptionAr: body.description_ar !== undefined ? (asString(body.description_ar) ?? null) : undefined,
    type: body.type !== undefined ? (asString(body.type) as RamadanOfferType) : undefined,
    price: typeof body.price === "number" ? body.price : undefined,
    originalPrice: body.original_price !== undefined ? (typeof body.original_price === "number" ? body.original_price : null) : undefined,
    capacityPerSlot: typeof body.capacity_per_slot === "number" ? body.capacity_per_slot : undefined,
    timeSlots: Array.isArray(body.time_slots) ? body.time_slots : undefined,
    photos: Array.isArray(body.photos) ? body.photos : undefined,
    coverUrl: body.cover_url !== undefined ? (asString(body.cover_url) ?? null) : undefined,
    conditionsFr: body.conditions_fr !== undefined ? (asString(body.conditions_fr) ?? null) : undefined,
    conditionsAr: body.conditions_ar !== undefined ? (asString(body.conditions_ar) ?? null) : undefined,
    validFrom: asString(body.valid_from),
    validTo: asString(body.valid_to),
  });

  if (!result.ok) return res.status(400).json({ error: result.error });

  return res.json({ ok: true, requires_moderation: result.data.requiresModeration });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// POST /api/pro/ramadan-offers/:id/submit — Soumettre pour modération
// ---------------------------------------------------------------------------
router.post("/:id/submit", zBody(ramadanOfferEstablishmentSchema), (async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const offerId = req.params.id;
  if (!offerId || !isValidUUID(offerId)) return res.status(400).json({ error: "ID invalide." });

  const body = req.body ?? {};
  const establishmentId = asString(body.establishment_id);

  if (!establishmentId || !isValidUUID(establishmentId)) {
    return res.status(400).json({ error: "establishment_id requis." });
  }

  const isMember = await ensureEstablishmentMember(user.id, establishmentId);
  if (!isMember) return res.status(403).json({ error: "Accès refusé." });

  const result = await submitRamadanOfferForModeration(offerId, establishmentId);
  if (!result.ok) return res.status(400).json({ error: result.error });

  return res.json({ ok: true });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// POST /api/pro/ramadan-offers/:id/suspend — Suspendre
// ---------------------------------------------------------------------------
router.post("/:id/suspend", zBody(ramadanOfferEstablishmentSchema), (async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const offerId = req.params.id;
  if (!offerId || !isValidUUID(offerId)) return res.status(400).json({ error: "ID invalide." });

  const body = req.body ?? {};
  const establishmentId = asString(body.establishment_id);
  if (!establishmentId || !isValidUUID(establishmentId)) return res.status(400).json({ error: "establishment_id requis." });

  const isMember = await ensureEstablishmentMember(user.id, establishmentId);
  if (!isMember) return res.status(403).json({ error: "Accès refusé." });

  const result = await suspendRamadanOffer(offerId, establishmentId);
  if (!result.ok) return res.status(400).json({ error: result.error });

  return res.json({ ok: true });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// POST /api/pro/ramadan-offers/:id/resume — Reprendre
// ---------------------------------------------------------------------------
router.post("/:id/resume", zBody(ramadanOfferEstablishmentSchema), (async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const offerId = req.params.id;
  if (!offerId || !isValidUUID(offerId)) return res.status(400).json({ error: "ID invalide." });

  const body = req.body ?? {};
  const establishmentId = asString(body.establishment_id);
  if (!establishmentId || !isValidUUID(establishmentId)) return res.status(400).json({ error: "establishment_id requis." });

  const isMember = await ensureEstablishmentMember(user.id, establishmentId);
  if (!isMember) return res.status(403).json({ error: "Accès refusé." });

  const result = await resumeRamadanOffer(offerId, establishmentId);
  if (!result.ok) return res.status(400).json({ error: result.error });

  return res.json({ ok: true });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// DELETE /api/pro/ramadan-offers/:id — Supprimer un brouillon
// ---------------------------------------------------------------------------
router.delete("/:id", (async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const offerId = req.params.id;
  if (!offerId || !isValidUUID(offerId)) return res.status(400).json({ error: "ID invalide." });

  // Récupérer l'offre pour vérifier l'accès
  const supabase = getAdminSupabase();
  const { data: offer } = await supabase
    .from("ramadan_offers")
    .select("establishment_id")
    .eq("id", offerId)
    .maybeSingle();

  if (!offer) return res.status(404).json({ error: "Offre introuvable." });

  const isMember = await ensureEstablishmentMember(user.id, (offer as any).establishment_id);
  if (!isMember) return res.status(403).json({ error: "Accès refusé." });

  const result = await deleteRamadanOffer(offerId, (offer as any).establishment_id);
  if (!result.ok) return res.status(400).json({ error: result.error });

  return res.json({ ok: true });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// GET /api/pro/ramadan-offers/:id/reservations — Réservations liées
// ---------------------------------------------------------------------------
router.get("/:id/reservations", (async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const offerId = req.params.id;
  if (!offerId || !isValidUUID(offerId)) return res.status(400).json({ error: "ID invalide." });

  const supabase = getAdminSupabase();

  // Vérifier l'accès
  const { data: offer } = await supabase
    .from("ramadan_offers")
    .select("id, establishment_id")
    .eq("id", offerId)
    .maybeSingle();

  if (!offer) return res.status(404).json({ error: "Offre introuvable." });

  const isMember = await ensureEstablishmentMember(user.id, (offer as any).establishment_id);
  if (!isMember) return res.status(403).json({ error: "Accès refusé." });

  const { data: reservations, error } = await supabase
    .from("reservations")
    .select("id, user_id, starts_at, party_size, status, created_at, consumer_name, consumer_phone")
    .eq("ramadan_offer_id", offerId)
    .order("starts_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ reservations: reservations ?? [] });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// GET /api/pro/ramadan-offers/:id/stats — Statistiques
// ---------------------------------------------------------------------------
router.get("/:id/stats", (async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  const offerId = req.params.id;
  if (!offerId || !isValidUUID(offerId)) return res.status(400).json({ error: "ID invalide." });

  const supabase = getAdminSupabase();

  // Vérifier l'accès
  const { data: offer } = await supabase
    .from("ramadan_offers")
    .select("id, establishment_id, capacity_per_slot")
    .eq("id", offerId)
    .maybeSingle();

  if (!offer) return res.status(404).json({ error: "Offre introuvable." });

  const isMember = await ensureEstablishmentMember(user.id, (offer as any).establishment_id);
  if (!isMember) return res.status(403).json({ error: "Accès refusé." });

  // Compteur de réservations
  const { count: totalReservations } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("ramadan_offer_id", offerId);

  const { count: confirmedReservations } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("ramadan_offer_id", offerId)
    .in("status", ["confirmed", "seated", "completed"]);

  // Scans QR
  const { count: totalScans } = await supabase
    .from("ramadan_qr_scans")
    .select("id", { count: "exact", head: true })
    .eq("ramadan_offer_id", offerId)
    .eq("scan_status", "valid");

  // Vues et clics (ramadan_offer_views)
  const { count: totalClicks } = await supabase
    .from("ramadan_offer_views")
    .select("id", { count: "exact", head: true })
    .eq("offer_id", offerId)
    .eq("event_type", "click");

  const { count: totalImpressions } = await supabase
    .from("ramadan_offer_views")
    .select("id", { count: "exact", head: true })
    .eq("offer_id", offerId)
    .eq("event_type", "impression");

  // Visiteurs uniques (clics) — count distinct visitor_id
  const { data: uniqueClickVisitors } = await supabase
    .rpc("count_distinct_visitors", { p_offer_id: offerId, p_event_type: "click" })
    .maybeSingle();

  // Visiteurs uniques (impressions)
  const { data: uniqueImpressionVisitors } = await supabase
    .rpc("count_distinct_visitors", { p_offer_id: offerId, p_event_type: "impression" })
    .maybeSingle();

  return res.json({
    stats: {
      total_reservations: totalReservations ?? 0,
      confirmed_reservations: confirmedReservations ?? 0,
      total_scans: totalScans ?? 0,
      capacity_per_slot: (offer as any).capacity_per_slot,
      total_clicks: totalClicks ?? 0,
      total_impressions: totalImpressions ?? 0,
      unique_click_visitors: (uniqueClickVisitors as any)?.count ?? 0,
      unique_impression_visitors: (uniqueImpressionVisitors as any)?.count ?? 0,
    },
  });
}) as RequestHandler);

export default router;
