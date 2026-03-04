// =============================================================================
// SAM LOYALTY SYSTEM V2 — Business Logic
// Cycle de vie carte, tampon conditionnel, gel/dégel, renouvellement
// =============================================================================

import { getAdminSupabase } from "./supabaseAdmin";
import { randomUUID } from "crypto";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("loyaltyV2");
import type {
  StampFrequency,
  LoyaltyProgramStatus,
  LoyaltyCardStatusV2,
  ScanLoyaltyResult,
  ConditionalStampResult,
  LOYALTY_FRAUD_THRESHOLDS,
  LOYALTY_SCORING,
} from "../shared/loyaltyTypesV2";
import {
  notifyStampValidated,
  notifyConditionalStampRefused,
  notifyCardHalfway,
  notifyCardAlmostComplete,
  notifyRewardUnlocked,
} from "./loyaltyRealtimeNotifications";

// =============================================================================
// TYPES INTERNES
// =============================================================================

type ProgramRow = {
  id: string;
  establishment_id: string;
  name: string;
  stamps_required: number;
  reward_type: string;
  reward_value: string | null;
  reward_description: string;
  reward_validity_days: number;
  conditions: string | null;
  is_active: boolean;
  status: LoyaltyProgramStatus;
  stamp_frequency: StampFrequency;
  stamp_requires_reservation: boolean;
  stamp_conditional: boolean;
  stamp_minimum_amount: number | null;
  stamp_minimum_currency: string;
  card_validity_days: number | null;
  is_renewable: boolean;
};

type CardRow = {
  id: string;
  user_id: string;
  program_id: string;
  establishment_id: string;
  stamps_count: number;
  status: string;
  cycle_number: number;
  completed_at: string | null;
  last_stamp_at: string | null;
  expires_at: string | null;
  started_at: string | null;
  stamps_required: number | null;
  reward_description: string | null;
  reward_type: string | null;
  reward_value: string | null;
  reward_expires_at: string | null;
  reward_claimed_at: string | null;
  qr_reward_token: string | null;
  previous_card_id: string | null;
};

// =============================================================================
// HELPERS
// =============================================================================

function generateRewardCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "SAM-FID-";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  code += "-" + new Date().getFullYear().toString().slice(-2);
  return code;
}

/** Calcule la date d'expiration de la carte à partir du premier tampon */
function computeCardExpiresAt(
  startedAt: Date,
  validityDays: number | null
): string | null {
  if (!validityDays) return null;
  const d = new Date(startedAt);
  d.setDate(d.getDate() + validityDays);
  return d.toISOString();
}

// =============================================================================
// 2.1 — TAMPON AUTOMATIQUE (non conditionnel)
// =============================================================================

/**
 * Ajoute un tampon automatique pour un client.
 * Appelé depuis le scan QR quand le programme n'est PAS conditionnel.
 * Retourne null si le tampon ne peut pas être ajouté (fréquence, programme inactif, etc.)
 */
export async function addAutomaticStamp(args: {
  consumerId: string;
  establishmentId: string;
  programId: string;
  stampedByUserId: string;
  stampedByName: string | null;
  source?: string;
  offlineId?: string | null;
  reservationId?: string | null;
}): Promise<{
  success: boolean;
  card_id: string;
  stamp_number: number;
  stamps_remaining: number;
  message: string;
  reward_unlocked: boolean;
} | null> {
  const supabase = getAdminSupabase();

  // 1. Fetch programme
  const { data: program } = await supabase
    .from("loyalty_programs")
    .select("*")
    .eq("id", args.programId)
    .eq("establishment_id", args.establishmentId)
    .maybeSingle();

  if (!program) return null;
  if (program.is_active === false || program.status !== "active") return null;

  // 2. Vérifier stamp_requires_reservation
  if (program.stamp_requires_reservation) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: resa } = await supabase
      .from("reservations")
      .select("id")
      .eq("user_id", args.consumerId)
      .eq("establishment_id", args.establishmentId)
      .gte("starts_at", today + "T00:00:00")
      .lte("starts_at", today + "T23:59:59")
      .in("status", ["confirmed", "completed", "consumed", "consumed_default"])
      .limit(1)
      .maybeSingle();

    if (!resa) return null; // Pas de résa consommée aujourd'hui
  }

  // 3. Obtenir ou créer la carte
  let { data: card } = await supabase
    .from("loyalty_cards")
    .select("*")
    .eq("user_id", args.consumerId)
    .eq("program_id", args.programId)
    .eq("status", "active")
    .maybeSingle();

  const isNewCard = !card;

  if (!card) {
    // Créer une nouvelle carte
    const { data: maxCycle } = await supabase
      .from("loyalty_cards")
      .select("cycle_number")
      .eq("user_id", args.consumerId)
      .eq("program_id", args.programId)
      .order("cycle_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const cycleNumber = (maxCycle?.cycle_number ?? 0) + 1;
    const now = new Date();

    const { data: newCard, error: createErr } = await supabase
      .from("loyalty_cards")
      .insert({
        user_id: args.consumerId,
        program_id: args.programId,
        establishment_id: args.establishmentId,
        stamps_count: 0,
        status: "active",
        cycle_number: cycleNumber,
        started_at: now.toISOString(),
        stamps_required: program.stamps_required,
        expires_at: computeCardExpiresAt(now, program.card_validity_days),
      })
      .select("*")
      .single();

    if (createErr || !newCard) {
      log.error({ err: createErr }, "Create card error");
      return null;
    }

    card = newCard;
  }

  // 4. Vérifier fréquence de tamponnage
  const frequencyOk = await checkStampFrequency(
    card.id,
    args.consumerId,
    program.stamp_frequency as StampFrequency
  );
  if (!frequencyOk) {
    return {
      success: false,
      card_id: card.id,
      stamp_number: card.stamps_count,
      stamps_remaining: program.stamps_required - card.stamps_count,
      message: "Tampon déjà attribué pour cette période",
      reward_unlocked: false,
    };
  }

  // 5. Vérifier offline dédup
  if (args.offlineId) {
    const { data: existing } = await supabase
      .from("loyalty_stamps")
      .select("id")
      .eq("offline_id", args.offlineId)
      .maybeSingle();
    if (existing) {
      return {
        success: true,
        card_id: card.id,
        stamp_number: card.stamps_count,
        stamps_remaining: program.stamps_required - card.stamps_count,
        message: "Tampon déjà synchronisé",
        reward_unlocked: false,
      };
    }
  }

  // 6. Insérer le tampon
  const newStampNumber = card.stamps_count + 1;
  const { error: stampErr } = await supabase.from("loyalty_stamps").insert({
    card_id: card.id,
    user_id: args.consumerId,
    program_id: args.programId,
    establishment_id: args.establishmentId,
    stamp_number: newStampNumber,
    stamp_type: "regular",
    stamped_by_user_id: args.stampedByUserId,
    stamped_by_name: args.stampedByName,
    source: args.source ?? "scan",
    reservation_id: args.reservationId ?? null,
    offline_id: args.offlineId ?? null,
    synced_at: args.offlineId ? new Date().toISOString() : null,
  });

  if (stampErr) {
    log.error({ err: stampErr }, "Stamp insert error");
    return null;
  }

  // 7. Mettre à jour la carte
  const isComplete = newStampNumber >= program.stamps_required;
  const updateData: Record<string, unknown> = {
    stamps_count: newStampNumber,
    last_stamp_at: new Date().toISOString(),
  };

  if (isNewCard && !card.started_at) {
    updateData.started_at = new Date().toISOString();
  }

  if (isComplete) {
    const rewardExpiresAt = new Date();
    rewardExpiresAt.setDate(rewardExpiresAt.getDate() + program.reward_validity_days);

    updateData.status = "completed";
    updateData.completed_at = new Date().toISOString();
    updateData.reward_description = program.reward_description;
    updateData.reward_type = program.reward_type;
    updateData.reward_value = program.reward_value;
    updateData.reward_expires_at = rewardExpiresAt.toISOString();
    updateData.qr_reward_token = randomUUID();
  }

  await supabase
    .from("loyalty_cards")
    .update(updateData)
    .eq("id", card.id);

  // 8. Créer reward V1 (compatibilité) si complète
  if (isComplete) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + program.reward_validity_days);

    await supabase.from("loyalty_rewards").insert({
      card_id: card.id,
      user_id: args.consumerId,
      program_id: args.programId,
      establishment_id: args.establishmentId,
      reward_code: generateRewardCode(),
      reward_type: program.reward_type,
      reward_value: program.reward_value,
      reward_description: program.reward_description,
      conditions: program.conditions,
      status: "active",
      expires_at: expiresAt.toISOString(),
    });
  }

  // 9. Contribution au scoring (+0.1 par tampon, max +2)
  void updateLoyaltyScoringContribution(args.consumerId);

  // 10. Notifications (queue)
  if (isNewCard) {
    void insertLoyaltyNotification(args.consumerId, card.id, null, "welcome", "email");
  }

  if (isComplete) {
    void insertLoyaltyNotification(args.consumerId, card.id, null, "card_complete", "email");
  } else if (newStampNumber === Math.floor(program.stamps_required / 2)) {
    void insertLoyaltyNotification(args.consumerId, card.id, null, "halfway", "push");
  } else if (newStampNumber === program.stamps_required - 1) {
    void insertLoyaltyNotification(args.consumerId, card.id, null, "almost_complete", "email");
  }

  // 11. Notifications temps réel (Phase 6)
  const programName = program.name as string;
  const estName = args.stampedByName ?? "Établissement";

  // Tampon validé → Client (in-app)
  void notifyStampValidated({
    userId: args.consumerId,
    cardId: card.id,
    stampNumber: newStampNumber,
    stampsRequired: program.stamps_required,
    programName,
    establishmentName: estName,
  });

  if (isComplete) {
    // Carte complétée — cadeau débloqué → Client (email + SMS + in-app)
    const rewardExpiresAt = new Date();
    rewardExpiresAt.setDate(rewardExpiresAt.getDate() + program.reward_validity_days);
    void notifyRewardUnlocked({
      userId: args.consumerId,
      cardId: card.id,
      programName,
      establishmentName: estName,
      rewardDescription: program.reward_description,
      rewardExpiresAt: rewardExpiresAt.toISOString(),
    });
  } else if (newStampNumber === Math.floor(program.stamps_required / 2)) {
    // Carte à mi-parcours (50%) → Client (in-app)
    void notifyCardHalfway({
      userId: args.consumerId,
      cardId: card.id,
      stampNumber: newStampNumber,
      stampsRequired: program.stamps_required,
      programName,
      establishmentName: estName,
    });
  } else if (newStampNumber === program.stamps_required - 1) {
    // Carte presque complète (1 restant) → Client (email + in-app)
    void notifyCardAlmostComplete({
      userId: args.consumerId,
      cardId: card.id,
      stampsRequired: program.stamps_required,
      programName,
      establishmentName: estName,
      rewardDescription: program.reward_description,
    });
  }

  return {
    success: true,
    card_id: card.id,
    stamp_number: newStampNumber,
    stamps_remaining: Math.max(0, program.stamps_required - newStampNumber),
    message: isComplete
      ? `Carte complète ! Cadeau débloqué : ${program.reward_description}`
      : `Tampon ${newStampNumber}/${program.stamps_required}`,
    reward_unlocked: isComplete,
  };
}

// =============================================================================
// 2.1 — TAMPON CONDITIONNEL
// =============================================================================

/**
 * Valide un tampon conditionnel avec le montant consommé.
 * Le pro a saisi le montant de l'addition du client.
 */
export async function validateConditionalStamp(args: {
  consumerId: string;
  establishmentId: string;
  programId: string;
  cardId: string;
  amountSpent: number;
  stampedByUserId: string;
  stampedByName: string | null;
}): Promise<ConditionalStampResult> {
  const supabase = getAdminSupabase();

  // 1. Fetch programme
  const { data: program } = await supabase
    .from("loyalty_programs")
    .select("*")
    .eq("id", args.programId)
    .eq("establishment_id", args.establishmentId)
    .maybeSingle();

  if (!program || !program.stamp_conditional) {
    return {
      ok: false,
      approved: false,
      card_id: args.cardId,
      amount_spent: args.amountSpent,
      minimum_required: 0,
      message: "Programme non trouvé ou non conditionnel",
    };
  }

  if (program.is_active === false || program.status !== "active") {
    return {
      ok: false,
      approved: false,
      card_id: args.cardId,
      amount_spent: args.amountSpent,
      minimum_required: program.stamp_minimum_amount ?? 0,
      message: "Programme inactif",
    };
  }

  const minimumAmount = program.stamp_minimum_amount ?? 0;

  // 2. Vérifier le montant
  if (args.amountSpent < minimumAmount) {
    // Notification refus conditionnel → Client (in-app)
    void notifyConditionalStampRefused({
      userId: args.consumerId,
      cardId: args.cardId,
      amountSpent: args.amountSpent,
      minimumRequired: minimumAmount,
      programName: program.name as string,
      establishmentName: args.stampedByName ?? "Établissement",
    });

    return {
      ok: true,
      approved: false,
      card_id: args.cardId,
      amount_spent: args.amountSpent,
      minimum_required: minimumAmount,
      message: `Montant insuffisant (${args.amountSpent} ${program.stamp_minimum_currency} saisi, minimum ${minimumAmount} ${program.stamp_minimum_currency} requis). Tampon non attribué.`,
    };
  }

  // 3. Fetch carte
  const { data: card } = await supabase
    .from("loyalty_cards")
    .select("*")
    .eq("id", args.cardId)
    .eq("user_id", args.consumerId)
    .eq("program_id", args.programId)
    .eq("status", "active")
    .maybeSingle();

  if (!card) {
    return {
      ok: false,
      approved: false,
      card_id: args.cardId,
      amount_spent: args.amountSpent,
      minimum_required: minimumAmount,
      message: "Carte non trouvée ou inactive",
    };
  }

  // 4. Vérifier fréquence
  const frequencyOk = await checkStampFrequency(
    card.id,
    args.consumerId,
    program.stamp_frequency as StampFrequency
  );
  if (!frequencyOk) {
    return {
      ok: true,
      approved: false,
      card_id: card.id,
      amount_spent: args.amountSpent,
      minimum_required: minimumAmount,
      message: "Tampon déjà attribué pour cette période",
    };
  }

  // 5. Insérer le tampon conditionnel
  const newStampNumber = card.stamps_count + 1;
  const { error: stampErr } = await supabase.from("loyalty_stamps").insert({
    card_id: card.id,
    user_id: args.consumerId,
    program_id: args.programId,
    establishment_id: args.establishmentId,
    stamp_number: newStampNumber,
    stamp_type: "conditional_validated",
    stamped_by_user_id: args.stampedByUserId,
    stamped_by_name: args.stampedByName,
    source: "scan",
    amount_spent: args.amountSpent,
  });

  if (stampErr) {
    log.error({ err: stampErr }, "Conditional stamp error");
    return {
      ok: false,
      approved: false,
      card_id: card.id,
      amount_spent: args.amountSpent,
      minimum_required: minimumAmount,
      message: "Erreur lors de l'ajout du tampon",
    };
  }

  // 6. Mettre à jour la carte
  const isComplete = newStampNumber >= program.stamps_required;
  const updateData: Record<string, unknown> = {
    stamps_count: newStampNumber,
    last_stamp_at: new Date().toISOString(),
  };

  if (isComplete) {
    const rewardExpiresAt = new Date();
    rewardExpiresAt.setDate(rewardExpiresAt.getDate() + program.reward_validity_days);

    updateData.status = "completed";
    updateData.completed_at = new Date().toISOString();
    updateData.reward_description = program.reward_description;
    updateData.reward_type = program.reward_type;
    updateData.reward_value = program.reward_value;
    updateData.reward_expires_at = rewardExpiresAt.toISOString();
    updateData.qr_reward_token = randomUUID();
  }

  await supabase
    .from("loyalty_cards")
    .update(updateData)
    .eq("id", card.id);

  // 7. Créer reward V1 si complète
  if (isComplete) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + program.reward_validity_days);

    await supabase.from("loyalty_rewards").insert({
      card_id: card.id,
      user_id: args.consumerId,
      program_id: args.programId,
      establishment_id: args.establishmentId,
      reward_code: generateRewardCode(),
      reward_type: program.reward_type,
      reward_value: program.reward_value,
      reward_description: program.reward_description,
      conditions: program.conditions,
      status: "active",
      expires_at: expiresAt.toISOString(),
    });
  }

  // 8. Scoring + notifications (queue)
  void updateLoyaltyScoringContribution(args.consumerId);

  if (isComplete) {
    void insertLoyaltyNotification(args.consumerId, card.id, null, "card_complete", "email");
  } else if (newStampNumber === Math.floor(program.stamps_required / 2)) {
    void insertLoyaltyNotification(args.consumerId, card.id, null, "halfway", "push");
  } else if (newStampNumber === program.stamps_required - 1) {
    void insertLoyaltyNotification(args.consumerId, card.id, null, "almost_complete", "email");
  }

  // 9. Notifications temps réel (Phase 6)
  const condProgramName = program.name as string;
  const condEstName = args.stampedByName ?? "Établissement";

  // Tampon validé → Client (in-app)
  void notifyStampValidated({
    userId: args.consumerId,
    cardId: card.id,
    stampNumber: newStampNumber,
    stampsRequired: program.stamps_required,
    programName: condProgramName,
    establishmentName: condEstName,
  });

  if (isComplete) {
    const condRewardExpires = new Date();
    condRewardExpires.setDate(condRewardExpires.getDate() + program.reward_validity_days);
    void notifyRewardUnlocked({
      userId: args.consumerId,
      cardId: card.id,
      programName: condProgramName,
      establishmentName: condEstName,
      rewardDescription: program.reward_description,
      rewardExpiresAt: condRewardExpires.toISOString(),
    });
  } else if (newStampNumber === Math.floor(program.stamps_required / 2)) {
    void notifyCardHalfway({
      userId: args.consumerId,
      cardId: card.id,
      stampNumber: newStampNumber,
      stampsRequired: program.stamps_required,
      programName: condProgramName,
      establishmentName: condEstName,
    });
  } else if (newStampNumber === program.stamps_required - 1) {
    void notifyCardAlmostComplete({
      userId: args.consumerId,
      cardId: card.id,
      stampsRequired: program.stamps_required,
      programName: condProgramName,
      establishmentName: condEstName,
      rewardDescription: program.reward_description,
    });
  }

  return {
    ok: true,
    approved: true,
    card_id: card.id,
    stamp_number: newStampNumber,
    stamps_remaining: Math.max(0, program.stamps_required - newStampNumber),
    amount_spent: args.amountSpent,
    minimum_required: minimumAmount,
    message: isComplete
      ? `Carte complète ! Cadeau débloqué : ${program.reward_description}`
      : `Tampon conditionnel validé (${newStampNumber}/${program.stamps_required})`,
    reward_unlocked: isComplete,
  };
}

// =============================================================================
// 2.1 — CONSOMMATION DU CADEAU FIDÉLITÉ
// =============================================================================

/**
 * Consomme le cadeau fidélité d'une carte complétée.
 * Crée une nouvelle carte si le programme est renouvelable.
 */
export async function claimLoyaltyReward(args: {
  cardId: string;
  establishmentId: string;
  claimedByUserId: string;
  claimedByName: string | null;
}): Promise<{
  ok: boolean;
  message: string;
  new_card_id?: string;
}> {
  const supabase = getAdminSupabase();

  // 1. Fetch carte avec programme
  const { data: card } = await supabase
    .from("loyalty_cards")
    .select("*, program:loyalty_programs(*)")
    .eq("id", args.cardId)
    .eq("establishment_id", args.establishmentId)
    .maybeSingle();

  if (!card) {
    return { ok: false, message: "Carte non trouvée" };
  }

  // Vérifier que la carte est complétée (reward_pending V1 ou completed V2)
  if (card.status !== "completed" && card.status !== "reward_pending") {
    return { ok: false, message: `Carte non éligible (statut: ${card.status})` };
  }

  // Vérifier expiration du cadeau
  if (card.reward_expires_at && new Date(card.reward_expires_at) < new Date()) {
    await supabase
      .from("loyalty_cards")
      .update({ status: "expired" })
      .eq("id", card.id);
    return { ok: false, message: "Cadeau expiré" };
  }

  // 2. Marquer la carte comme consommée
  await supabase
    .from("loyalty_cards")
    .update({
      status: "reward_used",
      reward_claimed_at: new Date().toISOString(),
    })
    .eq("id", card.id);

  // 3. Marquer le reward V1 comme consommé (compatibilité)
  await supabase
    .from("loyalty_rewards")
    .update({
      status: "used",
      used_at: new Date().toISOString(),
      used_by_pro_user_id: args.claimedByUserId,
      used_by_pro_name: args.claimedByName,
    })
    .eq("card_id", card.id)
    .eq("status", "active");

  // 4. Renouveler la carte si programme renouvelable
  const program = card.program as ProgramRow | null;
  let newCardId: string | undefined;

  if (program?.is_renewable) {
    const now = new Date();
    const { data: newCard } = await supabase
      .from("loyalty_cards")
      .insert({
        user_id: card.user_id,
        program_id: card.program_id,
        establishment_id: args.establishmentId,
        stamps_count: 0,
        status: "active",
        cycle_number: card.cycle_number + 1,
        previous_card_id: card.id,
        stamps_required: program.stamps_required,
        expires_at: computeCardExpiresAt(now, program.card_validity_days),
      })
      .select("id")
      .single();

    newCardId = newCard?.id;
  }

  return {
    ok: true,
    message: "Cadeau fidélité consommé avec succès !",
    new_card_id: newCardId,
  };
}

// =============================================================================
// 2.1 — GEL / DÉGEL DES CARTES
// =============================================================================

/**
 * Gèle toutes les cartes actives d'un programme (quand le pro désactive).
 */
export async function freezeCardsForProgram(programId: string): Promise<number> {
  const supabase = getAdminSupabase();

  const { data } = await supabase
    .from("loyalty_cards")
    .update({ status: "frozen" })
    .eq("program_id", programId)
    .eq("status", "active")
    .select("id");

  return data?.length ?? 0;
}

/**
 * Dégèle les cartes gelées d'un programme (quand le pro réactive).
 */
export async function unfreezeCardsForProgram(programId: string): Promise<number> {
  const supabase = getAdminSupabase();

  const { data } = await supabase
    .from("loyalty_cards")
    .update({ status: "active" })
    .eq("program_id", programId)
    .eq("status", "frozen")
    .select("id");

  return data?.length ?? 0;
}

/**
 * Change le statut d'un programme et gère le gel/dégel des cartes.
 */
export async function updateProgramStatus(args: {
  programId: string;
  establishmentId: string;
  newStatus: LoyaltyProgramStatus;
  suspendedBy?: string;
  suspendedReason?: string;
}): Promise<{ ok: boolean; frozenCount?: number; unfrozenCount?: number }> {
  const supabase = getAdminSupabase();

  const updateData: Record<string, unknown> = {
    status: args.newStatus,
    is_active: args.newStatus === "active",
  };

  if (args.newStatus === "suspended") {
    updateData.suspended_by = args.suspendedBy ?? null;
    updateData.suspended_reason = args.suspendedReason ?? null;
    updateData.suspended_at = new Date().toISOString();
  } else if (args.newStatus === "active") {
    updateData.suspended_by = null;
    updateData.suspended_reason = null;
    updateData.suspended_at = null;
  }

  const { error } = await supabase
    .from("loyalty_programs")
    .update(updateData)
    .eq("id", args.programId)
    .eq("establishment_id", args.establishmentId);

  if (error) return { ok: false };

  // Gel/dégel des cartes
  if (args.newStatus === "inactive" || args.newStatus === "suspended") {
    const frozenCount = await freezeCardsForProgram(args.programId);
    return { ok: true, frozenCount };
  } else if (args.newStatus === "active") {
    const unfrozenCount = await unfreezeCardsForProgram(args.programId);
    return { ok: true, unfrozenCount };
  }

  return { ok: true };
}

// =============================================================================
// 2.2 — SCAN QR : RÉSULTAT UNIFIÉ FIDÉLITÉ
// =============================================================================

/**
 * Récupère toutes les infos fidélité d'un client pour un établissement donné.
 * Utilisé dans l'écran de scan QR du pro pour composer l'affichage.
 */
export async function getLoyaltyInfoForScan(args: {
  consumerId: string;
  establishmentId: string;
  stampedByUserId: string;
  stampedByName: string | null;
}): Promise<ScanLoyaltyResult> {
  const supabase = getAdminSupabase();

  // 1. Programmes actifs de l'établissement
  const { data: programs } = await supabase
    .from("loyalty_programs")
    .select("*")
    .eq("establishment_id", args.establishmentId)
    .eq("is_active", true)
    .eq("status", "active");

  if (!programs || programs.length === 0) {
    return { cards: [], loyalty_rewards: [], platform_gifts: [] };
  }

  // 2. Cartes actives du client
  const { data: cards } = await supabase
    .from("loyalty_cards")
    .select("*")
    .eq("user_id", args.consumerId)
    .eq("establishment_id", args.establishmentId)
    .in("status", ["active", "completed", "reward_pending"]);

  // 3. Cadeaux fidélité à consommer
  const loyaltyRewards: ScanLoyaltyResult["loyalty_rewards"] = [];
  for (const card of cards ?? []) {
    if (
      (card.status === "completed" || card.status === "reward_pending") &&
      card.reward_expires_at &&
      new Date(card.reward_expires_at) > new Date()
    ) {
      loyaltyRewards.push({
        reward_id: card.qr_reward_token ?? card.id,
        card_id: card.id,
        description: card.reward_description ?? "Cadeau fidélité",
        reward_type: card.reward_type ?? "custom",
        reward_value: card.reward_value,
        expires_at: card.reward_expires_at,
      });
    }
  }

  // 4. Cadeaux sam.ma
  const { data: giftDistributions } = await supabase
    .from("platform_gift_distributions")
    .select("*, gift:platform_gifts(*, establishment:establishments(name))")
    .eq("user_id", args.consumerId)
    .eq("status", "distributed")
    .gt("expires_at", new Date().toISOString());

  const platformGifts: ScanLoyaltyResult["platform_gifts"] = (
    giftDistributions ?? []
  )
    .filter((d) => {
      const gift = d.gift as { establishment_id: string } | null;
      return gift && (gift as Record<string, unknown>).establishment_id === args.establishmentId;
    })
    .map((d) => {
      const gift = d.gift as {
        description: string;
        gift_type: string;
        value: number;
        establishment: { name: string } | null;
      };
      return {
        distribution_id: d.id,
        gift_description: gift.description,
        gift_type: gift.gift_type as ScanLoyaltyResult["platform_gifts"][0]["gift_type"],
        gift_value: gift.value,
        establishment_name:
          gift.establishment?.name ?? "Établissement",
        expires_at: d.expires_at,
      };
    });

  // 5. Construire les cartes pour l'affichage
  const cardResults: ScanLoyaltyResult["cards"] = [];
  let autoStampResult: ScanLoyaltyResult["auto_stamp_result"] = null;

  for (const program of programs) {
    const existingCard = (cards ?? []).find(
      (c) => c.program_id === program.id && c.status === "active"
    );

    if (existingCard) {
      cardResults.push({
        card_id: existingCard.id,
        program_name: program.name,
        stamps_collected: existingCard.stamps_count,
        stamps_required: program.stamps_required,
        status: existingCard.status as LoyaltyCardStatusV2,
        is_conditional: !!program.stamp_conditional,
        minimum_amount: program.stamp_minimum_amount,
      });

      // Auto-stamp si non conditionnel
      if (!program.stamp_conditional && !autoStampResult) {
        const result = await addAutomaticStamp({
          consumerId: args.consumerId,
          establishmentId: args.establishmentId,
          programId: program.id,
          stampedByUserId: args.stampedByUserId,
          stampedByName: args.stampedByName,
        });

        if (result) {
          autoStampResult = result;
          // Mettre à jour les infos de la carte dans les résultats
          const idx = cardResults.length - 1;
          cardResults[idx].stamps_collected = result.stamp_number;
        }
      }
    } else {
      // Pas de carte active → le scan va en créer une (si non conditionnel)
      if (!program.stamp_conditional && !autoStampResult) {
        const result = await addAutomaticStamp({
          consumerId: args.consumerId,
          establishmentId: args.establishmentId,
          programId: program.id,
          stampedByUserId: args.stampedByUserId,
          stampedByName: args.stampedByName,
        });

        if (result) {
          autoStampResult = result;
          cardResults.push({
            card_id: result.card_id,
            program_name: program.name,
            stamps_collected: result.stamp_number,
            stamps_required: program.stamps_required,
            status: result.reward_unlocked ? "completed" : "active",
            is_conditional: false,
            minimum_amount: null,
          });
        }
      } else if (program.stamp_conditional) {
        // Carte conditionnelle pas encore créée — afficher quand même pour le pro
        cardResults.push({
          card_id: "",
          program_name: program.name,
          stamps_collected: 0,
          stamps_required: program.stamps_required,
          status: "active",
          is_conditional: true,
          minimum_amount: program.stamp_minimum_amount,
        });
      }
    }
  }

  return {
    cards: cardResults,
    loyalty_rewards: loyaltyRewards,
    platform_gifts: platformGifts,
    auto_stamp_result: autoStampResult,
  };
}

// =============================================================================
// 2.5 — CONTRIBUTION AU SCORING CLIENT
// =============================================================================

/**
 * Met à jour la contribution fidélité au score client.
 * +0.1 par tampon, plafonné à +2 points max.
 */
async function updateLoyaltyScoringContribution(userId: string): Promise<void> {
  try {
    const supabase = getAdminSupabase();

    // Compter tous les tampons validés du client
    const { count } = await supabase
      .from("loyalty_stamps")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    const totalStamps = count ?? 0;
    const POINTS_PER_STAMP = 0.1;
    const MAX_LOYALTY_POINTS = 2;
    const loyaltyPoints = Math.min(totalStamps * POINTS_PER_STAMP, MAX_LOYALTY_POINTS);

    // Mettre à jour consumer_user_stats si la table existe
    await supabase
      .from("consumer_user_stats")
      .upsert(
        {
          user_id: userId,
          loyalty_stamps_count: totalStamps,
          loyalty_score_contribution: loyaltyPoints,
        },
        { onConflict: "user_id" }
      );
  } catch (err) {
    log.error({ err }, "Scoring update error");
  }
}

// =============================================================================
// 2.6 — BADGE "CLIENT FIDÈLE"
// =============================================================================

/**
 * Vérifie si un client est éligible au badge "Client fidèle" pour un établissement.
 * Condition : a complété au moins une carte chez cet établissement.
 */
export async function isLoyalCustomer(
  userId: string,
  establishmentId: string
): Promise<boolean> {
  const supabase = getAdminSupabase();

  const { count } = await supabase
    .from("loyalty_cards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("establishment_id", establishmentId)
    .in("status", ["completed", "reward_pending", "reward_used"]);

  return (count ?? 0) > 0;
}

// =============================================================================
// HELPERS INTERNES
// =============================================================================

/**
 * Vérifie si la fréquence de tamponnage est respectée.
 */
async function checkStampFrequency(
  cardId: string,
  userId: string,
  frequency: StampFrequency
): Promise<boolean> {
  if (frequency === "unlimited") return true;

  const supabase = getAdminSupabase();
  const now = new Date();

  let since: string;
  if (frequency === "once_per_day") {
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  } else {
    // once_per_week — début de la semaine (lundi)
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1; // 0=dim → 6 jours en arrière
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    monday.setHours(0, 0, 0, 0);
    since = monday.toISOString();
  }

  const { count } = await supabase
    .from("loyalty_stamps")
    .select("id", { count: "exact", head: true })
    .eq("card_id", cardId)
    .eq("user_id", userId)
    .gte("created_at", since);

  return (count ?? 0) === 0;
}

/**
 * Insère une notification fidélité (best-effort).
 */
async function insertLoyaltyNotification(
  userId: string,
  cardId: string | null,
  rewardId: string | null,
  type: string,
  channel: string
): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    await supabase.from("loyalty_notifications").insert({
      user_id: userId,
      card_id: cardId,
      reward_id: rewardId,
      notification_type: type,
      channel,
      status: "pending",
    });
  } catch (err) {
    log.warn({ err }, "Best-effort: loyalty notification insert failed");
  }
}
