// =============================================================================
// SAM LOYALTY V2 — Détection Anti-Fraude
// Alertes : suspicious_stamping, abnormal_frequency, high_value_reward,
//           suspicious_amount_pattern, program_created
// =============================================================================

import { getAdminSupabase } from "./supabaseAdmin";
import { LOYALTY_FRAUD_THRESHOLDS } from "../shared/loyaltyTypesV2";
import { emitAdminNotification } from "./adminNotifications";

// =============================================================================
// 2.3a — DÉTECTION DE TAMPONNAGE SUSPECT (côté client)
// =============================================================================

/**
 * Vérifie si un client a reçu trop de tampons en peu de temps.
 * Appelé après chaque ajout de tampon.
 * Seuil : max_stamps_in_period tampons en suspicious_period_days jours.
 */
export async function detectSuspiciousStamping(args: {
  userId: string;
  establishmentId: string;
  programId: string;
}): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    const threshold = LOYALTY_FRAUD_THRESHOLDS.max_stamps_in_period;
    const periodDays = LOYALTY_FRAUD_THRESHOLDS.suspicious_period_days;

    const since = new Date();
    since.setDate(since.getDate() - periodDays);

    const { count } = await supabase
      .from("loyalty_stamps")
      .select("id", { count: "exact", head: true })
      .eq("user_id", args.userId)
      .eq("establishment_id", args.establishmentId)
      .gte("created_at", since.toISOString());

    if ((count ?? 0) <= threshold) return;

    // Vérifier qu'une alerte n'existe pas déjà récemment
    const recentAlertCutoff = new Date();
    recentAlertCutoff.setDate(recentAlertCutoff.getDate() - 7);

    const { data: existingAlert } = await supabase
      .from("loyalty_alerts")
      .select("id")
      .eq("alert_type", "suspicious_stamping")
      .eq("establishment_id", args.establishmentId)
      .eq("user_id", args.userId)
      .gte("created_at", recentAlertCutoff.toISOString())
      .maybeSingle();

    if (existingAlert) return; // Alerte déjà créée récemment

    await supabase.from("loyalty_alerts").insert({
      alert_type: "suspicious_stamping",
      establishment_id: args.establishmentId,
      user_id: args.userId,
      program_id: args.programId,
      details: `Client a reçu ${count} tampons en ${periodDays} jours (seuil: ${threshold})`,
      metadata: {
        stamps_count: count,
        period_days: periodDays,
        threshold,
      },
      status: "pending",
    });

    // Notification admin
    void notifyAdminAlert(
      "suspicious_stamping",
      `Tamponnage suspect détecté : ${count} tampons en ${periodDays} jours`
    );
  } catch (err) {
    console.error("[fraudDetection] detectSuspiciousStamping error:", err);
  }
}

// =============================================================================
// 2.3b — DÉTECTION FRÉQUENCE ANORMALE (côté pro)
// =============================================================================

/**
 * Détecte si un pro tamponne massivement sans réservations associées.
 * Seuil : stamps_without_reservation_threshold tampons sans résas.
 * Exécuté par cron quotidien.
 */
export async function detectAbnormalFrequency(): Promise<{
  alerts_created: number;
}> {
  const supabase = getAdminSupabase();
  const threshold = LOYALTY_FRAUD_THRESHOLDS.stamps_without_reservation_threshold;
  let alertsCreated = 0;

  // Dernières 24h
  const since = new Date();
  since.setDate(since.getDate() - 1);

  // Compter les tampons par établissement sans reservation_id
  const { data: stampsByEstablishment } = await supabase
    .from("loyalty_stamps")
    .select("establishment_id, stamped_by_user_id")
    .is("reservation_id", null)
    .gte("created_at", since.toISOString());

  if (!stampsByEstablishment || stampsByEstablishment.length === 0) {
    return { alerts_created: 0 };
  }

  // Grouper par établissement + pro
  const counts = new Map<string, { count: number; proUserId: string }>();
  for (const stamp of stampsByEstablishment) {
    const key = `${stamp.establishment_id}::${stamp.stamped_by_user_id}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, {
        count: 1,
        proUserId: stamp.stamped_by_user_id ?? "",
      });
    }
  }

  for (const [key, { count, proUserId }] of counts) {
    if (count < threshold) continue;

    const establishmentId = key.split("::")[0];

    // Vérifier qu'une alerte récente n'existe pas
    const recentAlertCutoff = new Date();
    recentAlertCutoff.setDate(recentAlertCutoff.getDate() - 7);

    const { data: existing } = await supabase
      .from("loyalty_alerts")
      .select("id")
      .eq("alert_type", "abnormal_frequency")
      .eq("establishment_id", establishmentId)
      .gte("created_at", recentAlertCutoff.toISOString())
      .maybeSingle();

    if (existing) continue;

    await supabase.from("loyalty_alerts").insert({
      alert_type: "abnormal_frequency",
      establishment_id: establishmentId,
      user_id: proUserId || null,
      details: `Pro a tamponné ${count} fois en 24h sans réservations associées (seuil: ${threshold})`,
      metadata: {
        stamps_count: count,
        pro_user_id: proUserId,
        period: "24h",
      },
      status: "pending",
    });

    alertsCreated++;
  }

  return { alerts_created: alertsCreated };
}

// =============================================================================
// 2.3c — DÉTECTION CADEAU HAUTE VALEUR
// =============================================================================

/**
 * Vérifie si un programme a un cadeau de haute valeur.
 * Appelé à la création/modification du programme.
 */
export async function detectHighValueReward(args: {
  programId: string;
  establishmentId: string;
  rewardDescription: string;
  rewardValue: string | null;
}): Promise<void> {
  try {
    const threshold = LOYALTY_FRAUD_THRESHOLDS.high_value_reward_threshold;
    const numericValue = args.rewardValue ? parseFloat(args.rewardValue) : 0;

    if (numericValue <= threshold) return;

    const supabase = getAdminSupabase();

    await supabase.from("loyalty_alerts").insert({
      alert_type: "high_value_reward",
      establishment_id: args.establishmentId,
      program_id: args.programId,
      details: `Programme avec cadeau haute valeur : ${numericValue} MAD — "${args.rewardDescription}"`,
      metadata: {
        program_id: args.programId,
        reward_value: numericValue,
        reward_description: args.rewardDescription,
      },
      status: "pending",
    });

    void notifyAdminAlert(
      "high_value_reward",
      `Cadeau haute valeur détecté : ${numericValue} MAD`
    );
  } catch (err) {
    console.error("[fraudDetection] detectHighValueReward error:", err);
  }
}

// =============================================================================
// 2.3d — DÉTECTION PATTERN DE MONTANTS SUSPECTS
// =============================================================================

/**
 * Détecte si un pro saisit systématiquement le montant minimum exact
 * pour les tampons conditionnels (indique une validation sans vérification).
 * Exécuté par cron quotidien.
 */
export async function detectSuspiciousAmountPattern(): Promise<{
  alerts_created: number;
}> {
  const supabase = getAdminSupabase();
  const tolerancePercent = LOYALTY_FRAUD_THRESHOLDS.amount_pattern_tolerance_percent;
  const minSamples = LOYALTY_FRAUD_THRESHOLDS.amount_pattern_min_samples;
  let alertsCreated = 0;

  // Programmes conditionnels actifs
  const { data: programs } = await supabase
    .from("loyalty_programs")
    .select("id, establishment_id, name, stamp_minimum_amount")
    .eq("stamp_conditional", true)
    .eq("is_active", true)
    .not("stamp_minimum_amount", "is", null);

  if (!programs || programs.length === 0) return { alerts_created: 0 };

  for (const program of programs) {
    const minAmount = program.stamp_minimum_amount as number;
    if (!minAmount || minAmount <= 0) continue;

    // Derniers 30 jours de tampons conditionnels
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data: stamps } = await supabase
      .from("loyalty_stamps")
      .select("amount_spent, stamped_by_user_id")
      .eq("program_id", program.id)
      .eq("stamp_type", "conditional_validated")
      .not("amount_spent", "is", null)
      .gte("created_at", since.toISOString());

    if (!stamps || stamps.length < minSamples) continue;

    // Grouper par pro
    const proStamps = new Map<string, number[]>();
    for (const stamp of stamps) {
      const proId = stamp.stamped_by_user_id ?? "unknown";
      const amounts = proStamps.get(proId) ?? [];
      amounts.push(stamp.amount_spent as number);
      proStamps.set(proId, amounts);
    }

    for (const [proId, amounts] of proStamps) {
      if (amounts.length < minSamples) continue;

      // Calculer combien de montants sont dans la tolérance du minimum
      const tolerance = minAmount * (tolerancePercent / 100);
      const suspiciousCount = amounts.filter(
        (a) => Math.abs(a - minAmount) <= tolerance
      ).length;

      const suspiciousRatio = suspiciousCount / amounts.length;

      // Si > 80% des montants sont pile le minimum → alerte
      if (suspiciousRatio < 0.8) continue;

      // Vérifier alerte récente
      const recentAlertCutoff = new Date();
      recentAlertCutoff.setDate(recentAlertCutoff.getDate() - 30);

      const { data: existing } = await supabase
        .from("loyalty_alerts")
        .select("id")
        .eq("alert_type", "suspicious_amount_pattern")
        .eq("establishment_id", program.establishment_id)
        .gte("created_at", recentAlertCutoff.toISOString())
        .maybeSingle();

      if (existing) continue;

      await supabase.from("loyalty_alerts").insert({
        alert_type: "suspicious_amount_pattern",
        establishment_id: program.establishment_id,
        user_id: proId !== "unknown" ? proId : null,
        program_id: program.id,
        details: `Pro saisit systématiquement le montant minimum exact (${minAmount} MAD) pour le programme "${program.name}". ${suspiciousCount}/${amounts.length} tampons (${Math.round(suspiciousRatio * 100)}%) dans la tolérance de ${tolerancePercent}%.`,
        metadata: {
          program_id: program.id,
          program_name: program.name,
          minimum_amount: minAmount,
          total_stamps: amounts.length,
          suspicious_stamps: suspiciousCount,
          suspicious_ratio: suspiciousRatio,
          tolerance_percent: tolerancePercent,
          pro_user_id: proId,
        },
        status: "pending",
      });

      alertsCreated++;
    }
  }

  return { alerts_created: alertsCreated };
}

// =============================================================================
// 2.3e — ALERTE CRÉATION DE PROGRAMME
// =============================================================================

/**
 * Crée une alerte informative quand un nouveau programme est créé.
 */
export async function alertProgramCreated(args: {
  programId: string;
  establishmentId: string;
  programName: string;
  createdBy: string;
}): Promise<void> {
  try {
    const supabase = getAdminSupabase();

    await supabase.from("loyalty_alerts").insert({
      alert_type: "program_created",
      establishment_id: args.establishmentId,
      user_id: args.createdBy,
      program_id: args.programId,
      details: `Nouveau programme de fidélité créé : "${args.programName}"`,
      metadata: {
        program_id: args.programId,
        program_name: args.programName,
        created_by: args.createdBy,
      },
      status: "pending",
    });

    void notifyAdminAlert(
      "program_created",
      `Nouveau programme fidélité : "${args.programName}"`
    );
  } catch (err) {
    console.error("[fraudDetection] alertProgramCreated error:", err);
  }
}

// =============================================================================
// ADMIN — GESTION DES ALERTES
// =============================================================================

export async function getAlerts(filters?: {
  status?: string;
  alertType?: string;
  establishmentId?: string;
  limit?: number;
}): Promise<unknown[]> {
  const supabase = getAdminSupabase();

  let query = supabase
    .from("loyalty_alerts")
    .select("*, establishment:establishments(id, name)")
    .order("created_at", { ascending: false })
    .limit(filters?.limit ?? 50);

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.alertType) query = query.eq("alert_type", filters.alertType);
  if (filters?.establishmentId)
    query = query.eq("establishment_id", filters.establishmentId);

  const { data } = await query;
  return data ?? [];
}

export async function reviewAlert(args: {
  alertId: string;
  reviewedBy: string;
  reviewNotes?: string;
}): Promise<{ ok: boolean }> {
  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("loyalty_alerts")
    .update({
      status: "reviewed",
      reviewed_by: args.reviewedBy,
      reviewed_at: new Date().toISOString(),
      review_notes: args.reviewNotes ?? null,
    })
    .eq("id", args.alertId);

  return { ok: !error };
}

export async function dismissAlert(args: {
  alertId: string;
  reviewedBy: string;
  reviewNotes?: string;
}): Promise<{ ok: boolean }> {
  const supabase = getAdminSupabase();

  const { error } = await supabase
    .from("loyalty_alerts")
    .update({
      status: "dismissed",
      reviewed_by: args.reviewedBy,
      reviewed_at: new Date().toISOString(),
      review_notes: args.reviewNotes ?? null,
    })
    .eq("id", args.alertId);

  return { ok: !error };
}

// =============================================================================
// HELPER INTERNE
// =============================================================================

async function notifyAdminAlert(type: string, message: string): Promise<void> {
  try {
    await emitAdminNotification({
      type: `loyalty_alert_${type}`,
      title: "Alerte Fidélité",
      body: message,
      data: { alert_type: type },
    });
  } catch {
    // best-effort
  }
}
