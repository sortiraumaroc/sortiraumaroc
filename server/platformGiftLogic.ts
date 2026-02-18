// =============================================================================
// SAM LOYALTY V2 — Cadeaux sam.ma (PlatformGift)
// Soumission, approbation, distribution (3 modes), consommation
// =============================================================================

import { getAdminSupabase } from "./supabaseAdmin";
import { randomUUID } from "crypto";
import type {
  PlatformGiftType,
  PlatformGiftStatus,
  DistributionMethod,
  DistributionCriteria,
} from "../shared/loyaltyTypesV2";
import {
  notifyAdminGiftToApprove,
  notifyPlatformGiftReceived,
  notifyProGiftDistributed,
  notifyProGiftConsumed,
} from "./loyaltyRealtimeNotifications";
import { emitAdminNotification } from "./adminNotifications";

// =============================================================================
// 2.4a — SOUMISSION PAR LE PRO
// =============================================================================

/**
 * Le pro soumet une offre de cadeau à sam.ma pour redistribution.
 */
export async function offerPlatformGift(args: {
  establishmentId: string;
  offeredBy: string;
  giftType: PlatformGiftType;
  description: string;
  value: number;
  totalQuantity: number;
  conditions?: string | null;
  validityStart: string;
  validityEnd: string;
}): Promise<{ ok: boolean; gift_id?: string; message: string }> {
  const supabase = getAdminSupabase();

  // Validation basique
  if (args.totalQuantity < 1 || args.totalQuantity > 1000) {
    return { ok: false, message: "Quantité doit être entre 1 et 1000" };
  }
  if (new Date(args.validityEnd) <= new Date(args.validityStart)) {
    return { ok: false, message: "Date de fin doit être après la date de début" };
  }
  if (args.value <= 0) {
    return { ok: false, message: "Valeur doit être positive" };
  }

  const { data, error } = await supabase
    .from("platform_gifts")
    .insert({
      establishment_id: args.establishmentId,
      offered_by: args.offeredBy,
      gift_type: args.giftType,
      description: args.description,
      value: args.value,
      value_currency: "MAD",
      total_quantity: args.totalQuantity,
      distributed_count: 0,
      consumed_count: 0,
      conditions: args.conditions ?? null,
      validity_start: args.validityStart,
      validity_end: args.validityEnd,
      status: "offered",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[platformGift] offer error:", error);
    return { ok: false, message: error.message };
  }

  // Alerte admin si cadeau haute valeur (> 1000 Dhs)
  if (args.value > 1000) {
    void createHighValueAlert(
      args.establishmentId,
      args.offeredBy,
      data.id,
      args.value,
      args.description
    );
  }

  // Notification admin (best-effort) — cadeau offert à approuver (email + in-app)
  void notifyAdminNewGift(args.establishmentId, data.id, args.description);
  void notifyAdminGiftToApprove({
    giftId: data.id,
    giftDescription: args.description,
    giftValue: args.value,
    establishmentName: args.establishmentId, // resolved in notification
    establishmentId: args.establishmentId,
  });

  return { ok: true, gift_id: data.id, message: "Cadeau soumis avec succès" };
}

// =============================================================================
// 2.4b — APPROBATION / REJET PAR L'ADMIN
// =============================================================================

export async function approvePlatformGift(args: {
  giftId: string;
  approvedBy: string;
}): Promise<{ ok: boolean; message: string }> {
  const supabase = getAdminSupabase();

  const { data: gift } = await supabase
    .from("platform_gifts")
    .select("status")
    .eq("id", args.giftId)
    .maybeSingle();

  if (!gift) return { ok: false, message: "Cadeau non trouvé" };
  if (gift.status !== "offered") {
    return { ok: false, message: `Cadeau déjà traité (statut: ${gift.status})` };
  }

  const { error } = await supabase
    .from("platform_gifts")
    .update({
      status: "approved",
      approved_by: args.approvedBy,
      approved_at: new Date().toISOString(),
    })
    .eq("id", args.giftId);

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Cadeau approuvé" };
}

export async function rejectPlatformGift(args: {
  giftId: string;
  rejectedBy: string;
  reason: string;
}): Promise<{ ok: boolean; message: string }> {
  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("platform_gifts")
    .update({
      status: "rejected",
      approved_by: args.rejectedBy,
      rejection_reason: args.reason,
    })
    .eq("id", args.giftId)
    .eq("status", "offered");

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Cadeau rejeté" };
}

// =============================================================================
// 2.4c — DISTRIBUTION MANUELLE
// =============================================================================

/**
 * Distribution manuelle : l'admin sélectionne des utilisateurs spécifiques.
 */
export async function distributeManual(args: {
  giftId: string;
  userIds: string[];
  distributedBy: string;
}): Promise<{ ok: boolean; distributed: number; message: string }> {
  const supabase = getAdminSupabase();

  // Fetch cadeau
  const { data: gift } = await supabase
    .from("platform_gifts")
    .select("*")
    .eq("id", args.giftId)
    .maybeSingle();

  if (!gift) return { ok: false, distributed: 0, message: "Cadeau non trouvé" };
  if (!["approved", "partially_distributed"].includes(gift.status)) {
    return { ok: false, distributed: 0, message: `Cadeau non distribuable (statut: ${gift.status})` };
  }

  const remaining = gift.total_quantity - gift.distributed_count;
  if (remaining <= 0) {
    return { ok: false, distributed: 0, message: "Stock épuisé" };
  }

  // Limiter au stock restant
  const toDistribute = args.userIds.slice(0, remaining);

  // Vérifier duplicata (un client ne peut recevoir qu'une fois)
  const { data: existingDist } = await supabase
    .from("platform_gift_distributions")
    .select("user_id")
    .eq("platform_gift_id", args.giftId)
    .in("user_id", toDistribute);

  const alreadyDistributed = new Set((existingDist ?? []).map((d) => d.user_id));
  const newRecipients = toDistribute.filter((id) => !alreadyDistributed.has(id));

  if (newRecipients.length === 0) {
    return { ok: true, distributed: 0, message: "Tous les utilisateurs ont déjà reçu ce cadeau" };
  }

  // Créer les distributions
  const distributions = newRecipients.map((userId) => ({
    platform_gift_id: args.giftId,
    user_id: userId,
    distribution_method: "manual" as const,
    distributed_by: args.distributedBy,
    qr_gift_token: randomUUID(),
    status: "distributed" as const,
    distributed_at: new Date().toISOString(),
    expires_at: gift.validity_end,
  }));

  const { error: insertErr } = await supabase
    .from("platform_gift_distributions")
    .insert(distributions);

  if (insertErr) {
    console.error("[platformGift] distribute manual error:", insertErr);
    return { ok: false, distributed: 0, message: insertErr.message };
  }

  // Mettre à jour le compteur
  const newDistCount = gift.distributed_count + newRecipients.length;
  const newStatus: PlatformGiftStatus =
    newDistCount >= gift.total_quantity ? "fully_distributed" : "partially_distributed";

  await supabase
    .from("platform_gifts")
    .update({
      distributed_count: newDistCount,
      status: newStatus,
    })
    .eq("id", args.giftId);

  // Notifications aux clients (best-effort) — queue
  void notifyGiftRecipients(newRecipients, gift.description, gift.validity_end);

  // Notifications temps réel (Phase 6)
  // Client: cadeau reçu (email + SMS + in-app)
  for (const userId of newRecipients) {
    const matchedDist = distributions.find((d) => d.user_id === userId);
    void notifyPlatformGiftReceived({
      userId,
      distributionId: matchedDist?.qr_gift_token ?? "",
      giftDescription: gift.description,
      giftType: gift.gift_type,
      giftValue: gift.value,
      establishmentName: gift.establishment_id,
      expiresAt: gift.validity_end,
    });
  }
  // Pro: cadeau distribué (in-app)
  void notifyProGiftDistributed({
    establishmentId: gift.establishment_id,
    giftDescription: gift.description,
    distributedCount: newRecipients.length,
  });

  return {
    ok: true,
    distributed: newRecipients.length,
    message: `${newRecipients.length} cadeau(x) distribué(s)`,
  };
}

// =============================================================================
// 2.4d — DISTRIBUTION PAR CRITÈRES
// =============================================================================

/**
 * Distribution par critères : l'admin définit des filtres et le système sélectionne.
 */
export async function distributeByCriteria(args: {
  giftId: string;
  criteria: DistributionCriteria;
  distributedBy: string;
}): Promise<{ ok: boolean; distributed: number; message: string }> {
  const supabase = getAdminSupabase();

  // Fetch cadeau
  const { data: gift } = await supabase
    .from("platform_gifts")
    .select("*")
    .eq("id", args.giftId)
    .maybeSingle();

  if (!gift) return { ok: false, distributed: 0, message: "Cadeau non trouvé" };
  if (!["approved", "partially_distributed"].includes(gift.status)) {
    return { ok: false, distributed: 0, message: `Cadeau non distribuable` };
  }

  const remaining = gift.total_quantity - gift.distributed_count;
  if (remaining <= 0) {
    return { ok: false, distributed: 0, message: "Stock épuisé" };
  }

  // Construire la requête de sélection des utilisateurs
  let query = supabase
    .from("consumer_users")
    .select("id, city")
    .limit(args.criteria.max_recipients ?? remaining);

  if (args.criteria.city) {
    query = query.eq("city", args.criteria.city);
  }

  const { data: candidates } = await query;

  if (!candidates || candidates.length === 0) {
    return { ok: true, distributed: 0, message: "Aucun utilisateur correspondant aux critères" };
  }

  let userIds = candidates.map((c) => c.id);

  // Filtrer par nombre de réservations si demandé
  if (args.criteria.min_reservations) {
    const minRes = args.criteria.min_reservations;
    const filtered: string[] = [];
    for (const userId of userIds) {
      const { count } = await supabase
        .from("reservations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["confirmed", "completed", "consumed", "consumed_default"]);
      if ((count ?? 0) >= minRes) filtered.push(userId);
    }
    userIds = filtered;
  }

  // Filtrer par inactivité si demandé
  if (args.criteria.inactive_days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - args.criteria.inactive_days);
    const cutoffStr = cutoff.toISOString();
    const filtered: string[] = [];
    for (const userId of userIds) {
      const { data: lastRes } = await supabase
        .from("reservations")
        .select("starts_at")
        .eq("user_id", userId)
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastRes || lastRes.starts_at < cutoffStr) {
        filtered.push(userId);
      }
    }
    userIds = filtered;
  }

  // Limiter au stock restant
  userIds = userIds.slice(0, remaining);

  if (userIds.length === 0) {
    return { ok: true, distributed: 0, message: "Aucun utilisateur éligible" };
  }

  // Déléguer à la distribution manuelle
  return distributeManual({
    giftId: args.giftId,
    userIds,
    distributedBy: args.distributedBy,
  });
}

// =============================================================================
// 2.4e — DISTRIBUTION "PREMIER ARRIVÉ"
// =============================================================================

/**
 * Publie un cadeau en mode "premier arrivé, premier servi".
 * Les clients peuvent le réclamer depuis une page publique.
 */
export async function publishForFirstCome(args: {
  giftId: string;
  publishedBy: string;
}): Promise<{ ok: boolean; message: string }> {
  const supabase = getAdminSupabase();

  const { data: gift } = await supabase
    .from("platform_gifts")
    .select("status, total_quantity, distributed_count")
    .eq("id", args.giftId)
    .maybeSingle();

  if (!gift) return { ok: false, message: "Cadeau non trouvé" };
  if (!["approved", "partially_distributed"].includes(gift.status)) {
    return { ok: false, message: `Cadeau non publiable (statut: ${gift.status})` };
  }

  // Passer en partially_distributed pour signaler la publication
  // (le stock restant est consultable publiquement)
  await supabase
    .from("platform_gifts")
    .update({ status: "partially_distributed" })
    .eq("id", args.giftId);

  return { ok: true, message: "Cadeau publié en mode premier arrivé" };
}

/**
 * Un client réclame un cadeau en mode "premier arrivé".
 */
export async function claimPublicGift(args: {
  giftId: string;
  userId: string;
}): Promise<{ ok: boolean; distribution_id?: string; message: string }> {
  const supabase = getAdminSupabase();

  // Fetch cadeau
  const { data: gift } = await supabase
    .from("platform_gifts")
    .select("*")
    .eq("id", args.giftId)
    .in("status", ["approved", "partially_distributed"])
    .maybeSingle();

  if (!gift) return { ok: false, message: "Cadeau non disponible" };

  const remaining = gift.total_quantity - gift.distributed_count;
  if (remaining <= 0) return { ok: false, message: "Stock épuisé" };

  // Vérifier que le client n'a pas déjà reçu ce cadeau
  const { data: existing } = await supabase
    .from("platform_gift_distributions")
    .select("id")
    .eq("platform_gift_id", args.giftId)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (existing) return { ok: false, message: "Vous avez déjà récupéré ce cadeau" };

  // Créer la distribution
  const { data: dist, error } = await supabase
    .from("platform_gift_distributions")
    .insert({
      platform_gift_id: args.giftId,
      user_id: args.userId,
      distribution_method: "first_come",
      distributed_by: null,
      qr_gift_token: randomUUID(),
      status: "distributed",
      distributed_at: new Date().toISOString(),
      expires_at: gift.validity_end,
    })
    .select("id")
    .single();

  if (error) {
    // Peut être un conflit d'unicité (concurrence)
    if (error.code === "23505") {
      return { ok: false, message: "Vous avez déjà récupéré ce cadeau" };
    }
    return { ok: false, message: error.message };
  }

  // Mettre à jour le compteur
  const newDistCount = gift.distributed_count + 1;
  const newStatus: PlatformGiftStatus =
    newDistCount >= gift.total_quantity ? "fully_distributed" : "partially_distributed";

  await supabase
    .from("platform_gifts")
    .update({
      distributed_count: newDistCount,
      status: newStatus,
    })
    .eq("id", args.giftId);

  // Notification temps réel — cadeau reçu (email + SMS + in-app)
  void notifyPlatformGiftReceived({
    userId: args.userId,
    distributionId: dist.id,
    giftDescription: gift.description,
    giftType: gift.gift_type,
    giftValue: gift.value,
    establishmentName: gift.establishment_id,
    expiresAt: gift.validity_end,
  });

  return {
    ok: true,
    distribution_id: dist.id,
    message: "Cadeau récupéré ! Il a été chargé dans votre QR Code.",
  };
}

// =============================================================================
// 2.4f — CONSOMMATION DU CADEAU SAM.MA
// =============================================================================

/**
 * Le pro scanne le QR du client et confirme la consommation d'un cadeau sam.ma.
 */
export async function consumePlatformGift(args: {
  distributionId: string;
  consumedByUserId: string;
}): Promise<{ ok: boolean; message: string }> {
  const supabase = getAdminSupabase();

  const { data: dist } = await supabase
    .from("platform_gift_distributions")
    .select("*, gift:platform_gifts(*)")
    .eq("id", args.distributionId)
    .maybeSingle();

  if (!dist) return { ok: false, message: "Distribution non trouvée" };
  if (dist.status !== "distributed") {
    return { ok: false, message: `Cadeau déjà ${dist.status}` };
  }
  if (new Date(dist.expires_at) < new Date()) {
    await supabase
      .from("platform_gift_distributions")
      .update({ status: "expired" })
      .eq("id", dist.id);
    return { ok: false, message: "Cadeau expiré" };
  }

  // Marquer comme consommé
  await supabase
    .from("platform_gift_distributions")
    .update({
      status: "consumed",
      consumed_at: new Date().toISOString(),
      consumed_scanned_by: args.consumedByUserId,
    })
    .eq("id", dist.id);

  // Mettre à jour le compteur sur le cadeau parent
  const gift = dist.gift as { id: string; consumed_count: number } | null;
  if (gift) {
    try {
      const { data: g } = await supabase
        .from("platform_gifts")
        .select("consumed_count")
        .eq("id", gift.id)
        .single();
      if (g) {
        await supabase
          .from("platform_gifts")
          .update({ consumed_count: (g.consumed_count ?? 0) + 1 })
          .eq("id", gift.id);
      }
    } catch {
      // best-effort
    }
  }

  // Notification temps réel — cadeau consommé → Pro (in-app)
  const giftData = dist.gift as Record<string, unknown> | null;
  if (giftData) {
    void notifyProGiftConsumed({
      establishmentId: (giftData.establishment_id as string) ?? "",
      giftDescription: (giftData.description as string) ?? "Cadeau sam.ma",
      consumerName: dist.user_id as string, // Resolved by notification function
    });
  }

  return { ok: true, message: "Cadeau sam.ma consommé avec succès !" };
}

// =============================================================================
// REQUÊTES PUBLIQUES
// =============================================================================

/**
 * Liste les cadeaux sam.ma disponibles en mode "premier arrivé" pour les clients.
 */
export async function listPublicGifts(): Promise<
  Array<{
    id: string;
    description: string;
    gift_type: PlatformGiftType;
    value: number;
    conditions: string | null;
    remaining: number;
    validity_end: string;
    establishment_name: string;
    establishment_logo: string | null;
  }>
> {
  const supabase = getAdminSupabase();

  const { data } = await supabase
    .from("platform_gifts")
    .select(
      "id, description, gift_type, value, conditions, total_quantity, distributed_count, validity_end, establishment:establishments(name, logo_url)"
    )
    .in("status", ["approved", "partially_distributed"])
    .gt("validity_end", new Date().toISOString())
    .order("created_at", { ascending: false });

  return (data ?? [])
    .filter((g) => g.total_quantity - g.distributed_count > 0)
    .map((g) => {
      const est = g.establishment as unknown as { name: string; logo_url: string | null } | null;
      return {
        id: g.id,
        description: g.description,
        gift_type: g.gift_type as PlatformGiftType,
        value: g.value,
        conditions: g.conditions,
        remaining: g.total_quantity - g.distributed_count,
        validity_end: g.validity_end,
        establishment_name: est?.name ?? "Établissement",
        establishment_logo: est?.logo_url ?? null,
      };
    });
}

/**
 * Liste les cadeaux sam.ma d'un client (distribués, consommés, expirés).
 */
export async function getMyPlatformGifts(userId: string): Promise<{
  distributed: unknown[];
  consumed: unknown[];
  expired: unknown[];
}> {
  const supabase = getAdminSupabase();

  const { data } = await supabase
    .from("platform_gift_distributions")
    .select("*, gift:platform_gifts(*, establishment:establishments(id, name, slug, logo_url, city))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const distributed = (data ?? []).filter((d) => d.status === "distributed");
  const consumed = (data ?? []).filter((d) => d.status === "consumed");
  const expired = (data ?? []).filter((d) => d.status === "expired");

  return { distributed, consumed, expired };
}

// =============================================================================
// PRO — MES CADEAUX OFFERTS
// =============================================================================

export async function getProOfferedGifts(
  establishmentId: string
): Promise<unknown[]> {
  const supabase = getAdminSupabase();

  const { data } = await supabase
    .from("platform_gifts")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("created_at", { ascending: false });

  return data ?? [];
}

// =============================================================================
// ADMIN — GESTION
// =============================================================================

export async function getAdminGifts(filters?: {
  status?: PlatformGiftStatus;
  establishmentId?: string;
}): Promise<unknown[]> {
  const supabase = getAdminSupabase();

  let query = supabase
    .from("platform_gifts")
    .select("*, establishment:establishments(id, name, slug, logo_url, city)")
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.establishmentId)
    query = query.eq("establishment_id", filters.establishmentId);

  const { data } = await query;
  return data ?? [];
}

export async function getGiftStats(giftId: string): Promise<{
  total_quantity: number;
  distributed_count: number;
  consumed_count: number;
  remaining: number;
  expired_count: number;
}> {
  const supabase = getAdminSupabase();

  const { data: gift } = await supabase
    .from("platform_gifts")
    .select("total_quantity, distributed_count, consumed_count")
    .eq("id", giftId)
    .single();

  if (!gift) return { total_quantity: 0, distributed_count: 0, consumed_count: 0, remaining: 0, expired_count: 0 };

  const { count: expiredCount } = await supabase
    .from("platform_gift_distributions")
    .select("id", { count: "exact", head: true })
    .eq("platform_gift_id", giftId)
    .eq("status", "expired");

  return {
    total_quantity: gift.total_quantity,
    distributed_count: gift.distributed_count,
    consumed_count: gift.consumed_count,
    remaining: gift.total_quantity - gift.distributed_count,
    expired_count: expiredCount ?? 0,
  };
}

// =============================================================================
// HELPERS INTERNES
// =============================================================================

async function createHighValueAlert(
  establishmentId: string,
  userId: string,
  giftId: string,
  value: number,
  description: string
): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    await supabase.from("loyalty_alerts").insert({
      alert_type: "high_value_reward",
      establishment_id: establishmentId,
      user_id: userId,
      details: `Cadeau sam.ma haute valeur soumis : ${value} MAD — "${description}"`,
      metadata: { gift_id: giftId, value, description },
      status: "pending",
    });
  } catch {
    // best-effort
  }
}

async function notifyAdminNewGift(
  establishmentId: string,
  giftId: string,
  description: string
): Promise<void> {
  try {
    await emitAdminNotification({
      type: "loyalty_gift_offered",
      title: "Nouveau cadeau sam.ma à approuver",
      body: `Un pro a soumis un cadeau : "${description}"`,
      data: { gift_id: giftId, establishment_id: establishmentId },
    });
  } catch {
    // best-effort
  }
}

async function notifyGiftRecipients(
  userIds: string[],
  giftDescription: string,
  expiresAt: string
): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    // Insérer des notifications pour chaque destinataire
    const notifications = userIds.map((userId) => ({
      user_id: userId,
      card_id: null,
      reward_id: null,
      notification_type: "reward_ready", // Réutilise un type existant
      channel: "email",
      status: "pending",
    }));

    if (notifications.length > 0) {
      await supabase.from("loyalty_notifications").insert(notifications);
    }
  } catch {
    // best-effort
  }
}
