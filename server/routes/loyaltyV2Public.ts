/**
 * Loyalty V2 — Public (Consumer) Routes
 *
 * 5 endpoints client :
 * - GET  /api/me/loyalty               — mes cartes de fidélité (V2)
 * - GET  /api/me/loyalty/:cardId        — détail d'une carte
 * - GET  /api/me/loyalty/rewards        — mes cadeaux fidélité
 * - GET  /api/me/gifts                  — mes cadeaux sam.ma
 * - GET  /api/establishments/:id/loyalty — info programme fidélité (public)
 * - POST /api/gifts/:giftId/claim       — récupérer un cadeau sam.ma (premier arrivé)
 * - GET  /api/gifts/available           — cadeaux sam.ma disponibles (public)
 */

import type { Router, Request, Response } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { isLoyalCustomer } from "../loyaltyV2Logic";
import {
  getMyPlatformGifts,
  claimPublicGift,
  listPublicGifts,
} from "../platformGiftLogic";
import {
  loyaltyReadRateLimiter,
  loyaltyGiftClaimRateLimiter,
  getClientIp,
} from "../middleware/rateLimiter";
import { isValidUUID } from "../sanitizeV2";
import { auditClientAction } from "../auditLogV2";

// =============================================================================
// Auth helper (same pattern as reservationV2Public.ts)
// =============================================================================

type ConsumerAuthOk = { ok: true; userId: string };
type ConsumerAuthErr = { ok: false; status: number; error: string };
type ConsumerAuthResult = ConsumerAuthOk | ConsumerAuthErr;

async function getConsumerUserId(req: Request): Promise<ConsumerAuthResult> {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, error: "missing_token" };

  const supabase = getAdminSupabase();
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return { ok: false, status: 401, error: "unauthorized" };
    return { ok: true, userId: data.user.id };
  } catch {
    return { ok: false, status: 401, error: "unauthorized" };
  }
}

function requireAuth(
  authResult: ConsumerAuthResult,
  res: Response,
): authResult is ConsumerAuthOk {
  if (authResult.ok === false) {
    res.status(authResult.status).json({ error: authResult.error });
    return false;
  }
  return true;
}

// =============================================================================
// 1. GET /api/me/loyalty — Mes cartes de fidélité (V2, enrichi)
// =============================================================================

async function getMyLoyalty(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const supabase = getAdminSupabase();

    // Cartes avec programme + établissement + tampons
    const { data: cards, error } = await supabase
      .from("loyalty_cards")
      .select(`
        *,
        program:loyalty_programs(*),
        establishment:establishments(id, name, slug, universe, logo_url, cover_url, city),
        stamps:loyalty_stamps(*)
      `)
      .eq("user_id", auth.userId)
      .order("last_stamp_at", { ascending: false, nullsFirst: false });

    if (error) return res.status(500).json({ error: error.message });

    // Cadeaux fidélité actifs
    const { data: rewards } = await supabase
      .from("loyalty_rewards")
      .select(`
        *,
        program:loyalty_programs(*),
        establishment:establishments(id, name, slug, universe, city)
      `)
      .eq("user_id", auth.userId)
      .eq("status", "active");

    // Séparer par statut
    const activeCards = (cards ?? []).filter(
      (c) => c.status === "active" || c.status === "completed" || c.status === "reward_pending"
    );
    const completedCards = (cards ?? []).filter(
      (c) => c.status === "reward_used" || c.status === "expired"
    );
    const frozenCards = (cards ?? []).filter((c) => c.status === "frozen");

    res.json({
      ok: true,
      active_cards: activeCards,
      completed_cards: completedCards,
      frozen_cards: frozenCards,
      pending_rewards: rewards ?? [],
    });
  } catch (err) {
    console.error("[getMyLoyalty] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 2. GET /api/me/loyalty/:cardId — Détail d'une carte
// =============================================================================

async function getMyLoyaltyCard(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const cardId = req.params.cardId;
    if (!cardId || !isValidUUID(cardId)) return res.status(400).json({ error: "Invalid cardId" });

    const supabase = getAdminSupabase();

    const { data: card, error } = await supabase
      .from("loyalty_cards")
      .select(`
        *,
        program:loyalty_programs(*),
        establishment:establishments(id, name, slug, logo_url, cover_url, city, address),
        stamps:loyalty_stamps(*)
      `)
      .eq("id", cardId)
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!card) return res.status(404).json({ error: "Card not found" });

    // Reward actif
    const { data: reward } = await supabase
      .from("loyalty_rewards")
      .select("*")
      .eq("card_id", cardId)
      .eq("status", "active")
      .maybeSingle();

    // Carte précédente si renouvelée
    let previousCard = null;
    if (card.previous_card_id) {
      const { data } = await supabase
        .from("loyalty_cards")
        .select("id, stamps_count, completed_at, reward_claimed_at, cycle_number")
        .eq("id", card.previous_card_id)
        .maybeSingle();
      previousCard = data;
    }

    // Badge client fidèle
    const isLoyal = await isLoyalCustomer(auth.userId, card.establishment_id);

    res.json({
      ok: true,
      card: {
        ...card,
        active_reward: reward ?? null,
        previous_card: previousCard,
        is_loyal_customer: isLoyal,
      },
    });
  } catch (err) {
    console.error("[getMyLoyaltyCard] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 3. GET /api/me/loyalty/rewards — Mes cadeaux fidélité
// =============================================================================

async function getMyLoyaltyRewards(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const supabase = getAdminSupabase();

    const { data: rewards, error } = await supabase
      .from("loyalty_rewards")
      .select(`
        *,
        program:loyalty_programs(*),
        establishment:establishments(id, name, slug, universe, city)
      `)
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const active = (rewards ?? []).filter((r) => r.status === "active");
    const used = (rewards ?? []).filter((r) => r.status === "used");
    const expired = (rewards ?? []).filter((r) => r.status === "expired");

    res.json({ ok: true, active, used, expired });
  } catch (err) {
    console.error("[getMyLoyaltyRewards] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 4. GET /api/me/gifts — Mes cadeaux sam.ma
// =============================================================================

async function getMyGifts(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const result = await getMyPlatformGifts(auth.userId);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[getMyGifts] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 5. GET /api/establishments/:id/loyalty — Info programme fidélité (public)
// =============================================================================

async function getEstablishmentLoyalty(req: Request, res: Response) {
  try {
    const establishmentId = req.params.id;
    if (!establishmentId || !isValidUUID(establishmentId)) return res.status(400).json({ error: "Invalid establishment id" });

    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("loyalty_programs")
      .select(`
        id, name, description, stamps_required, reward_description, reward_type, reward_value,
        card_design, conditions, stamp_frequency, stamp_conditional, stamp_minimum_amount,
        stamp_minimum_currency, card_validity_days, reward_validity_days, is_renewable
      `)
      .eq("establishment_id", establishmentId)
      .eq("is_active", true)
      .eq("status", "active");

    if (error) return res.status(500).json({ error: error.message });

    // Si client connecté, récupérer ses cartes pour cet établissement
    let myCards = null;
    const auth = await getConsumerUserId(req);
    if (auth.ok) {
      const { data: cards } = await supabase
        .from("loyalty_cards")
        .select("id, program_id, stamps_count, status, started_at, expires_at")
        .eq("user_id", auth.userId)
        .eq("establishment_id", establishmentId)
        .in("status", ["active", "completed", "reward_pending"]);
      myCards = cards;
    }

    res.json({ ok: true, programs: data ?? [], my_cards: myCards });
  } catch (err) {
    console.error("[getEstablishmentLoyalty] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 6. POST /api/gifts/:giftId/claim — Récupérer un cadeau sam.ma (premier arrivé)
// =============================================================================

async function claimGift(req: Request, res: Response) {
  try {
    const auth = await getConsumerUserId(req);
    if (!requireAuth(auth, res)) return;

    const giftId = req.params.giftId;
    if (!giftId || !isValidUUID(giftId)) return res.status(400).json({ error: "Invalid giftId" });

    const result = await claimPublicGift({ giftId, userId: auth.userId });

    if (result.ok) {
      void auditClientAction("client.loyalty.claim_gift", {
        userId: auth.userId,
        targetType: "platform_gift",
        targetId: giftId,
        ip: getClientIp(req),
      });
    }

    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    console.error("[claimGift] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// 7. GET /api/gifts/available — Cadeaux sam.ma disponibles (public)
// =============================================================================

async function getAvailableGifts(_req: Request, res: Response) {
  try {
    const gifts = await listPublicGifts();
    res.json({ ok: true, gifts });
  } catch (err) {
    console.error("[getAvailableGifts] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// Route registration
// =============================================================================

export function registerLoyaltyV2PublicRoutes(app: Router): void {
  // Client (auth required) — rate limited reads
  app.get("/api/me/loyalty", loyaltyReadRateLimiter, getMyLoyalty);
  app.get("/api/me/loyalty/rewards", loyaltyReadRateLimiter, getMyLoyaltyRewards);
  app.get("/api/me/loyalty/:cardId", loyaltyReadRateLimiter, getMyLoyaltyCard);
  app.get("/api/me/gifts", loyaltyReadRateLimiter, getMyGifts);
  app.post("/api/gifts/:giftId/claim", loyaltyGiftClaimRateLimiter, claimGift);

  // Public — rate limited reads
  app.get("/api/establishments/:id/loyalty", loyaltyReadRateLimiter, getEstablishmentLoyalty);
  app.get("/api/gifts/available", loyaltyReadRateLimiter, getAvailableGifts);
}
