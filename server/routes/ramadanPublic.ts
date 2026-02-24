/**
 * Routes Publiques Ramadan — Consultation des offres Ramadan
 *
 * GET  /api/public/ramadan-offers                         — offres actives (filtres ville/type)
 * GET  /api/public/ramadan-offers/:id                     — détail offre publique
 * POST /api/public/ramadan-offers/:id/track               — tracker impression/click
 * GET  /api/public/establishments/:id/ramadan-offers      — offres d'un établissement
 */

import { Router } from "express";
import type { RequestHandler, Request } from "express";
import { createHash } from "node:crypto";
import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("ramadanPublic");

// =============================================================================
// Helpers
// =============================================================================

function isValidUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** Génère un fingerprint anonyme pour compter les visiteurs uniques */
function computeVisitorId(req: Request): string {
  const ip = req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "unknown";
  const ua = req.headers["user-agent"] ?? "unknown";
  return createHash("sha256").update(`${ip}|${ua}`).digest("hex").slice(0, 16);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v.trim() || undefined : undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

// =============================================================================
// Router
// =============================================================================

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/public/ramadan-offers — Offres actives
// ---------------------------------------------------------------------------
router.get("/", (async (req, res) => {
  const supabase = getAdminSupabase();

  const type = asString(req.query.type);
  const city = asString(req.query.city);
  const featured = req.query.featured === "true";
  const minPrice = asNumber(req.query.min_price);
  const maxPrice = asNumber(req.query.max_price);
  const sort = asString(req.query.sort) || "featured";
  const page = Math.max(1, asNumber(req.query.page) || 1);
  const perPage = Math.min(50, Math.max(1, asNumber(req.query.per_page) || 20));
  const offset = (page - 1) * perPage;

  let query = supabase
    .from("ramadan_offers")
    .select("*, establishments(id, name, slug, city, cover_url, logo_url, universe)", { count: "exact" })
    .eq("moderation_status", "active");

  if (type) query = query.eq("type", type);
  if (featured) query = query.eq("is_featured", true);
  if (minPrice !== undefined) query = query.gte("price", minPrice);
  if (maxPrice !== undefined) query = query.lte("price", maxPrice);

  // Tri
  switch (sort) {
    case "price_asc":
      query = query.order("price", { ascending: true });
      break;
    case "price_desc":
      query = query.order("price", { ascending: false });
      break;
    case "newest":
      query = query.order("created_at", { ascending: false });
      break;
    case "featured":
    default:
      query = query
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false });
      break;
  }

  // Quand city est actif, on fait le filtrage post-fetch (jointure Supabase)
  // car on ne peut pas filtrer sur establishments.city directement.
  // Le volume d'offres Ramadan actives est faible (<200) donc OK en mémoire.
  if (city) {
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    let allOffers = (data ?? []) as any[];
    const lowerCity = city.toLowerCase();
    allOffers = allOffers.filter((o: any) => {
      const estCity = o.establishments?.city;
      return typeof estCity === "string" && estCity.toLowerCase().includes(lowerCity);
    });

    const total = allOffers.length;
    const offers = allOffers.slice(offset, offset + perPage);
    return res.json({ offers, total, page, per_page: perPage });
  }

  // Sans filtre ville : pagination côté DB
  query = query.range(offset, offset + perPage - 1);
  const { data, count, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ offers: data ?? [], total: count ?? 0, page, per_page: perPage });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// GET /api/public/ramadan-offers/:id — Détail offre publique
// ---------------------------------------------------------------------------
router.get("/:id", (async (req, res) => {
  const offerId = req.params.id;
  if (!offerId || !isValidUUID(offerId)) return res.status(400).json({ error: "ID invalide." });

  const supabase = getAdminSupabase();

  const { data: offer, error } = await supabase
    .from("ramadan_offers")
    .select("*, establishments(id, name, slug, city, cover_url, logo_url, universe, address, phone, description)")
    .eq("id", offerId)
    .eq("moderation_status", "active")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!offer) return res.status(404).json({ error: "Offre introuvable ou non active." });

  // Compteur de réservations (pour afficher le taux de remplissage)
  const { count: reservationCount } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("ramadan_offer_id", offerId)
    .in("status", ["confirmed", "seated", "pending"]);

  return res.json({
    offer: {
      ...offer,
      reservation_count: reservationCount ?? 0,
    },
  });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// POST /api/public/ramadan-offers/:id/track — Tracker impression/click
// ---------------------------------------------------------------------------
router.post("/:id/track", (async (req, res) => {
  const offerId = req.params.id;
  if (!offerId || !isValidUUID(offerId)) return res.status(400).json({ error: "ID invalide." });

  const eventType = typeof req.body?.event_type === "string" ? req.body.event_type.trim() : "";
  if (!["impression", "click"].includes(eventType)) {
    return res.status(400).json({ error: "event_type must be 'impression' or 'click'." });
  }

  const visitorId = computeVisitorId(req);
  const supabase = getAdminSupabase();

  // Fire-and-forget : on ne bloque pas la réponse
  void supabase
    .from("ramadan_offer_views")
    .insert({ offer_id: offerId, event_type: eventType, visitor_id: visitorId })
    .then(({ error }) => {
      if (error) log.error({ err: error.message }, "Track insert error");
    });

  return res.json({ ok: true });
}) as RequestHandler);

// ---------------------------------------------------------------------------
// GET /api/public/establishments/:id/ramadan-offers — Offres d'un établissement
// ---------------------------------------------------------------------------
router.get("/establishment/:id", (async (req, res) => {
  const establishmentId = req.params.id;
  if (!establishmentId || !isValidUUID(establishmentId)) {
    return res.status(400).json({ error: "ID invalide." });
  }

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("ramadan_offers")
    .select("*")
    .eq("establishment_id", establishmentId)
    .eq("moderation_status", "active")
    .order("type", { ascending: true })
    .order("price", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  return res.json({ offers: data ?? [] });
}) as RequestHandler);

export default router;
