// =============================================================================
// SAM Ambassador Program — Cron Jobs
// Expirations conversions, expirations récompenses, rappels candidatures
// =============================================================================

import { createModuleLogger } from "./lib/logger";
import { getAdminSupabase } from "./supabaseAdmin";
import { sendPushToProUser } from "./pushNotifications";

const log = createModuleLogger("ambassadorCron");

// =============================================================================
// CRON JOB 1 — Expiration des conversions pending > 48h
// =============================================================================

export async function expirePendingConversions(): Promise<{
  processed: number;
  message: string;
}> {
  const supabase = getAdminSupabase();

  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 48);

  const { data, error } = await supabase
    .from("post_conversions")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("created_at", cutoff.toISOString())
    .select("id");

  if (error) {
    log.error({ error }, "expirePendingConversions DB error");
    throw error;
  }

  const processed = data?.length ?? 0;
  log.info({ processed }, "expirePendingConversions completed");

  return {
    processed,
    message: `${processed} conversion(s) pending expirée(s)`,
  };
}

// =============================================================================
// CRON JOB 2 — Expiration des récompenses actives dépassées
// =============================================================================

export async function expireActiveRewards(): Promise<{
  processed: number;
  message: string;
}> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("ambassador_rewards")
    .update({ status: "expired" })
    .eq("status", "active")
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error) {
    log.error({ error }, "expireActiveRewards DB error");
    throw error;
  }

  const processed = data?.length ?? 0;
  log.info({ processed }, "expireActiveRewards completed");

  return {
    processed,
    message: `${processed} récompense(s) ambassadeur expirée(s)`,
  };
}

// =============================================================================
// CRON JOB 3 — Rappel candidatures pending > 48h aux pros
// =============================================================================

export async function remindPendingApplications(): Promise<{
  processed: number;
  message: string;
}> {
  const supabase = getAdminSupabase();

  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 48);

  // Candidatures pending depuis plus de 48h
  const { data: applications, error: fetchErr } = await supabase
    .from("ambassador_applications")
    .select("id, program_id, user_id, establishment_id")
    .eq("status", "pending")
    .lt("applied_at", cutoff.toISOString());

  if (fetchErr) {
    log.error({ error: fetchErr }, "remindPendingApplications fetch error");
    throw fetchErr;
  }

  if (!applications || applications.length === 0) {
    return { processed: 0, message: "Aucune candidature en attente > 48h" };
  }

  let processed = 0;

  for (const app of applications) {
    try {
      // Récupérer le username du candidat
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", app.user_id)
        .maybeSingle();

      const username = profile?.username ?? "un utilisateur";

      // Récupérer les propriétaires de l'établissement
      const { data: memberships } = await supabase
        .from("pro_establishment_memberships")
        .select("user_id")
        .eq("establishment_id", app.establishment_id)
        .eq("status", "active");

      if (!memberships || memberships.length === 0) continue;

      // Envoyer une notification push à chaque propriétaire
      for (const membership of memberships) {
        try {
          await sendPushToProUser({
            userId: membership.user_id,
            title: "Candidature ambassadeur en attente",
            body: `Candidature en attente depuis 48h de @${username}`,
            data: {
              type: "ambassador_application_reminder",
              applicationId: app.id,
              establishmentId: app.establishment_id,
            },
          });
        } catch (pushErr) {
          log.warn(
            { err: pushErr, userId: membership.user_id },
            "Failed to send reminder push"
          );
        }
      }

      processed++;
    } catch (err) {
      log.warn({ err, applicationId: app.id }, "Error processing application reminder");
    }
  }

  log.info({ processed, total: applications.length }, "remindPendingApplications completed");

  return {
    processed,
    message: `${processed} rappel(s) candidature envoyé(s)`,
  };
}

// =============================================================================
// MASTER RUNNER — Exécute les 3 jobs séquentiellement
// =============================================================================

export async function runAllAmbassadorCronJobs(): Promise<{
  results: {
    expire_conversions: { processed: number; message: string; error?: string };
    expire_rewards: { processed: number; message: string; error?: string };
    remind_applications: { processed: number; message: string; error?: string };
  };
}> {
  const results = {
    expire_conversions: { processed: 0, message: "", error: undefined as string | undefined },
    expire_rewards: { processed: 0, message: "", error: undefined as string | undefined },
    remind_applications: { processed: 0, message: "", error: undefined as string | undefined },
  };

  // 1. Expire pending conversions
  try {
    const r = await expirePendingConversions();
    results.expire_conversions = { ...r, error: undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.expire_conversions = { processed: 0, message: "Erreur", error: msg };
    log.error({ err }, "runAll: expirePendingConversions error");
  }

  // 2. Expire active rewards
  try {
    const r = await expireActiveRewards();
    results.expire_rewards = { ...r, error: undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.expire_rewards = { processed: 0, message: "Erreur", error: msg };
    log.error({ err }, "runAll: expireActiveRewards error");
  }

  // 3. Remind pending applications
  try {
    const r = await remindPendingApplications();
    results.remind_applications = { ...r, error: undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.remind_applications = { processed: 0, message: "Erreur", error: msg };
    log.error({ err }, "runAll: remindPendingApplications error");
  }

  log.info({ results }, "runAllAmbassadorCronJobs completed");

  return { results };
}
