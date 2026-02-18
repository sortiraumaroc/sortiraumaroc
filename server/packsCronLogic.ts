/**
 * Packs Cron Logic — Phase 6
 *
 * Missing cron job functions not yet implemented in Phase 3/4:
 *  1. expirePurchases()             — daily 0h: mark expired pack purchases
 *  2. sendPackExpirationReminders() — daily 10h: email J-7 before pack expiry
 *  3. alertStaleDisputes()          — daily 9h: admin alert for disputes > 5 days
 *  4. alertLatePayments()           — daily 9h: admin alert for late payments
 *  5. runReconciliationReport()     — daily 2h: verify financial coherence
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { emitAdminNotification } from "./adminNotifications";
import { sendTemplateEmail } from "./emailService";

// =============================================================================
// 1. Expire Pack Purchases — daily 0h
// =============================================================================

/**
 * Mark all PackPurchases whose `expires_at` has passed as "expired".
 * Only targets purchases with status = active | partially_consumed.
 */
export async function expirePurchases(): Promise<number> {
  const supabase = getAdminSupabase();
  const now = new Date().toISOString();

  // Find active/partially consumed purchases that have expired
  const { data: expired, error: fetchErr } = await supabase
    .from("pack_purchases")
    .select("id, buyer_email, buyer_name, pack_id, status")
    .in("status", ["active", "partially_consumed"])
    .not("expires_at", "is", null)
    .lt("expires_at", now);

  if (fetchErr) {
    console.error("[PacksCronLogic] expirePurchases fetch error:", fetchErr);
    throw new Error(fetchErr.message);
  }

  if (!expired || expired.length === 0) return 0;

  const ids = expired.map((p: any) => p.id);

  // Batch update status → expired
  const { error: updateErr } = await supabase
    .from("pack_purchases")
    .update({ status: "expired", updated_at: now })
    .in("id", ids);

  if (updateErr) {
    console.error("[PacksCronLogic] expirePurchases update error:", updateErr);
    throw new Error(updateErr.message);
  }

  console.log(`[PacksCronLogic] expirePurchases: ${ids.length} purchases expired`);
  return ids.length;
}

// =============================================================================
// 2. Pack Expiration Reminders (J-7) — daily 10h
// =============================================================================

/**
 * Send reminder emails to clients whose active packs expire within 7 days.
 * Only sends one reminder (checks that we haven't already notified via meta).
 */
export async function sendPackExpirationReminders(): Promise<number> {
  const supabase = getAdminSupabase();
  const now = new Date();

  // J-7: purchases expiring between now and now + 7 days
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  // J-6: only target purchases expiring in exactly 6-7 days range
  // (so the cron running daily at 10h catches each purchase once)
  const sixDaysFromNow = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);

  const { data: purchases, error: fetchErr } = await supabase
    .from("pack_purchases")
    .select("id, buyer_email, buyer_name, pack_id, expires_at, uses_remaining, uses_total, meta")
    .in("status", ["active", "partially_consumed"])
    .not("expires_at", "is", null)
    .gte("expires_at", sixDaysFromNow.toISOString())
    .lte("expires_at", sevenDaysFromNow.toISOString());

  if (fetchErr) {
    console.error("[PacksCronLogic] sendPackExpirationReminders fetch error:", fetchErr);
    throw new Error(fetchErr.message);
  }

  if (!purchases || purchases.length === 0) return 0;

  let sentCount = 0;

  for (const purchase of purchases) {
    const p = purchase as any;

    // Skip if already reminded
    const meta = p.meta ?? {};
    if (meta.expiry_reminder_sent) continue;

    // Fetch pack title
    const { data: pack } = await supabase
      .from("packs")
      .select("title")
      .eq("id", p.pack_id)
      .maybeSingle();

    const packTitle = (pack as any)?.title ?? "Pack";
    const expiresAt = p.expires_at ? new Date(p.expires_at) : null;
    const expirationDate = expiresAt
      ? expiresAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
      : "";

    // Send email (best-effort)
    if (p.buyer_email) {
      void sendTemplateEmail({
        templateKey: "pack_expiration_reminder_j7",
        lang: "fr",
        fromKey: "noreply",
        to: [p.buyer_email],
        variables: {
          buyer_name: p.buyer_name ?? "Client",
          pack_title: packTitle,
          expiration_date: expirationDate,
          uses_remaining: p.uses_remaining ?? 0,
          uses_total: p.uses_total ?? 1,
        },
        ctaUrl: "https://sam.ma/profile?tab=packs",
        ctaLabel: "Voir mes Packs",
      }).catch((err) => {
        console.error(`[PacksCronLogic] expiry reminder email failed for purchase ${p.id}:`, err);
      });
    }

    // Mark as reminded in meta
    const updatedMeta = { ...meta, expiry_reminder_sent: true, expiry_reminder_at: now.toISOString() };
    await supabase
      .from("pack_purchases")
      .update({ meta: updatedMeta })
      .eq("id", p.id);

    sentCount++;
  }

  console.log(`[PacksCronLogic] sendPackExpirationReminders: ${sentCount} reminders sent`);
  return sentCount;
}

// =============================================================================
// 3. Alert Stale Disputes (> 5 days) — daily 9h
// =============================================================================

/**
 * Alert admin about billing disputes that have been open for more than 5 days
 * without a response.
 */
export async function alertStaleDisputes(): Promise<number> {
  const supabase = getAdminSupabase();
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

  // Find open disputes older than 5 days
  const { data: disputes, error } = await supabase
    .from("billing_disputes")
    .select("id, billing_period_id, establishment_id, reason, created_at, status")
    .in("status", ["open", "escalated"])
    .lt("created_at", fiveDaysAgo);

  if (error) {
    console.error("[PacksCronLogic] alertStaleDisputes fetch error:", error);
    throw new Error(error.message);
  }

  if (!disputes || disputes.length === 0) return 0;

  // Emit a single admin notification summarizing all stale disputes
  const count = disputes.length;
  const disputeIds = disputes.map((d: any) => d.id);

  // Fetch establishment names for context
  const establishmentIds = [...new Set(disputes.map((d: any) => d.establishment_id))];
  const { data: establishments } = await supabase
    .from("establishments")
    .select("id, name")
    .in("id", establishmentIds);

  const estabMap = new Map<string, string>();
  if (establishments) {
    for (const e of establishments) {
      estabMap.set((e as any).id, (e as any).name);
    }
  }

  const details = disputes.slice(0, 5).map((d: any) => {
    const estabName = estabMap.get(d.establishment_id) ?? d.establishment_id;
    const daysOld = Math.floor((Date.now() - new Date(d.created_at).getTime()) / (24 * 60 * 60 * 1000));
    return `• ${estabName} — ${daysOld}j (${d.status})`;
  }).join("\n");

  const suffix = count > 5 ? `\n… et ${count - 5} autre(s)` : "";

  await emitAdminNotification({
    type: "billing_stale_disputes",
    title: `⚠️ ${count} contestation${count > 1 ? "s" : ""} non traitée${count > 1 ? "s" : ""} > 5 jours`,
    body: `${details}${suffix}`,
    data: { dispute_ids: disputeIds, count },
  });

  console.log(`[PacksCronLogic] alertStaleDisputes: ${count} stale disputes alerted`);
  return count;
}

// =============================================================================
// 4. Alert Late Payments — daily 9h
// =============================================================================

/**
 * Alert admin about billing periods that are validated (invoice_validated)
 * but payment is overdue (payment_due_date < today and status still invoice_validated).
 */
export async function alertLatePayments(): Promise<number> {
  const supabase = getAdminSupabase();
  const today = new Date().toISOString().split("T")[0];

  // Find billing periods where invoice is validated but payment is overdue
  const { data: latePeriods, error } = await supabase
    .from("billing_periods")
    .select("id, establishment_id, period_code, total_net, payment_due_date, status")
    .eq("status", "invoice_validated")
    .not("payment_due_date", "is", null)
    .lt("payment_due_date", today);

  if (error) {
    console.error("[PacksCronLogic] alertLatePayments fetch error:", error);
    throw new Error(error.message);
  }

  if (!latePeriods || latePeriods.length === 0) return 0;

  const count = latePeriods.length;

  // Fetch establishment names
  const establishmentIds = [...new Set(latePeriods.map((p: any) => p.establishment_id))];
  const { data: establishments } = await supabase
    .from("establishments")
    .select("id, name")
    .in("id", establishmentIds);

  const estabMap = new Map<string, string>();
  if (establishments) {
    for (const e of establishments) {
      estabMap.set((e as any).id, (e as any).name);
    }
  }

  // Calculate total overdue amount
  let totalOverdue = 0;
  const details = latePeriods.slice(0, 5).map((p: any) => {
    const estabName = estabMap.get(p.establishment_id) ?? p.establishment_id;
    const netAmount = Math.round((p.total_net ?? 0) / 100);
    totalOverdue += p.total_net ?? 0;
    const daysLate = Math.floor((Date.now() - new Date(p.payment_due_date).getTime()) / (24 * 60 * 60 * 1000));
    return `• ${estabName} — ${p.period_code} — ${netAmount} Dhs (${daysLate}j de retard)`;
  }).join("\n");

  const suffix = count > 5 ? `\n… et ${count - 5} autre(s)` : "";
  const totalDhs = Math.round(totalOverdue / 100);

  await emitAdminNotification({
    type: "billing_late_payments",
    title: `🚨 ${count} virement${count > 1 ? "s" : ""} en retard — ${totalDhs} Dhs total`,
    body: `${details}${suffix}`,
    data: {
      late_period_ids: latePeriods.map((p: any) => p.id),
      count,
      total_overdue_cents: totalOverdue,
    },
  });

  console.log(`[PacksCronLogic] alertLatePayments: ${count} late payments alerted (${totalDhs} Dhs total)`);
  return count;
}

// =============================================================================
// 5. Reconciliation Report — daily 2h
// =============================================================================

/**
 * Verify financial coherence:
 *   encaissements (gross) = reversements (net) + commissions
 *
 * Checks the last closed billing period's transactions for discrepancies.
 * Emits admin notification if any mismatch is found.
 */
export async function runReconciliationReport(): Promise<{
  periodsChecked: number;
  discrepancies: number;
}> {
  const supabase = getAdminSupabase();

  // Find closed or later-stage billing periods that haven't been reconciled
  // Only reconcile periods that are at least "closed" and have transactions
  const { data: periods, error: fetchErr } = await supabase
    .from("billing_periods")
    .select("id, establishment_id, period_code, total_gross, total_commission, total_net, total_refunds, status")
    .in("status", [
      "closed",
      "invoice_pending",
      "invoice_submitted",
      "invoice_validated",
      "payment_scheduled",
      "paid",
    ])
    .order("created_at", { ascending: false })
    .limit(100);

  if (fetchErr) {
    console.error("[PacksCronLogic] runReconciliationReport fetch error:", fetchErr);
    throw new Error(fetchErr.message);
  }

  if (!periods || periods.length === 0) {
    return { periodsChecked: 0, discrepancies: 0 };
  }

  let discrepancies = 0;
  const discrepancyDetails: string[] = [];

  for (const period of periods) {
    const p = period as any;

    // Fetch all transactions for this billing period
    const { data: transactions, error: txErr } = await supabase
      .from("transactions")
      .select("id, gross_amount, commission_amount, net_amount, status")
      .eq("billing_period_id", p.id)
      .eq("status", "completed");

    if (txErr) {
      console.error(`[PacksCronLogic] reconciliation tx fetch for period ${p.id}:`, txErr);
      continue;
    }

    if (!transactions || transactions.length === 0) continue;

    // Sum up from individual transactions
    let txGross = 0;
    let txCommission = 0;
    let txNet = 0;

    for (const tx of transactions) {
      const t = tx as any;
      txGross += t.gross_amount ?? 0;
      txCommission += t.commission_amount ?? 0;
      txNet += t.net_amount ?? 0;
    }

    // Compare with period totals
    const periodGross = p.total_gross ?? 0;
    const periodCommission = p.total_commission ?? 0;
    const periodNet = p.total_net ?? 0;

    // Check 1: transactions sum should match period totals (±1 centime tolerance)
    const grossDiff = Math.abs(txGross - periodGross);
    const commDiff = Math.abs(txCommission - periodCommission);
    const netDiff = Math.abs(txNet - periodNet);

    if (grossDiff > 1 || commDiff > 1 || netDiff > 1) {
      discrepancies++;
      discrepancyDetails.push(
        `• ${p.period_code} (${p.establishment_id?.slice(0, 8)}…): ` +
        `gross Δ${grossDiff}, commission Δ${commDiff}, net Δ${netDiff}`
      );
    }

    // Check 2: gross = net + commission (basic accounting equation)
    const equationDiff = Math.abs(txGross - (txNet + txCommission));
    if (equationDiff > 1) {
      discrepancies++;
      discrepancyDetails.push(
        `• ${p.period_code}: gross(${txGross}) ≠ net(${txNet}) + commission(${txCommission}), Δ${equationDiff}`
      );
    }
  }

  // Emit admin alert if discrepancies found
  if (discrepancies > 0) {
    const body = discrepancyDetails.slice(0, 10).join("\n");
    const suffix = discrepancyDetails.length > 10
      ? `\n… et ${discrepancyDetails.length - 10} autre(s)`
      : "";

    await emitAdminNotification({
      type: "billing_reconciliation_discrepancy",
      title: `⚠️ Réconciliation : ${discrepancies} anomalie${discrepancies > 1 ? "s" : ""} détectée${discrepancies > 1 ? "s" : ""}`,
      body: `${body}${suffix}`,
      data: {
        periods_checked: periods.length,
        discrepancies,
        details: discrepancyDetails,
      },
    });
  }

  console.log(
    `[PacksCronLogic] runReconciliationReport: ${periods.length} periods checked, ${discrepancies} discrepancies`
  );

  return {
    periodsChecked: periods.length,
    discrepancies,
  };
}
