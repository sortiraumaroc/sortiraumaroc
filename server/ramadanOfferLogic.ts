/**
 * Ramadan Offer Lifecycle Logic
 *
 * Gère le cycle de vie complet d'une offre Ramadan :
 *  - Création (draft)
 *  - Soumission pour modération (pending_moderation)
 *  - Modération (approve / reject / request_modification)
 *  - Activation (approved → active quand valid_from atteint)
 *  - Expiration (active → expired quand valid_to dépassé)
 *  - Suspension / reprise
 *
 * Pattern identique à server/packLifecycleLogic.ts.
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { emitAdminNotification } from "./adminNotifications";
import { notifyProMembers } from "./proNotifications";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("ramadanOfferLogic");
import type {
  RamadanOfferModerationStatus,
  CreateRamadanOfferInput,
  UpdateRamadanOfferInput,
} from "../shared/ramadanTypes";
import {
  RAMADAN_OFFER_MODERATION_TRANSITIONS,
  RAMADAN_OFFER_EDITABLE_STATUSES,
  RAMADAN_OFFER_SIGNIFICANT_FIELDS,
} from "../shared/ramadanTypes";

// =============================================================================
// Helpers
// =============================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Return the value if it's a valid UUID, otherwise null. */
function safeUUID(v: string | null | undefined): string | null {
  return v && UUID_RE.test(v) ? v : null;
}

// =============================================================================
// Types
// =============================================================================

type OpResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; errorCode?: string };

// =============================================================================
// 1. Créer une offre (draft)
// =============================================================================

export async function createRamadanOffer(
  input: CreateRamadanOfferInput,
  creatorId: string,
): Promise<OpResult<{ offerId: string }>> {
  const supabase = getAdminSupabase();

  const payload: Record<string, unknown> = {
    establishment_id: input.establishmentId,
    creator_id: creatorId,
    title: input.title,
    description_fr: input.descriptionFr ?? null,
    description_ar: input.descriptionAr ?? null,
    type: input.type,
    price: input.price,
    original_price: input.originalPrice ?? null,
    currency: "MAD",
    capacity_per_slot: input.capacityPerSlot ?? 20,
    slot_interval_minutes: input.slotIntervalMinutes ?? 30,
    time_slots: input.timeSlots,
    photos: input.photos ?? [],
    cover_url: input.coverUrl ?? null,
    conditions_fr: input.conditionsFr ?? null,
    conditions_ar: input.conditionsAr ?? null,
    valid_from: input.validFrom,
    valid_to: input.validTo,
    moderation_status: "draft",
  };

  const { data, error } = await supabase
    .from("ramadan_offers")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: error.message, errorCode: "db_error" };
  }

  const offerId = (data as any).id as string;

  // Notifier l'admin qu'un brouillon a été créé
  void (async () => {
    try {
      await emitAdminNotification({
        type: "ramadan_offer_created",
        title: "🌙 Nouvelle offre Ramadan créée",
        body: `Un pro vient de créer le brouillon "${input.title}".`,
        data: { offer_id: offerId, establishment_id: input.establishmentId },
      });
    } catch (err) {
      log.warn({ err }, "ramadan offer created notification failed");
    }
  })();

  return { ok: true, data: { offerId } };
}

// =============================================================================
// 2. Soumettre pour modération (draft/modification_requested → pending_moderation)
// =============================================================================

export async function submitRamadanOfferForModeration(
  offerId: string,
  establishmentId: string,
): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { data: offer, error } = await supabase
    .from("ramadan_offers")
    .select("id, moderation_status, title, establishment_id")
    .eq("id", offerId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!offer) return { ok: false, error: "Offre Ramadan introuvable.", errorCode: "not_found" };

  const currentStatus = (offer as any).moderation_status as RamadanOfferModerationStatus;
  const allowed = RAMADAN_OFFER_MODERATION_TRANSITIONS[currentStatus];
  if (!allowed?.includes("pending_moderation")) {
    return {
      ok: false,
      error: `Impossible de soumettre une offre en statut "${currentStatus}".`,
      errorCode: "invalid_transition",
    };
  }

  await supabase
    .from("ramadan_offers")
    .update({
      moderation_status: "pending_moderation",
      updated_at: new Date().toISOString(),
    })
    .eq("id", offerId);

  // Notifier l'admin
  void (async () => {
    try {
      log.info({ offerId }, "Emitting admin notification for offer submission");
      await emitAdminNotification({
        type: "ramadan_offer_submitted",
        title: "🌙 Nouvelle offre Ramadan en attente",
        body: `L'offre "${(offer as any).title}" a été soumise pour modération.`,
        data: { offer_id: offerId, establishment_id: establishmentId },
      });
      log.info({ offerId }, "Admin notification emitted successfully");
    } catch (err) {
      log.warn({ err }, "ramadan offer submitted notification failed");
    }
  })();

  return { ok: true, data: undefined };
}

// =============================================================================
// 3. Approuver
// =============================================================================

export async function approveRamadanOffer(
  offerId: string,
  adminUserId: string | null,
  note?: string,
): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { data: offer, error } = await supabase
    .from("ramadan_offers")
    .select("id, moderation_status, title, establishment_id, valid_from")
    .eq("id", offerId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!offer) return { ok: false, error: "Offre Ramadan introuvable.", errorCode: "not_found" };

  const currentStatus = (offer as any).moderation_status as RamadanOfferModerationStatus;
  if (currentStatus !== "pending_moderation") {
    return {
      ok: false,
      error: `L'offre n'est pas en attente de modération (statut: ${currentStatus}).`,
      errorCode: "invalid_transition",
    };
  }

  // Déterminer le statut cible : active immédiatement ou approved (programmé)
  const validFrom = (offer as any).valid_from;
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const shouldActivateNow = !validFrom || validFrom <= today;

  const targetStatus: RamadanOfferModerationStatus = shouldActivateNow ? "active" : "approved";

  const { error: updateError } = await supabase
    .from("ramadan_offers")
    .update({
      moderation_status: targetStatus,
      moderated_by: safeUUID(adminUserId),
      moderated_at: now.toISOString(),
      moderation_note: note ?? null,
      rejection_reason: null,
      updated_at: now.toISOString(),
    })
    .eq("id", offerId);

  if (updateError) return { ok: false, error: updateError.message };

  // Notifier le pro
  void (async () => {
    try {
      await notifyProMembers({
        supabase,
        establishmentId: (offer as any).establishment_id,
        category: "ramadan_moderation",
        title: "🌙 Offre Ramadan approuvée !",
        body: targetStatus === "active"
          ? `Votre offre "${(offer as any).title}" est maintenant visible.`
          : `Votre offre "${(offer as any).title}" a été approuvée et sera visible à partir du ${validFrom}.`,
        data: { offer_id: offerId, status: targetStatus },
      });
    } catch (err) { log.warn({ err }, "ramadan offer approved notification failed"); }
  })();

  return { ok: true, data: undefined };
}

// =============================================================================
// 4. Rejeter
// =============================================================================

export async function rejectRamadanOffer(
  offerId: string,
  adminUserId: string | null,
  reason: string,
): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { data: offer, error } = await supabase
    .from("ramadan_offers")
    .select("id, moderation_status, title, establishment_id")
    .eq("id", offerId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!offer) return { ok: false, error: "Offre Ramadan introuvable.", errorCode: "not_found" };

  if ((offer as any).moderation_status !== "pending_moderation") {
    return { ok: false, error: "L'offre n'est pas en attente de modération.", errorCode: "invalid_transition" };
  }

  const { error: updateError } = await supabase
    .from("ramadan_offers")
    .update({
      moderation_status: "rejected",
      moderated_by: safeUUID(adminUserId),
      moderated_at: new Date().toISOString(),
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", offerId);

  if (updateError) return { ok: false, error: updateError.message };

  void (async () => {
    try {
      await notifyProMembers({
        supabase,
        establishmentId: (offer as any).establishment_id,
        category: "ramadan_moderation",
        title: "Offre Ramadan rejetée",
        body: `Votre offre "${(offer as any).title}" a été rejetée. Motif : ${reason}`,
        data: { offer_id: offerId, reason },
      });
    } catch (err) { log.warn({ err }, "ramadan offer rejected notification failed"); }
  })();

  return { ok: true, data: undefined };
}

// =============================================================================
// 5. Demander une modification
// =============================================================================

export async function requestRamadanOfferModification(
  offerId: string,
  adminUserId: string | null,
  note: string,
): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { data: offer, error } = await supabase
    .from("ramadan_offers")
    .select("id, moderation_status, title, establishment_id")
    .eq("id", offerId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!offer) return { ok: false, error: "Offre Ramadan introuvable.", errorCode: "not_found" };

  if ((offer as any).moderation_status !== "pending_moderation") {
    return { ok: false, error: "L'offre n'est pas en attente de modération.", errorCode: "invalid_transition" };
  }

  const { error: updateError } = await supabase
    .from("ramadan_offers")
    .update({
      moderation_status: "modification_requested",
      moderated_by: safeUUID(adminUserId),
      moderated_at: new Date().toISOString(),
      moderation_note: note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", offerId);

  if (updateError) return { ok: false, error: updateError.message };

  void (async () => {
    try {
      await notifyProMembers({
        supabase,
        establishmentId: (offer as any).establishment_id,
        category: "ramadan_moderation",
        title: "Modification demandée pour votre offre Ramadan",
        body: `Des modifications ont été demandées pour "${(offer as any).title}" : ${note}`,
        data: { offer_id: offerId, note },
      });
    } catch (err) { log.warn({ err }, "ramadan modification request notification failed"); }
  })();

  return { ok: true, data: undefined };
}

// =============================================================================
// 6. Mettre en avant / retirer
// =============================================================================

export async function featureRamadanOffer(offerId: string, featured: boolean): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("ramadan_offers")
    .update({ is_featured: featured, updated_at: new Date().toISOString() })
    .eq("id", offerId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

// =============================================================================
// 7. Modifier une offre (pro)
// =============================================================================

export async function updateRamadanOffer(
  offerId: string,
  establishmentId: string,
  input: UpdateRamadanOfferInput,
): Promise<OpResult<{ requiresModeration: boolean }>> {
  const supabase = getAdminSupabase();

  const { data: offer, error } = await supabase
    .from("ramadan_offers")
    .select("id, moderation_status, establishment_id")
    .eq("id", offerId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!offer) return { ok: false, error: "Offre Ramadan introuvable.", errorCode: "not_found" };

  const currentStatus = (offer as any).moderation_status as RamadanOfferModerationStatus;
  const isEditable = RAMADAN_OFFER_EDITABLE_STATUSES.includes(currentStatus);
  const isActive = currentStatus === "active" || currentStatus === "suspended";

  if (!isEditable && !isActive) {
    return {
      ok: false,
      error: `Impossible de modifier une offre en statut "${currentStatus}".`,
      errorCode: "not_editable",
    };
  }

  // Construire le payload de mise à jour
  const payload: Record<string, unknown> = {};
  const now = new Date().toISOString();
  payload.updated_at = now;

  if (input.title !== undefined) payload.title = input.title;
  if (input.descriptionFr !== undefined) payload.description_fr = input.descriptionFr;
  if (input.descriptionAr !== undefined) payload.description_ar = input.descriptionAr;
  if (input.type !== undefined) payload.type = input.type;
  if (input.price !== undefined) payload.price = input.price;
  if (input.originalPrice !== undefined) payload.original_price = input.originalPrice;
  if (input.capacityPerSlot !== undefined) payload.capacity_per_slot = input.capacityPerSlot;
  if (input.slotIntervalMinutes !== undefined) payload.slot_interval_minutes = input.slotIntervalMinutes;
  if (input.timeSlots !== undefined) payload.time_slots = input.timeSlots;
  if (input.photos !== undefined) payload.photos = input.photos;
  if (input.coverUrl !== undefined) payload.cover_url = input.coverUrl;
  if (input.conditionsFr !== undefined) payload.conditions_fr = input.conditionsFr;
  if (input.conditionsAr !== undefined) payload.conditions_ar = input.conditionsAr;
  if (input.validFrom !== undefined) payload.valid_from = input.validFrom;
  if (input.validTo !== undefined) payload.valid_to = input.validTo;

  // Vérifier si les champs significatifs ont changé → re-modération
  let requiresModeration = false;
  if (isActive) {
    const changedKeys = Object.keys(input).filter(
      (k) => (input as any)[k] !== undefined,
    );
    requiresModeration = changedKeys.some((k) => RAMADAN_OFFER_SIGNIFICANT_FIELDS.has(k));

    if (requiresModeration) {
      payload.moderation_status = "pending_moderation";
    }
  }

  const { error: updateErr } = await supabase
    .from("ramadan_offers")
    .update(payload)
    .eq("id", offerId);

  if (updateErr) return { ok: false, error: updateErr.message };

  return { ok: true, data: { requiresModeration } };
}

// =============================================================================
// 8. Suspendre / Reprendre
// =============================================================================

export async function suspendRamadanOffer(
  offerId: string,
  establishmentId: string,
): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { data: offer, error } = await supabase
    .from("ramadan_offers")
    .select("id, moderation_status")
    .eq("id", offerId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!offer) return { ok: false, error: "Offre introuvable.", errorCode: "not_found" };

  if ((offer as any).moderation_status !== "active") {
    return { ok: false, error: "Seule une offre active peut être suspendue.", errorCode: "invalid_transition" };
  }

  await supabase
    .from("ramadan_offers")
    .update({ moderation_status: "suspended", updated_at: new Date().toISOString() })
    .eq("id", offerId);

  return { ok: true, data: undefined };
}

export async function resumeRamadanOffer(
  offerId: string,
  establishmentId: string,
): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { data: offer, error } = await supabase
    .from("ramadan_offers")
    .select("id, moderation_status")
    .eq("id", offerId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!offer) return { ok: false, error: "Offre introuvable.", errorCode: "not_found" };

  if ((offer as any).moderation_status !== "suspended") {
    return { ok: false, error: "Seule une offre suspendue peut être réactivée.", errorCode: "invalid_transition" };
  }

  await supabase
    .from("ramadan_offers")
    .update({ moderation_status: "active", updated_at: new Date().toISOString() })
    .eq("id", offerId);

  return { ok: true, data: undefined };
}

// =============================================================================
// 9. Supprimer un brouillon
// =============================================================================

export async function deleteRamadanOffer(
  offerId: string,
  establishmentId: string,
  isAdmin = false,
): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { data: offer, error } = await supabase
    .from("ramadan_offers")
    .select("id, moderation_status")
    .eq("id", offerId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!offer) return { ok: false, error: "Offre introuvable.", errorCode: "not_found" };

  const status = (offer as any).moderation_status as RamadanOfferModerationStatus;

  if (isAdmin) {
    // Admin peut supprimer tous les statuts sauf "active" (il faut d'abord suspendre)
    if (status === "active") {
      return { ok: false, error: "Suspendez d'abord l'offre avant de la supprimer.", errorCode: "not_deletable" };
    }
  } else {
    // Pro : seuls les brouillons et offres rejetées
    if (!["draft", "rejected"].includes(status)) {
      return { ok: false, error: "Seuls les brouillons et offres rejetées peuvent être supprimés.", errorCode: "not_deletable" };
    }
  }

  const { error: delErr } = await supabase
    .from("ramadan_offers")
    .delete()
    .eq("id", offerId);

  if (delErr) return { ok: false, error: delErr.message };
  return { ok: true, data: undefined };
}

// =============================================================================
// 10. Cron : Activer les offres approuvées (approved → active)
// =============================================================================

export async function activateScheduledRamadanOffers(): Promise<number> {
  const supabase = getAdminSupabase();
  const today = new Date().toISOString().split("T")[0];

  const { data: offers, error } = await supabase
    .from("ramadan_offers")
    .select("id, title, establishment_id")
    .eq("moderation_status", "approved")
    .lte("valid_from", today)
    .limit(100);

  if (error || !offers) return 0;

  let activated = 0;
  for (const offer of offers) {
    await supabase
      .from("ramadan_offers")
      .update({
        moderation_status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", (offer as any).id);

    void (async () => {
      try {
        await notifyProMembers({
          supabase,
          establishmentId: (offer as any).establishment_id,
          category: "ramadan_lifecycle",
          title: "🌙 Offre Ramadan activée !",
          body: `Votre offre "${(offer as any).title}" est maintenant visible par les clients.`,
          data: { offer_id: (offer as any).id },
        });
      } catch (err) { log.warn({ err }, "ramadan offer activated notification failed"); }
    })();

    activated++;
  }

  if (activated > 0) {
    log.info({ activated }, "Activated scheduled Ramadan offers");
  }

  return activated;
}

// =============================================================================
// 11. Cron : Expirer les offres (active → expired)
// =============================================================================

export async function expireRamadanOffers(): Promise<number> {
  const supabase = getAdminSupabase();
  const today = new Date().toISOString().split("T")[0];

  const { data: offers, error } = await supabase
    .from("ramadan_offers")
    .select("id, title, establishment_id")
    .in("moderation_status", ["active", "approved"])
    .lt("valid_to", today)
    .limit(200);

  if (error || !offers) return 0;

  let expired = 0;
  for (const offer of offers) {
    await supabase
      .from("ramadan_offers")
      .update({
        moderation_status: "expired",
        updated_at: new Date().toISOString(),
      })
      .eq("id", (offer as any).id);

    void (async () => {
      try {
        await notifyProMembers({
          supabase,
          establishmentId: (offer as any).establishment_id,
          category: "ramadan_lifecycle",
          title: "Offre Ramadan expirée",
          body: `Votre offre "${(offer as any).title}" a expiré. Les réservations existantes restent valables.`,
          data: { offer_id: (offer as any).id },
        });
      } catch (err) { log.warn({ err }, "ramadan offer expired notification failed"); }
    })();

    expired++;
  }

  if (expired > 0) {
    log.info({ expired }, "Expired Ramadan offers");
  }

  return expired;
}
