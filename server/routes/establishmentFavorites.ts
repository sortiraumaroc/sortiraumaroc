/**
 * Establishment Favorites — CRUD favoris d'établissements
 *
 * Endpoints :
 *   POST   /api/consumer/establishments/:id/favorite     — toggle favori
 *   GET    /api/consumer/me/favorite-establishments       — mes favoris (paginé)
 *   GET    /api/consumer/establishments/:id/is-favorite   — vérifier si favori
 *   GET    /api/consumer/me/favorite-ids                  — IDs de tous mes favoris (sync mobile)
 */
import type { Express, RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";
import { zQuery, zParams } from "../lib/validate";
import {
  EstablishmentFavoriteParams,
  FavoriteEstablishmentsQuery,
  CheckFavoriteParams,
} from "../schemas/establishmentFavorites";

const log = createModuleLogger("establishment-favorites");

// ============================================================================
// HELPERS
// ============================================================================

function safeInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

/** Extract authenticated userId from Bearer token */
async function getAuthUserId(req: { header: (name: string) => string | undefined }): Promise<string | null> {
  const authHeader = req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// ============================================================================
// TOGGLE FAVORITE
// ============================================================================

/** POST /api/consumer/establishments/:id/favorite — toggle favorite */
const toggleFavorite: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const establishmentId = req.params.id;
    const supabase = getAdminSupabase();

    // Vérifier que l'établissement existe
    const { data: estab } = await supabase
      .from("establishments")
      .select("id")
      .eq("id", establishmentId)
      .maybeSingle();

    if (!estab) {
      res.status(404).json({ error: "Établissement introuvable" });
      return;
    }

    // Vérifier si déjà en favori
    const { data: existing } = await supabase
      .from("establishment_favorites")
      .select("id")
      .eq("establishment_id", establishmentId)
      .eq("user_id", userId)
      .maybeSingle();

    let favorited: boolean;

    if (existing) {
      // Retirer des favoris
      await supabase.from("establishment_favorites").delete().eq("id", existing.id);
      favorited = false;
    } else {
      // Ajouter aux favoris
      await supabase.from("establishment_favorites").insert({
        establishment_id: establishmentId,
        user_id: userId,
      });
      favorited = true;
    }

    res.json({ favorited });
  } catch (err) {
    log.error({ err }, "toggleFavorite error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// GET MY FAVORITES (paginated, with establishment details)
// ============================================================================

/** GET /api/consumer/me/favorite-establishments — paginated list */
const getMyFavorites: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const page = safeInt(req.query.page, 1);
    const pageSize = safeInt(req.query.pageSize, 20);
    const offset = (page - 1) * pageSize;

    const supabase = getAdminSupabase();

    // Récupérer les IDs favoris (paginés, par date décroissante)
    const { data: favs, error: favsError, count } = await supabase
      .from("establishment_favorites")
      .select("establishment_id, created_at", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (favsError) {
      log.error({ err: favsError }, "getMyFavorites query failed");
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    const estabIds = (favs ?? []).map((f: any) => f.establishment_id);

    if (estabIds.length === 0) {
      res.json({ items: [], total: 0, page, pageSize, hasMore: false });
      return;
    }

    // Récupérer les détails des établissements
    const { data: establishments } = await supabase
      .from("establishments")
      .select(`
        id,
        name,
        slug,
        description,
        city,
        address,
        phone,
        cuisine_type,
        price_range,
        cover_image_url,
        logo_url,
        latitude,
        longitude,
        average_rating,
        total_reviews,
        status
      `)
      .in("id", estabIds)
      .eq("status", "active");

    // Garder l'ordre de la liste de favoris
    const estabMap = new Map((establishments ?? []).map((e: any) => [e.id, e]));
    const orderedItems = estabIds
      .map((id: string) => estabMap.get(id))
      .filter(Boolean);

    res.json({
      items: orderedItems,
      total: count ?? 0,
      page,
      pageSize,
      hasMore: offset + pageSize < (count ?? 0),
    });
  } catch (err) {
    log.error({ err }, "getMyFavorites error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// CHECK IF FAVORITE
// ============================================================================

/** GET /api/consumer/establishments/:id/is-favorite */
const checkIsFavorite: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const establishmentId = req.params.id;
    const supabase = getAdminSupabase();

    const { data: existing } = await supabase
      .from("establishment_favorites")
      .select("id")
      .eq("establishment_id", establishmentId)
      .eq("user_id", userId)
      .maybeSingle();

    res.json({ favorited: !!existing });
  } catch (err) {
    log.error({ err }, "checkIsFavorite error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// GET ALL FAVORITE IDS (for mobile sync)
// ============================================================================

/** GET /api/consumer/me/favorite-ids — all favorite establishment IDs */
const getMyFavoriteIds: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const supabase = getAdminSupabase();

    const { data: favs, error } = await supabase
      .from("establishment_favorites")
      .select("establishment_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      log.error({ err: error }, "getMyFavoriteIds query failed");
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    const ids = (favs ?? []).map((f: any) => f.establishment_id);
    res.json({ ids });
  } catch (err) {
    log.error({ err }, "getMyFavoriteIds error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// REGISTER
// ============================================================================

export function registerEstablishmentFavoritesRoutes(app: Express) {
  // Toggle favori
  app.post(
    "/api/consumer/establishments/:id/favorite",
    zParams(EstablishmentFavoriteParams),
    toggleFavorite,
  );

  // Mes favoris (paginé, avec détails)
  app.get(
    "/api/consumer/me/favorite-establishments",
    zQuery(FavoriteEstablishmentsQuery),
    getMyFavorites,
  );

  // Vérifier si un établissement est favori
  app.get(
    "/api/consumer/establishments/:id/is-favorite",
    zParams(CheckFavoriteParams),
    checkIsFavorite,
  );

  // Tous mes IDs favoris (sync mobile rapide)
  app.get(
    "/api/consumer/me/favorite-ids",
    getMyFavoriteIds,
  );

  log.info("Establishment favorites routes registered");
}
