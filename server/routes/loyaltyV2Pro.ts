/**
 * Loyalty V2 — Pro Routes
 *
 * 14 endpoints pro :
 * - Programme fidélité : config, stats, activate/deactivate
 * - Base de données clients fidèles
 * - Scan QR : résultat unifié fidélité
 * - Tampon conditionnel : confirmation manuelle
 * - Consommation cadeau fidélité
 * - Consommation cadeau sam.ma
 * - Offrir des cadeaux à sam.ma
 */

import type { Router, RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import {
  validateConditionalStamp,
  claimLoyaltyReward,
  getLoyaltyInfoForScan,
  updateProgramStatus,
} from "../loyaltyV2Logic";
import {
  offerPlatformGift,
  consumePlatformGift,
  getProOfferedGifts,
} from "../platformGiftLogic";
import {
  alertProgramCreated,
  detectHighValueReward,
  detectSuspiciousStamping,
} from "../loyaltyFraudDetection";
import type { LoyaltyProgramStatus, PlatformGiftType } from "../../shared/loyaltyTypesV2";
import {
  loyaltyProActionRateLimiter,
  loyaltyScanRateLimiter,
  loyaltyStampRateLimiter,
  loyaltyConsumeRateLimiter,
  loyaltyGiftOfferRateLimiter,
  loyaltyReadRateLimiter,
  getClientIp,
} from "../middleware/rateLimiter";
import { isValidUUID, sanitizeText, sanitizePlain } from "../sanitizeV2";
import { auditProAction } from "../auditLogV2";

// =============================================================================
// Auth helpers (same pattern as reservationV2Pro.ts)
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

function getEstablishmentId(req: Parameters<RequestHandler>[0]): string {
  return (
    String(req.params.establishmentId ?? "") ||
    String(req.query.establishment_id ?? "") ||
    String(req.headers["x-establishment-id"] ?? "") ||
    String((req.body as Record<string, unknown>)?.establishment_id ?? "")
  ).trim();
}

async function getStaffName(userId: string): Promise<string | null> {
  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from("consumer_users")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.full_name ?? null;
}

// =============================================================================
// 1. GET /api/pro/loyalty — Mon programme de fidélité (config + stats V2)
// =============================================================================

const getProLoyaltyProgram: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const supabase = getAdminSupabase();

    const { data: programs } = await supabase
      .from("loyalty_programs")
      .select("*")
      .eq("establishment_id", estId)
      .order("created_at", { ascending: false });

    // Stats rapides
    const { data: cardStats } = await supabase
      .from("loyalty_cards")
      .select("status")
      .eq("establishment_id", estId);

    const activeCards = cardStats?.filter((c) => c.status === "active").length ?? 0;
    const completedCards = cardStats?.filter(
      (c) => c.status === "completed" || c.status === "reward_pending" || c.status === "reward_used"
    ).length ?? 0;
    const totalCards = cardStats?.length ?? 0;

    // Montant moyen conditionnel
    const { data: conditionalStamps } = await supabase
      .from("loyalty_stamps")
      .select("amount_spent")
      .eq("establishment_id", estId)
      .eq("stamp_type", "conditional_validated")
      .not("amount_spent", "is", null);

    const amounts = (conditionalStamps ?? [])
      .map((s) => s.amount_spent as number)
      .filter((a) => a > 0);
    const avgAmount = amounts.length > 0
      ? amounts.reduce((sum, a) => sum + a, 0) / amounts.length
      : null;

    res.json({
      ok: true,
      programs: programs ?? [],
      stats: {
        total_cards: totalCards,
        active_cards: activeCards,
        completed_cards: completedCards,
        completion_rate: totalCards > 0 ? completedCards / totalCards : 0,
        avg_conditional_amount: avgAmount,
      },
    });
  } catch (err) {
    console.error("[getProLoyaltyProgram] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 2. POST /api/pro/loyalty — Créer un programme (V2 avec champs conditionnel)
// =============================================================================

const createProLoyaltyProgram: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const body = req.body as Record<string, unknown>;
    const name = sanitizePlain(String(body.name ?? ""), 200);
    const rewardType = sanitizePlain(String(body.reward_type ?? ""), 100);
    const rewardDescription = sanitizeText(String(body.reward_description ?? ""), 500);
    const stampsRequired = Number(body.stamps_required ?? 10);

    if (!name || !rewardType || !rewardDescription) {
      return res.status(400).json({ error: "name, reward_type, reward_description required" });
    }

    const supabase = getAdminSupabase();

    const isRecord = (v: unknown): v is Record<string, unknown> =>
      typeof v === "object" && v !== null && !Array.isArray(v);

    const programData = {
      establishment_id: estId,
      name,
      description: body.description ? sanitizeText(String(body.description), 2000) : null,
      stamps_required: stampsRequired,
      reward_type: rewardType,
      reward_value: body.reward_value ? sanitizePlain(String(body.reward_value), 200) : null,
      reward_description: rewardDescription,
      reward_validity_days: Number(body.reward_validity_days ?? 30),
      conditions: body.conditions ? sanitizeText(String(body.conditions), 2000) : null,
      card_design: isRecord(body.card_design) ? body.card_design : {
        style: "gradient",
        primary_color: "#6366f1",
        secondary_color: "#8b5cf6",
        stamp_icon: "coffee",
        logo_url: null,
      },
      bonus_rules: isRecord(body.bonus_rules) ? body.bonus_rules : {
        birthday_bonus: false,
        birthday_multiplier: 2,
        happy_hour_bonus: false,
        happy_hour_start: "14:00",
        happy_hour_end: "17:00",
        happy_hour_multiplier: 2,
        sam_booking_bonus: true,
        sam_booking_extra_stamps: 1,
      },
      stamps_expire_after_days: Number(body.stamps_expire_after_days ?? 180),
      warn_expiration_days: Number(body.warn_expiration_days ?? 14),
      allow_retroactive_stamps: body.allow_retroactive_stamps === true,
      retroactive_from_date: body.retroactive_from_date ? String(body.retroactive_from_date) : null,
      is_active: true,
      status: "active" as const,
      // V2 fields
      stamp_frequency: String(body.stamp_frequency ?? "unlimited"),
      stamp_requires_reservation: body.stamp_requires_reservation === true,
      stamp_conditional: body.stamp_conditional === true,
      stamp_minimum_amount: body.stamp_conditional === true
        ? Number(body.stamp_minimum_amount ?? 0)
        : null,
      stamp_minimum_currency: String(body.stamp_minimum_currency ?? "MAD"),
      card_validity_days: body.card_validity_days ? Number(body.card_validity_days) : null,
      is_renewable: body.is_renewable !== false, // default true
    };

    const { data, error } = await supabase
      .from("loyalty_programs")
      .insert(programData)
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Audit log
    void auditProAction("pro.loyalty.create_program", {
      proUserId: user.id,
      targetType: "loyalty_program",
      targetId: data.id,
      details: { establishment_id: estId, name, stamps_required: stampsRequired },
      ip: getClientIp(req),
    });

    // Alertes
    void alertProgramCreated({
      programId: data.id,
      establishmentId: estId,
      programName: name,
      createdBy: user.id,
    });

    if (body.reward_value) {
      void detectHighValueReward({
        programId: data.id,
        establishmentId: estId,
        rewardDescription,
        rewardValue: String(body.reward_value),
      });
    }

    res.json({ ok: true, program: data });
  } catch (err) {
    console.error("[createProLoyaltyProgram] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 3. PUT /api/pro/loyalty/:programId — Modifier le programme
// =============================================================================

const updateProLoyaltyProgram: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const programId = req.params.programId ?? req.params.id;
    if (!programId || !isValidUUID(programId)) return res.status(400).json({ error: "Invalid programId" });

    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    // V1 fields
    const stringFields = [
      "name", "description", "reward_type", "reward_value",
      "reward_description", "conditions", "retroactive_from_date",
    ];
    for (const f of stringFields) {
      if (body[f] !== undefined) updates[f] = body[f] ? String(body[f]) : null;
    }
    const numberFields = [
      "stamps_required", "reward_validity_days",
      "stamps_expire_after_days", "warn_expiration_days",
    ];
    for (const f of numberFields) {
      if (body[f] !== undefined) updates[f] = Number(body[f]);
    }
    const boolFields = ["allow_retroactive_stamps"];
    for (const f of boolFields) {
      if (body[f] !== undefined) updates[f] = body[f] === true;
    }

    // V2 fields
    if (body.stamp_frequency !== undefined)
      updates.stamp_frequency = String(body.stamp_frequency);
    if (body.stamp_requires_reservation !== undefined)
      updates.stamp_requires_reservation = body.stamp_requires_reservation === true;
    if (body.stamp_conditional !== undefined) {
      updates.stamp_conditional = body.stamp_conditional === true;
      if (body.stamp_conditional === true) {
        updates.stamp_minimum_amount = Number(body.stamp_minimum_amount ?? 0);
      } else {
        updates.stamp_minimum_amount = null;
      }
    }
    if (body.stamp_minimum_currency !== undefined)
      updates.stamp_minimum_currency = String(body.stamp_minimum_currency);
    if (body.card_validity_days !== undefined)
      updates.card_validity_days = body.card_validity_days ? Number(body.card_validity_days) : null;
    if (body.is_renewable !== undefined)
      updates.is_renewable = body.is_renewable === true;

    // Design & rules
    const isRecord = (v: unknown): v is Record<string, unknown> =>
      typeof v === "object" && v !== null && !Array.isArray(v);
    if (isRecord(body.card_design)) updates.card_design = body.card_design;
    if (isRecord(body.bonus_rules)) updates.bonus_rules = body.bonus_rules;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("loyalty_programs")
      .update(updates)
      .eq("id", programId)
      .eq("establishment_id", estId)
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Program not found" });

    // Audit log
    void auditProAction("pro.loyalty.update_program", {
      proUserId: user.id,
      targetType: "loyalty_program",
      targetId: programId,
      details: { establishment_id: estId, updated_fields: Object.keys(updates) },
      ip: getClientIp(req),
    });

    // Détection haute valeur si reward_value changé
    if (body.reward_value) {
      void detectHighValueReward({
        programId: data.id,
        establishmentId: estId,
        rewardDescription: data.reward_description ?? "",
        rewardValue: String(body.reward_value),
      });
    }

    res.json({ ok: true, program: data });
  } catch (err) {
    console.error("[updateProLoyaltyProgram] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 4. POST /api/pro/loyalty/:programId/activate
// =============================================================================

const activateProgram: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const programId = req.params.programId ?? req.params.id;
    const result = await updateProgramStatus({
      programId,
      establishmentId: estId,
      newStatus: "active",
    });

    void auditProAction("pro.loyalty.activate_program", {
      proUserId: user.id,
      targetType: "loyalty_program",
      targetId: programId,
      details: { establishment_id: estId, unfrozen_cards: result.unfrozenCount ?? 0 },
      ip: getClientIp(req),
    });

    res.json({
      ok: result.ok,
      unfrozen_cards: result.unfrozenCount ?? 0,
      message: `Programme activé. ${result.unfrozenCount ?? 0} carte(s) dégelée(s).`,
    });
  } catch (err) {
    console.error("[activateProgram] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 5. POST /api/pro/loyalty/:programId/deactivate
// =============================================================================

const deactivateProgram: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const programId = req.params.programId ?? req.params.id;
    const result = await updateProgramStatus({
      programId,
      establishmentId: estId,
      newStatus: "inactive",
    });

    void auditProAction("pro.loyalty.deactivate_program", {
      proUserId: user.id,
      targetType: "loyalty_program",
      targetId: programId,
      details: { establishment_id: estId, frozen_cards: result.frozenCount ?? 0 },
      ip: getClientIp(req),
    });

    res.json({
      ok: result.ok,
      frozen_cards: result.frozenCount ?? 0,
      message: `Programme désactivé. ${result.frozenCount ?? 0} carte(s) gelée(s).`,
    });
  } catch (err) {
    console.error("[deactivateProgram] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 6. GET /api/pro/loyalty/stats — Statistiques détaillées
// =============================================================================

const getProLoyaltyStats: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const supabase = getAdminSupabase();

    // Cards par statut
    const { data: cards } = await supabase
      .from("loyalty_cards")
      .select("status, cycle_number")
      .eq("establishment_id", estId);

    const active = (cards ?? []).filter((c) => c.status === "active").length;
    const completed = (cards ?? []).filter(
      (c) => c.status === "completed" || c.status === "reward_pending"
    ).length;
    const rewardUsed = (cards ?? []).filter((c) => c.status === "reward_used").length;
    const total = cards?.length ?? 0;
    const renewals = (cards ?? []).filter((c) => c.cycle_number > 1).length;

    // Rewards ce mois
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count: rewardsThisMonth } = await supabase
      .from("loyalty_rewards")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", estId)
      .eq("status", "used")
      .gte("used_at", startOfMonth.toISOString());

    // Montant moyen conditionnel
    const { data: conditionalStamps } = await supabase
      .from("loyalty_stamps")
      .select("amount_spent")
      .eq("establishment_id", estId)
      .eq("stamp_type", "conditional_validated")
      .not("amount_spent", "is", null);

    const amounts = (conditionalStamps ?? [])
      .map((s) => s.amount_spent as number)
      .filter((a) => a > 0);

    res.json({
      ok: true,
      stats: {
        total_cards: total,
        active_cards: active,
        completed_cards: completed,
        reward_used_cards: rewardUsed,
        completion_rate: total > 0 ? (completed + rewardUsed) / total : 0,
        renewal_rate: total > 0 ? renewals / total : 0,
        rewards_this_month: rewardsThisMonth ?? 0,
        avg_conditional_amount: amounts.length > 0
          ? Math.round((amounts.reduce((s, a) => s + a, 0) / amounts.length) * 100) / 100
          : null,
        total_conditional_stamps: amounts.length,
      },
    });
  } catch (err) {
    console.error("[getProLoyaltyStats] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 7. GET /api/pro/loyalty/clients — Base de données clients fidèles
// =============================================================================

const getProLoyaltyClients: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const supabase = getAdminSupabase();
    const page = Math.max(1, Number(req.query.page ?? 1));
    const perPage = Math.min(Number(req.query.per_page ?? 50), 100);
    const offset = (page - 1) * perPage;
    const search = String(req.query.search ?? "").trim();

    // Fetch cards with user info
    const { data: cards } = await supabase
      .from("loyalty_cards")
      .select("*, program:loyalty_programs(id, name, stamps_required)")
      .eq("establishment_id", estId)
      .order("last_stamp_at", { ascending: false, nullsFirst: false })
      .range(offset, offset + perPage - 1);

    // Get unique user IDs
    const userIds = [...new Set((cards ?? []).map((c) => c.user_id))];

    // Fetch user names (minimal data — pas d'email/phone pour la confidentialité)
    const userMap = new Map<string, { id: string; full_name: string }>();
    if (userIds.length > 0) {
      let query = supabase
        .from("consumer_users")
        .select("id, full_name")
        .in("id", userIds);

      if (search) {
        query = query.ilike("full_name", `%${search}%`);
      }

      const { data: users } = await query;
      for (const u of users ?? []) {
        userMap.set(u.id, u);
      }
    }

    // Group by user
    const membersMap = new Map<string, {
      user_id: string;
      full_name: string;
      cards: Array<{
        program_id: string;
        program_name: string;
        stamps_count: number;
        stamps_required: number;
        status: string;
        cycle_number: number;
      }>;
      total_stamps: number;
      total_cycles: number;
      last_visit: string | null;
    }>();

    for (const card of cards ?? []) {
      const user = userMap.get(card.user_id);
      if (!user) continue;

      let member = membersMap.get(user.id);
      if (!member) {
        member = {
          user_id: user.id,
          full_name: user.full_name || "Utilisateur",
          cards: [],
          total_stamps: 0,
          total_cycles: 0,
          last_visit: card.last_stamp_at,
        };
        membersMap.set(user.id, member);
      }

      const prog = card.program as { id: string; name: string; stamps_required: number } | null;
      member.cards.push({
        program_id: prog?.id ?? "",
        program_name: prog?.name ?? "Programme",
        stamps_count: card.stamps_count,
        stamps_required: prog?.stamps_required ?? 10,
        status: card.status,
        cycle_number: card.cycle_number,
      });

      member.total_stamps += card.stamps_count;
      member.total_cycles = Math.max(member.total_cycles, card.cycle_number);

      if (card.last_stamp_at && (!member.last_visit || card.last_stamp_at > member.last_visit)) {
        member.last_visit = card.last_stamp_at;
      }
    }

    res.json({
      ok: true,
      clients: Array.from(membersMap.values()),
      page,
      per_page: perPage,
    });
  } catch (err) {
    console.error("[getProLoyaltyClients] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 8. GET /api/pro/loyalty/clients/:userId — Fiche client fidèle
// =============================================================================

const getProLoyaltyClientDetail: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const clientId = req.params.userId;
    if (!clientId || !isValidUUID(clientId)) return res.status(400).json({ error: "Invalid userId" });

    const supabase = getAdminSupabase();

    // Client info (minimal)
    const { data: clientUser } = await supabase
      .from("consumer_users")
      .select("id, full_name")
      .eq("id", clientId)
      .maybeSingle();

    if (!clientUser) return res.status(404).json({ error: "Client not found" });

    // Toutes ses cartes chez cet établissement
    const { data: cards } = await supabase
      .from("loyalty_cards")
      .select("*, program:loyalty_programs(*), stamps:loyalty_stamps(*)")
      .eq("user_id", clientId)
      .eq("establishment_id", estId)
      .order("created_at", { ascending: false });

    // Rewards
    const { data: rewards } = await supabase
      .from("loyalty_rewards")
      .select("*")
      .eq("user_id", clientId)
      .eq("establishment_id", estId)
      .order("created_at", { ascending: false });

    res.json({
      ok: true,
      client: {
        user_id: clientUser.id,
        full_name: clientUser.full_name || "Utilisateur",
      },
      cards: cards ?? [],
      rewards: rewards ?? [],
    });
  } catch (err) {
    console.error("[getProLoyaltyClientDetail] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 9. POST /api/pro/scan/loyalty — Résultat unifié fidélité après scan QR
// =============================================================================

const scanLoyalty: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const body = req.body as Record<string, unknown>;
    const consumerId = String(body.user_id ?? "").trim();
    if (!consumerId || !isValidUUID(consumerId)) return res.status(400).json({ error: "Invalid user_id" });

    const staffName = await getStaffName(user.id);

    const result = await getLoyaltyInfoForScan({
      consumerId,
      establishmentId: estId,
      stampedByUserId: user.id,
      stampedByName: staffName,
    });

    // Audit log
    void auditProAction("pro.loyalty.scan", {
      proUserId: user.id,
      targetType: "user",
      targetId: consumerId,
      details: { establishment_id: estId, auto_stamp: result.auto_stamp_result?.success ?? false },
      ip: getClientIp(req),
    });

    // Détection fraude (async)
    if (result.auto_stamp_result?.success) {
      for (const card of result.cards) {
        if (card.card_id) {
          void detectSuspiciousStamping({
            userId: consumerId,
            establishmentId: estId,
            programId: card.card_id, // programId through card
          });
        }
      }
    }

    res.json({ ok: true, loyalty: result });
  } catch (err) {
    console.error("[scanLoyalty] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 10. POST /api/pro/loyalty/stamp/:cardId — Tampon conditionnel
// =============================================================================

const confirmConditionalStamp: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const cardId = req.params.cardId;
    if (!cardId || !isValidUUID(cardId)) return res.status(400).json({ error: "Invalid cardId" });

    const body = req.body as Record<string, unknown>;
    const amountSpent = Number(body.amount_spent ?? 0);
    const consumerId = String(body.user_id ?? "").trim();
    const programId = String(body.program_id ?? "").trim();

    if (!consumerId || !isValidUUID(consumerId) || !programId || !isValidUUID(programId)) {
      return res.status(400).json({ error: "Valid user_id and program_id required" });
    }
    if (amountSpent <= 0 || amountSpent > 1_000_000) {
      return res.status(400).json({ error: "amount_spent must be between 0 and 1,000,000" });
    }

    const staffName = await getStaffName(user.id);

    const result = await validateConditionalStamp({
      consumerId,
      establishmentId: estId,
      programId,
      cardId,
      amountSpent,
      stampedByUserId: user.id,
      stampedByName: staffName,
    });

    // Audit log
    void auditProAction("pro.loyalty.stamp_conditional", {
      proUserId: user.id,
      targetType: "loyalty_card",
      targetId: cardId,
      details: { consumer_id: consumerId, amount_spent: amountSpent, approved: result.approved },
      ip: getClientIp(req),
    });

    // Détection fraude si tampon validé
    if (result.approved) {
      void detectSuspiciousStamping({
        userId: consumerId,
        establishmentId: estId,
        programId,
      });
    }

    res.json(result);
  } catch (err) {
    console.error("[confirmConditionalStamp] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 11. POST /api/pro/loyalty/claim-reward/:cardId — Consommation cadeau fidélité
// =============================================================================

const claimReward: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const cardId = req.params.cardId;
    if (!cardId || !isValidUUID(cardId)) return res.status(400).json({ error: "Invalid cardId" });

    const staffName = await getStaffName(user.id);

    const result = await claimLoyaltyReward({
      cardId,
      establishmentId: estId,
      claimedByUserId: user.id,
      claimedByName: staffName,
    });

    if (result.ok) {
      void auditProAction("pro.loyalty.claim_reward", {
        proUserId: user.id,
        targetType: "loyalty_card",
        targetId: cardId,
        details: { establishment_id: estId },
        ip: getClientIp(req),
      });
    }

    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    console.error("[claimReward] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 12. POST /api/pro/gifts/:distributionId/consume — Consommation cadeau sam.ma
// =============================================================================

const consumeGift: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;

  try {
    const distributionId = req.params.distributionId;
    if (!distributionId || !isValidUUID(distributionId)) return res.status(400).json({ error: "Invalid distributionId" });

    const result = await consumePlatformGift({
      distributionId,
      consumedByUserId: user.id,
    });

    if (result.ok) {
      void auditProAction("pro.loyalty.consume_gift", {
        proUserId: user.id,
        targetType: "gift_distribution",
        targetId: distributionId,
        ip: getClientIp(req),
      });
    }

    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    console.error("[consumeGift] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 13. POST /api/pro/gifts/offer — Offrir des cadeaux à sam.ma
// =============================================================================

const offerGift: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const body = req.body as Record<string, unknown>;
    const giftType = sanitizePlain(String(body.gift_type ?? ""), 50) as PlatformGiftType;
    const description = sanitizeText(String(body.description ?? ""), 2000);
    const value = Number(body.value ?? 0);
    const totalQuantity = Number(body.total_quantity ?? 1);
    const conditions = body.conditions ? sanitizeText(String(body.conditions), 2000) : null;
    const validityStart = String(body.validity_start ?? "").trim();
    const validityEnd = String(body.validity_end ?? "").trim();

    if (!giftType || !description || !value || !validityStart || !validityEnd) {
      return res.status(400).json({
        error: "gift_type, description, value, validity_start, validity_end required",
      });
    }

    if (value <= 0 || value > 100_000) {
      return res.status(400).json({ error: "value must be between 0 and 100,000" });
    }
    if (totalQuantity < 1 || totalQuantity > 10_000) {
      return res.status(400).json({ error: "total_quantity must be between 1 and 10,000" });
    }

    const result = await offerPlatformGift({
      establishmentId: estId,
      offeredBy: user.id,
      giftType,
      description,
      value,
      totalQuantity,
      conditions,
      validityStart,
      validityEnd,
    });

    if (result.ok) {
      void auditProAction("pro.loyalty.offer_gift", {
        proUserId: user.id,
        targetType: "platform_gift",
        targetId: result.gift_id ?? estId,
        details: { establishment_id: estId, gift_type: giftType, value, quantity: totalQuantity },
        ip: getClientIp(req),
      });
    }

    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    console.error("[offerGift] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// 14. GET /api/pro/gifts/offered — Mes cadeaux offerts
// =============================================================================

const getMyOfferedGifts: RequestHandler = async (req, res) => {
  const user = await getProUser(req, res);
  if (!user) return;
  const estId = getEstablishmentId(req);
  if (!estId) return res.status(400).json({ error: "establishment_id required" });
  const isMember = await ensureEstablishmentMember(user.id, estId);
  if (!isMember) return res.status(403).json({ error: "Forbidden" });

  try {
    const gifts = await getProOfferedGifts(estId);
    res.json({ ok: true, gifts });
  } catch (err) {
    console.error("[getMyOfferedGifts] Error:", err);
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// Route registration
// =============================================================================

export function registerLoyaltyV2ProRoutes(app: Router): void {
  // Programme fidélité — rate limited
  app.get("/api/pro/loyalty", loyaltyReadRateLimiter, getProLoyaltyProgram);
  app.post("/api/pro/loyalty", loyaltyProActionRateLimiter, createProLoyaltyProgram);
  app.put("/api/pro/loyalty/:programId", loyaltyProActionRateLimiter, updateProLoyaltyProgram);
  app.post("/api/pro/loyalty/:programId/activate", loyaltyProActionRateLimiter, activateProgram);
  app.post("/api/pro/loyalty/:programId/deactivate", loyaltyProActionRateLimiter, deactivateProgram);
  app.get("/api/pro/loyalty/stats", loyaltyReadRateLimiter, getProLoyaltyStats);

  // Clients fidèles — rate limited reads
  app.get("/api/pro/loyalty/clients", loyaltyReadRateLimiter, getProLoyaltyClients);
  app.get("/api/pro/loyalty/clients/:userId", loyaltyReadRateLimiter, getProLoyaltyClientDetail);

  // Scan QR fidélité — rate limited
  app.post("/api/pro/scan/loyalty", loyaltyScanRateLimiter, scanLoyalty);
  app.post("/api/pro/loyalty/stamp/:cardId", loyaltyStampRateLimiter, confirmConditionalStamp);
  app.post("/api/pro/loyalty/claim-reward/:cardId", loyaltyConsumeRateLimiter, claimReward);

  // Cadeaux sam.ma — rate limited
  app.post("/api/pro/gifts/:distributionId/consume", loyaltyConsumeRateLimiter, consumeGift);
  app.post("/api/pro/gifts/offer", loyaltyGiftOfferRateLimiter, offerGift);
  app.get("/api/pro/gifts/offered", loyaltyReadRateLimiter, getMyOfferedGifts);
}
