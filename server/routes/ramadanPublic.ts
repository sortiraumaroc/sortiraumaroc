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
import { cacheMiddleware, buildCacheKey } from "../lib/cache";
import { resolveEstablishmentId } from "./publicHelpers";

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

/** Shuffle Fisher-Yates (in-place) */
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
router.get("/", cacheMiddleware(120, (req) =>
  buildCacheKey("ramadan-offers", {
    type: String(req.query.type ?? ""),
    city: String(req.query.city ?? ""),
    featured: String(req.query.featured ?? ""),
    min_price: String(req.query.min_price ?? ""),
    max_price: String(req.query.max_price ?? ""),
    limit: String(req.query.limit ?? ""),
    offset: String(req.query.offset ?? ""),
  }),
), (async (req, res) => {
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

  // 1. Ramadan offers classiques
  let query = supabase
    .from("ramadan_offers")
    .select("*, establishments(id, name, slug, city, cover_url, logo_url, universe)", { count: "exact" })
    .eq("moderation_status", "active");

  if (type) query = query.eq("type", type);
  if (featured) query = query.eq("is_featured", true);
  if (minPrice !== undefined) query = query.gte("price", minPrice);
  if (maxPrice !== undefined) query = query.lte("price", maxPrice);

  // 2. Ftour slots actifs (groupés par établissement → carte homepage)
  //    Seulement si pas de filtre type OU type === 'ftour'
  let ftourOffers: any[] = [];
  if (!type || type === "ftour") {
    const { data: slotsData } = await supabase
      .from("pro_slots")
      .select("*, establishments!inner(id, name, slug, city, cover_url, logo_url, universe)")
      .eq("service_label", "Ftour")
      .eq("moderation_status", "active")
      .order("starts_at", { ascending: true })
      .limit(500);

    if (slotsData?.length) {
      // Grouper par établissement
      const byEstab = new Map<string, any[]>();
      for (const s of slotsData as any[]) {
        const eid = s.establishment_id;
        if (!byEstab.has(eid)) byEstab.set(eid, []);
        byEstab.get(eid)!.push(s);
      }

      for (const [estabId, slots] of byEstab) {
        const first = slots[0];
        const last = slots[slots.length - 1];
        // Construire les time_slots à partir du premier slot
        const startTime = new Date(first.starts_at);
        const endTime = first.ends_at ? new Date(first.ends_at) : new Date(startTime.getTime() + 180 * 60000);
        const timeSlots = [{
          start: `${String(startTime.getHours()).padStart(2, "0")}:${String(startTime.getMinutes()).padStart(2, "0")}`,
          end: `${String(endTime.getHours()).padStart(2, "0")}:${String(endTime.getMinutes()).padStart(2, "0")}`,
          label: "Ftour",
        }];

        ftourOffers.push({
          id: `ftour_${estabId}`,
          establishment_id: estabId,
          title: `Ftour — ${first.establishments?.name ?? ""}`,
          type: "ftour",
          price: first.base_price ?? 0,
          price_type: first.price_type ?? (first.base_price && first.base_price > 0 ? "fixed" : "nc"),
          original_price: null,
          currency: "MAD",
          cover_url: first.cover_url,
          capacity_per_slot: first.capacity ?? 30,
          slot_interval_minutes: 30,
          time_slots: timeSlots,
          photos: first.cover_url ? [first.cover_url] : [],
          conditions_fr: null,
          conditions_ar: null,
          description_fr: null,
          description_ar: null,
          moderation_status: "active",
          is_featured: !!(first as any).is_featured,
          valid_from: first.starts_at?.split("T")[0] ?? null,
          valid_to: last.starts_at?.split("T")[0] ?? null,
          created_at: first.created_at,
          updated_at: first.updated_at,
          establishments: first.establishments,
        });
      }
    }
  }

  // Tri — pour "featured" (défaut), on shuffle pour varier l'ordre à chaque visite
  const isRandomSort = sort === "featured" || !["price_asc", "price_desc", "newest"].includes(sort);

  if (!isRandomSort) {
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
    }
  }

  // Pour le tri aléatoire ou le filtre ville, on récupère tout en mémoire
  // Le volume d'offres Ramadan actives est faible (<200) donc OK.
  if (isRandomSort || city) {
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    let allOffers = (data ?? []) as any[];

    // Dédupliquer : ne pas inclure de ftour group si un ramadan_offer existe déjà pour cet établissement
    const existingEstabIds = new Set(allOffers.map((o: any) => o.establishment_id));
    const uniqueFtour = ftourOffers.filter((f) => !existingEstabIds.has(f.establishment_id));
    allOffers = [...allOffers, ...uniqueFtour];

    // Filtre ville en mémoire
    if (city) {
      const lowerCity = city.toLowerCase();
      allOffers = allOffers.filter((o: any) => {
        const estCity = o.establishments?.city;
        return typeof estCity === "string" && estCity.toLowerCase().includes(lowerCity);
      });
    }

    // Filtre type "ftour" (les ftour slots sont déjà ajoutés)
    // Les filtres min/max price ne s'appliquent pas aux ftour slots ici (déjà filtrés côté DB pour ramadan_offers)

    // Shuffle aléatoire : featured en premier (mélangés), puis le reste (mélangé)
    if (isRandomSort) {
      const featuredOffers = allOffers.filter((o: any) => o.is_featured);
      const regularOffers = allOffers.filter((o: any) => !o.is_featured);
      allOffers = [...shuffleArray(featuredOffers), ...shuffleArray(regularOffers)];
    }

    const total = allOffers.length;
    const offers = allOffers.slice(offset, offset + perPage);
    return res.json({ offers, total, page, per_page: perPage });
  }

  // Sans tri aléatoire et sans filtre ville : pagination côté DB
  query = query.range(offset, offset + perPage - 1);
  const { data, count, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // Ajouter les ftour groups dédupliqués
  const existingEstabIds = new Set((data ?? []).map((o: any) => o.establishment_id));
  const uniqueFtour = ftourOffers.filter((f) => !existingEstabIds.has(f.establishment_id));
  const combined = [...(data ?? []), ...uniqueFtour];

  return res.json({ offers: combined, total: (count ?? 0) + uniqueFtour.length, page, per_page: perPage });
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
  const ref = req.params.id;
  if (!ref) return res.status(400).json({ error: "ID invalide." });

  const establishmentId = await resolveEstablishmentId({ ref });
  if (!establishmentId) return res.status(404).json({ error: "Établissement introuvable." });

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
