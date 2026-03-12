/**
 * Menu Item Votes Routes
 *
 * Like/dislike system for menu items (pro_inventory_items).
 * Authenticated users can vote; stats are public.
 * Items with ≥5 votes and ≥70% likes get "Coup de cœur des abonnés" badge.
 *
 * Endpoints:
 *   POST /api/consumer/menu-items/:itemId/vote       — Toggle vote (auth required)
 *   GET  /api/public/menu-items/:itemId/votes         — Get vote stats (public)
 *   GET  /api/public/establishments/:estId/menu-votes  — Batch vote stats (public)
 *   GET  /api/consumer/establishments/:estId/my-menu-votes — My votes (auth required)
 */

import type { RequestHandler } from "express";
import type { Express } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { zBody, zParams } from "../lib/validate";
import {
  menuItemVoteBody,
  menuItemIdParams,
  establishmentIdParams,
} from "../schemas/menuItemVotes";
import { getClientIp } from "../middleware/rateLimiter";
import { createModuleLogger } from "../lib/logger";
import { parseBearerToken } from "./proHelpers";

const log = createModuleLogger("menuItemVotes");

// =============================================================================
// Constants
// =============================================================================

const FAVORITE_MIN_VOTES = 5;
const FAVORITE_MIN_LIKE_RATIO = 0.7; // 70%

// =============================================================================
// Anti-fraud: Menu vote burst detection (in-memory)
// =============================================================================

const menuVoteTracker = new Map<
  string,
  { itemIds: Set<string>; estVotes: Map<string, number>; resetAt: number }
>();

// Cleanup every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of menuVoteTracker.entries()) {
    if (entry.resetAt <= now) menuVoteTracker.delete(key);
  }
}, 10 * 60 * 1000);

const MAX_MENU_VOTES_PER_EST_WINDOW = 20; // 20 votes per establishment per 30min

function checkMenuVoteBurst(
  ip: string,
  itemId: string,
  establishmentId: string,
): string | null {
  const now = Date.now();
  const windowMs = 30 * 60 * 1000; // 30 minutes

  let entry = menuVoteTracker.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = {
      itemIds: new Set(),
      estVotes: new Map(),
      resetAt: now + windowMs,
    };
    menuVoteTracker.set(ip, entry);
  }

  entry.itemIds.add(itemId);

  const estCount = (entry.estVotes.get(establishmentId) ?? 0) + 1;
  entry.estVotes.set(establishmentId, estCount);

  if (estCount > MAX_MENU_VOTES_PER_EST_WINDOW) {
    return "Vous avez voté trop souvent sur les plats de cet établissement. Veuillez patienter.";
  }

  return null;
}

// =============================================================================
// Auth helper
// =============================================================================

async function getUserFromBearerToken(
  token: string,
): Promise<
  | { ok: true; user: { id: string; email?: string | null } }
  | { ok: false; error: string; status: number }
> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return { ok: false, status: 401, error: error.message };
  if (!data.user) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true, user: { id: data.user.id, email: data.user.email } };
}

// =============================================================================
// Helper: compute isFavorite
// =============================================================================

function computeIsFavorite(likes: number, dislikes: number): boolean {
  const total = likes + dislikes;
  if (total < FAVORITE_MIN_VOTES) return false;
  return likes / total >= FAVORITE_MIN_LIKE_RATIO;
}

// =============================================================================
// POST /api/consumer/menu-items/:itemId/vote
// Toggle vote on a menu item. Same vote → remove. Different vote → update.
// =============================================================================

export const voteMenuItem: RequestHandler = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { vote } = req.body as { vote: "like" | "dislike" };

    // 1. Auth
    const token = parseBearerToken(req.header("authorization") ?? undefined);
    if (!token) {
      return res.status(401).json({ ok: false, error: "Connectez-vous pour voter" });
    }
    const userResult = await getUserFromBearerToken(token);
    if (!userResult.ok) {
      return res.status(userResult.status).json({ ok: false, error: userResult.error });
    }
    const userId = userResult.user.id;

    const supabase = getAdminSupabase();

    // 2. Verify item exists and get establishment_id
    const { data: item } = await supabase
      .from("pro_inventory_items")
      .select("id, establishment_id")
      .eq("id", itemId)
      .single();

    if (!item) {
      return res.status(404).json({ ok: false, error: "Plat introuvable" });
    }

    // 3. Anti-fraud: vote-burst detection
    const ip = getClientIp(req);
    const burstErr = checkMenuVoteBurst(ip, itemId, item.establishment_id);
    if (burstErr) {
      log.warn({ ip, itemId, establishmentId: item.establishment_id }, "Menu vote burst detected");
      return res.status(429).json({ ok: false, error: burstErr });
    }

    // 4. Check existing vote
    const { data: existing } = await supabase
      .from("menu_item_votes")
      .select("id, vote")
      .eq("item_id", itemId)
      .eq("user_id", userId)
      .single();

    if (existing) {
      if (existing.vote === vote) {
        // Same vote → remove (toggle off)
        await supabase.from("menu_item_votes").delete().eq("id", existing.id);
        return res.json({ ok: true, action: "removed", vote: null });
      }
      // Different vote → update
      await supabase
        .from("menu_item_votes")
        .update({ vote, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      return res.json({ ok: true, action: "updated", vote });
    }

    // 5. New vote → insert
    const { error: insertErr } = await supabase
      .from("menu_item_votes")
      .insert({
        item_id: itemId,
        establishment_id: item.establishment_id,
        user_id: userId,
        vote,
      });

    if (insertErr) {
      log.error({ err: insertErr }, "Menu vote insert error");
      return res.status(500).json({ ok: false, error: "Erreur lors du vote" });
    }

    return res.json({ ok: true, action: "created", vote });
  } catch (err) {
    log.error({ err }, "Menu vote exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// =============================================================================
// GET /api/public/menu-items/:itemId/votes
// Public: vote stats for a single item
// =============================================================================

export const getMenuItemVotes: RequestHandler = async (req, res) => {
  try {
    const { itemId } = req.params;
    const supabase = getAdminSupabase();

    const { data: votes, error } = await supabase
      .from("menu_item_votes")
      .select("vote")
      .eq("item_id", itemId);

    if (error) {
      log.error({ err: error }, "Error fetching menu item votes");
      return res.status(500).json({ ok: false, error: "Erreur serveur" });
    }

    const likes = votes?.filter((v) => v.vote === "like").length ?? 0;
    const dislikes = votes?.filter((v) => v.vote === "dislike").length ?? 0;

    return res.json({
      ok: true,
      likes,
      dislikes,
      isFavorite: computeIsFavorite(likes, dislikes),
    });
  } catch (err) {
    log.error({ err }, "getMenuItemVotes exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// =============================================================================
// GET /api/public/establishments/:estId/menu-votes
// Public: batch vote stats for ALL items of an establishment
// =============================================================================

export const getEstablishmentMenuVotes: RequestHandler = async (req, res) => {
  try {
    const { estId } = req.params;
    const supabase = getAdminSupabase();

    const { data: votes, error } = await supabase
      .from("menu_item_votes")
      .select("item_id, vote")
      .eq("establishment_id", estId);

    if (error) {
      log.error({ err: error }, "Error fetching establishment menu votes");
      return res.status(500).json({ ok: false, error: "Erreur serveur" });
    }

    // Group by item_id
    const statsMap: Record<string, { likes: number; dislikes: number; isFavorite: boolean }> = {};
    for (const v of votes ?? []) {
      if (!statsMap[v.item_id]) {
        statsMap[v.item_id] = { likes: 0, dislikes: 0, isFavorite: false };
      }
      if (v.vote === "like") statsMap[v.item_id].likes++;
      else statsMap[v.item_id].dislikes++;
    }

    // Compute isFavorite for each
    for (const id of Object.keys(statsMap)) {
      const s = statsMap[id];
      s.isFavorite = computeIsFavorite(s.likes, s.dislikes);
    }

    return res.json({ ok: true, votes: statsMap });
  } catch (err) {
    log.error({ err }, "getEstablishmentMenuVotes exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// =============================================================================
// GET /api/consumer/establishments/:estId/my-menu-votes
// Auth required: get the current user's votes for all items of an establishment
// =============================================================================

export const getMyMenuVotes: RequestHandler = async (req, res) => {
  try {
    const { estId } = req.params;

    // Auth
    const token = parseBearerToken(req.header("authorization") ?? undefined);
    if (!token) {
      return res.status(401).json({ ok: false, error: "Non authentifié" });
    }
    const userResult = await getUserFromBearerToken(token);
    if (!userResult.ok) {
      return res.status(userResult.status).json({ ok: false, error: userResult.error });
    }

    const supabase = getAdminSupabase();
    const { data: votes, error } = await supabase
      .from("menu_item_votes")
      .select("item_id, vote")
      .eq("establishment_id", estId)
      .eq("user_id", userResult.user.id);

    if (error) {
      log.error({ err: error }, "Error fetching user menu votes");
      return res.status(500).json({ ok: false, error: "Erreur serveur" });
    }

    const myVotes: Record<string, "like" | "dislike"> = {};
    for (const v of votes ?? []) {
      myVotes[v.item_id] = v.vote as "like" | "dislike";
    }

    return res.json({ ok: true, votes: myVotes });
  } catch (err) {
    log.error({ err }, "getMyMenuVotes exception");
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }
};

// =============================================================================
// Route registration
// =============================================================================

export function registerMenuItemVoteRoutes(app: Express) {
  // Consumer (auth required)
  app.post(
    "/api/consumer/menu-items/:itemId/vote",
    zParams(menuItemIdParams),
    zBody(menuItemVoteBody),
    voteMenuItem,
  );
  app.get(
    "/api/consumer/establishments/:estId/my-menu-votes",
    zParams(establishmentIdParams),
    getMyMenuVotes,
  );

  // Public
  app.get(
    "/api/public/menu-items/:itemId/votes",
    zParams(menuItemIdParams),
    getMenuItemVotes,
  );
  app.get(
    "/api/public/establishments/:estId/menu-votes",
    zParams(establishmentIdParams),
    getEstablishmentMenuVotes,
  );
}
