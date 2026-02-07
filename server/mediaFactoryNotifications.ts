/**
 * MEDIA FACTORY Email Notifications
 *
 * Sends workflow notifications for:
 * - Brief submitted (to RC/Admin)
 * - Brief approved (to PRO)
 * - Slot selected / Appointment confirmed (to Admin + Partner)
 * - Deliverable uploaded (to Admin)
 * - Deliverable approved/rejected (to Partner)
 * - Invoice request submitted (to Compta)
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { sendLoggedEmail } from "./emailService";

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// Admin RC email (from environment or hardcoded fallback)
const RC_EMAIL =
  process.env.MEDIA_FACTORY_RC_EMAIL || "production@sortiraumaroc.ma";
const COMPTA_EMAIL =
  process.env.MEDIA_FACTORY_COMPTA_EMAIL || "compta@sortiraumaroc.ma";

type NotifyResult = { ok: true } | { ok: false; error: string };

async function getJobContext(jobId: string): Promise<{
  job: any;
  establishment: any;
  proEmail: string | null;
} | null> {
  const supabase = getAdminSupabase();

  const { data: job, error: jErr } = await supabase
    .from("media_jobs")
    .select("*, establishments(id, name, city)")
    .eq("id", jobId)
    .maybeSingle();

  if (jErr || !job) return null;

  const establishment = (job as any).establishments ?? {};

  // Get PRO owner email
  let proEmail: string | null = null;
  const { data: membership } = await supabase
    .from("pro_establishment_memberships")
    .select("user_id")
    .eq("establishment_id", establishment.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (membership?.user_id) {
    const { data: authUser } = await supabase.auth.admin.getUserById(
      membership.user_id,
    );
    proEmail = authUser?.user?.email ?? null;
  }

  return { job, establishment, proEmail };
}

async function getPartnerEmail(partnerUserId: string): Promise<string | null> {
  const supabase = getAdminSupabase();
  const { data } = await supabase.auth.admin.getUserById(partnerUserId);
  return data?.user?.email ?? null;
}

/**
 * Notify RC when a PRO submits their brief
 */
export async function notifyBriefSubmitted(args: {
  jobId: string;
}): Promise<NotifyResult> {
  try {
    const ctx = await getJobContext(args.jobId);
    if (!ctx) return { ok: false, error: "job_not_found" };

    const { job, establishment } = ctx;

    await sendLoggedEmail({
      emailId: `mf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromKey: "noreply",
      to: [RC_EMAIL],
      subject: `[MEDIA FACTORY] Brief soumis - ${establishment.name || "Établissement"}`,
      bodyText: `
Un nouveau brief a été soumis et attend votre validation.

**Établissement**: ${establishment.name || "—"} (${establishment.city || ""})
**Job**: ${job.title || "(sans titre)"}
**ID Job**: ${job.id}

Connectez-vous à l'interface admin pour valider le brief et proposer des créneaux de shooting.
      `.trim(),
      ctaLabel: "Voir le job",
      ctaUrl: `https://sortiraumaroc.ma/admin/production-media/${encodeURIComponent(job.id)}`,
      meta: { event: "media_factory.brief_submitted", job_id: job.id },
    });

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "notification_error",
    };
  }
}

/**
 * Notify PRO when their brief is approved
 */
export async function notifyBriefApproved(args: {
  jobId: string;
}): Promise<NotifyResult> {
  try {
    const ctx = await getJobContext(args.jobId);
    if (!ctx) return { ok: false, error: "job_not_found" };

    const { job, establishment, proEmail } = ctx;
    if (!proEmail) return { ok: false, error: "pro_email_not_found" };

    await sendLoggedEmail({
      emailId: `mf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromKey: "noreply",
      to: [proEmail],
      subject: `[MEDIA FACTORY] Brief validé - ${establishment.name || "Votre établissement"}`,
      bodyText: `
Votre brief de production a été validé par notre équipe !

**Établissement**: ${establishment.name || "—"}
**Job**: ${job.title || "(sans titre)"}

Vous pouvez maintenant choisir un créneau de shooting parmi ceux proposés.
Connectez-vous à votre espace PRO pour sélectionner votre date.
      `.trim(),
      ctaLabel: "Choisir un créneau",
      ctaUrl: `https://sortiraumaroc.ma/pro?tab=media`,
      meta: { event: "media_factory.brief_approved", job_id: job.id },
    });

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "notification_error",
    };
  }
}

/**
 * Notify Admin + assigned partners when a slot is selected
 */
export async function notifyAppointmentConfirmed(args: {
  jobId: string;
  slotId: string;
  startsAt: string;
  endsAt: string;
  location?: string | null;
}): Promise<NotifyResult> {
  try {
    const ctx = await getJobContext(args.jobId);
    if (!ctx) return { ok: false, error: "job_not_found" };

    const { job, establishment } = ctx;
    const supabase = getAdminSupabase();

    // Get assigned partners for this job
    const { data: deliverables } = await supabase
      .from("media_deliverables")
      .select("assigned_partner_user_id")
      .eq("job_id", args.jobId)
      .not("assigned_partner_user_id", "is", null);

    const partnerUserIds = [
      ...new Set(
        (deliverables ?? [])
          .map((d: any) => d.assigned_partner_user_id)
          .filter(Boolean),
      ),
    ];

    const partnerEmails: string[] = [];
    for (const uid of partnerUserIds) {
      const email = await getPartnerEmail(uid);
      if (email) partnerEmails.push(email);
    }

    const recipients = [RC_EMAIL, ...partnerEmails];

    const formatDate = (iso: string) => {
      try {
        return new Date(iso).toLocaleString("fr-FR", {
          dateStyle: "full",
          timeStyle: "short",
        });
      } catch {
        return iso;
      }
    };

    await sendLoggedEmail({
      emailId: `mf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromKey: "noreply",
      to: recipients,
      subject: `[MEDIA FACTORY] RDV confirmé - ${establishment.name || "Établissement"}`,
      bodyText: `
Un rendez-vous de shooting a été confirmé.

**Établissement**: ${establishment.name || "—"} (${establishment.city || ""})
**Job**: ${job.title || "(sans titre)"}
**Date**: ${formatDate(args.startsAt)} → ${formatDate(args.endsAt)}
**Lieu**: ${args.location || "Voir détails du job"}

Préparez-vous pour le shooting !
      `.trim(),
      ctaLabel: "Voir les détails",
      ctaUrl: `https://sortiraumaroc.ma/admin/production-media/${encodeURIComponent(job.id)}`,
      meta: {
        event: "media_factory.appointment_confirmed",
        job_id: job.id,
        slot_id: args.slotId,
      },
    });

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "notification_error",
    };
  }
}

/**
 * Notify Admin when a partner uploads a deliverable
 */
export async function notifyDeliverableUploaded(args: {
  jobId: string;
  deliverableId: string;
  role: string;
  version: number;
}): Promise<NotifyResult> {
  try {
    const ctx = await getJobContext(args.jobId);
    if (!ctx) return { ok: false, error: "job_not_found" };

    const { job, establishment } = ctx;

    await sendLoggedEmail({
      emailId: `mf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromKey: "noreply",
      to: [RC_EMAIL],
      subject: `[MEDIA FACTORY] Livrable uploadé (v${args.version}) - ${establishment.name || "Établissement"}`,
      bodyText: `
Un nouveau livrable a été uploadé par un partenaire.

**Établissement**: ${establishment.name || "—"}
**Job**: ${job.title || "(sans titre)"}
**Rôle**: ${args.role}
**Version**: v${args.version}

Connectez-vous pour valider ou demander des modifications.
      `.trim(),
      ctaLabel: "Valider le livrable",
      ctaUrl: `https://sortiraumaroc.ma/admin/production-media/${encodeURIComponent(job.id)}`,
      meta: {
        event: "media_factory.deliverable_uploaded",
        job_id: job.id,
        deliverable_id: args.deliverableId,
      },
    });

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "notification_error",
    };
  }
}

/**
 * Notify Partner when their deliverable is reviewed
 */
export async function notifyDeliverableReviewed(args: {
  jobId: string;
  deliverableId: string;
  partnerUserId: string;
  role: string;
  status: "approved" | "rejected" | "in_review";
  comment?: string | null;
}): Promise<NotifyResult> {
  try {
    const ctx = await getJobContext(args.jobId);
    if (!ctx) return { ok: false, error: "job_not_found" };

    const { job, establishment } = ctx;

    const partnerEmail = await getPartnerEmail(args.partnerUserId);
    if (!partnerEmail) return { ok: false, error: "partner_email_not_found" };

    const statusText =
      args.status === "approved"
        ? "APPROUVÉ ✅"
        : args.status === "rejected"
          ? "REFUSÉ ❌"
          : "En revue 🔄";
    const emoji =
      args.status === "approved"
        ? "🎉"
        : args.status === "rejected"
          ? "⚠️"
          : "ℹ️";

    await sendLoggedEmail({
      emailId: `mf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromKey: "noreply",
      to: [partnerEmail],
      subject: `[MEDIA FACTORY] Livrable ${statusText} - ${establishment.name || "Mission"}`,
      bodyText: `
${emoji} Votre livrable a été examiné.

**Établissement**: ${establishment.name || "—"}
**Job**: ${job.title || "(sans titre)"}
**Rôle**: ${args.role}
**Statut**: ${statusText}
${args.comment ? `**Commentaire**: ${args.comment}` : ""}

${args.status === "approved" ? "Félicitations ! Vous pouvez maintenant demander votre facturation." : ""}
${args.status === "rejected" ? "Veuillez corriger et soumettre une nouvelle version." : ""}
      `.trim(),
      ctaLabel:
        args.status === "approved" ? "Demander facturation" : "Voir la mission",
      ctaUrl: "https://sortiraumaroc.ma/partner",
      meta: {
        event: "media_factory.deliverable_reviewed",
        job_id: job.id,
        deliverable_id: args.deliverableId,
        status: args.status,
      },
    });

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "notification_error",
    };
  }
}

/**
 * Notify Compta when a partner requests an invoice
 */
export async function notifyInvoiceRequested(args: {
  jobId: string;
  partnerUserId: string;
  role: string;
  amountCents: number;
  currency: string;
}): Promise<NotifyResult> {
  try {
    const ctx = await getJobContext(args.jobId);
    if (!ctx) return { ok: false, error: "job_not_found" };

    const { job, establishment } = ctx;

    const supabase = getAdminSupabase();
    const { data: profile } = await supabase
      .from("partner_profiles")
      .select("display_name")
      .eq("user_id", args.partnerUserId)
      .maybeSingle();

    const partnerName =
      (profile as any)?.display_name || args.partnerUserId.slice(0, 8);
    const amount = (args.amountCents / 100).toFixed(2);

    await sendLoggedEmail({
      emailId: `mf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromKey: "noreply",
      to: [COMPTA_EMAIL],
      subject: `[MEDIA FACTORY] Demande facture partenaire - ${amount} ${args.currency}`,
      bodyText: `
Une demande de facturation partenaire a été soumise.

**Partenaire**: ${partnerName}
**Rôle**: ${args.role}
**Montant**: ${amount} ${args.currency}
**Établissement**: ${establishment.name || "—"}
**Job**: ${job.title || "(sans titre)"}

Connectez-vous à l'interface Compta pour valider et émettre le paiement.
      `.trim(),
      ctaLabel: "Voir les demandes",
      ctaUrl: "https://sortiraumaroc.ma/admin/production-media/compta",
      meta: {
        event: "media_factory.invoice_requested",
        job_id: job.id,
        partner_user_id: args.partnerUserId,
        role: args.role,
      },
    });

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "notification_error",
    };
  }
}

/**
 * Notify PRO when all deliverables are approved and job is ready
 */
export async function notifyJobDelivered(args: {
  jobId: string;
}): Promise<NotifyResult> {
  try {
    const ctx = await getJobContext(args.jobId);
    if (!ctx) return { ok: false, error: "job_not_found" };

    const { job, establishment, proEmail } = ctx;
    if (!proEmail) return { ok: false, error: "pro_email_not_found" };

    await sendLoggedEmail({
      emailId: `mf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromKey: "noreply",
      to: [proEmail],
      subject: `[MEDIA FACTORY] 🎬 Votre production est prête ! - ${establishment.name || "Votre établissement"}`,
      bodyText: `
Excellente nouvelle ! Votre production média est terminée.

**Établissement**: ${establishment.name || "—"}
**Job**: ${job.title || "(sans titre)"}

Tous les livrables ont été validés. Vous pouvez les retrouver dans votre espace PRO.
Merci pour votre confiance !
      `.trim(),
      ctaLabel: "Voir mes livrables",
      ctaUrl: "https://sortiraumaroc.ma/pro?tab=media",
      meta: { event: "media_factory.job_delivered", job_id: job.id },
    });

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "notification_error",
    };
  }
}
