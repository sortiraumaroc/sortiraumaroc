/**
 * Billing Period Logic (Phase 3.5 + 3.6)
 *
 * Manages semi-monthly billing cycles:
 *  - Period A: 1-15 → deadline J+5 (20th) → payment M+1 5th
 *  - Period B: 16-end → deadline M+1 5th → payment M+1 22nd
 *
 * Handles:
 *  - Auto-close billing periods (cron)
 *  - Pro call-to-invoice
 *  - Admin validation
 *  - Payment execution
 *  - Rollover of unsubmitted invoices
 *  - Reminders
 *  - Disputes (3.6)
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { notifyProMembers } from "./proNotifications";
import { emitAdminNotification } from "./adminNotifications";
import { sendTemplateEmail } from "./emailService";
import { generateCommissionInvoice, generateCorrectionCreditNote } from "./vosfactures/documents";
import {
  getBillingPeriodCode,
  getBillingPeriodDates,
  BILLING_PERIOD,
} from "../shared/packsBillingTypes";

// =============================================================================
// Types
// =============================================================================

type OpResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; errorCode?: string };

// =============================================================================
// 1. Close billing period (cron)
// =============================================================================

/**
 * Auto-close billing periods that have ended.
 * Called by cron every day at midnight.
 */
export async function closeBillingPeriods(): Promise<number> {
  const supabase = getAdminSupabase();
  const today = new Date().toISOString().split("T")[0];

  // Find all open periods whose end_date has passed
  const { data: periods, error } = await supabase
    .from("billing_periods")
    .select("id, establishment_id, period_code, end_date")
    .eq("status", "open")
    .lt("end_date", today)
    .limit(500);

  if (error || !periods) return 0;

  let closed = 0;
  for (const period of periods) {
    const p = period as any;

    // Calculate totals from transactions
    const { data: txSums } = await supabase
      .from("transactions")
      .select("gross_amount, commission_amount, net_amount")
      .eq("establishment_id", p.establishment_id)
      .eq("billing_period", p.period_code)
      .eq("status", "completed");

    let totalGross = 0;
    let totalCommission = 0;
    let totalNet = 0;
    let txCount = 0;

    if (txSums) {
      for (const tx of txSums as any[]) {
        totalGross += tx.gross_amount ?? 0;
        totalCommission += tx.commission_amount ?? 0;
        totalNet += tx.net_amount ?? 0;
        txCount++;
      }
    }

    // Calculate refunds
    const { data: refundSums } = await supabase
      .from("transactions")
      .select("gross_amount")
      .eq("establishment_id", p.establishment_id)
      .eq("billing_period", p.period_code)
      .in("type", ["pack_refund", "deposit_refund"]);

    let totalRefunds = 0;
    if (refundSums) {
      for (const r of refundSums as any[]) {
        totalRefunds += Math.abs(r.gross_amount ?? 0);
      }
    }

    // Calculate deadline: Period A → 20th, Period B → 5th next month
    const periodDates = getBillingPeriodDates(p.period_code);
    const deadlineDate = new Date(periodDates.end);
    deadlineDate.setDate(deadlineDate.getDate() + BILLING_PERIOD.CALL_TO_INVOICE_DEADLINE_DAYS);

    await supabase
      .from("billing_periods")
      .update({
        status: "closed",
        total_gross: totalGross,
        total_commission: totalCommission,
        total_net: totalNet,
        total_refunds: totalRefunds,
        transaction_count: txCount,
        call_to_invoice_deadline: deadlineDate.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", p.id);

    closed++;
  }

  if (closed > 0) {
    console.log(`[Billing] Closed ${closed} billing periods`);
  }

  return closed;
}

// =============================================================================
// 2. Ensure billing period exists for an establishment
// =============================================================================

export async function ensureBillingPeriod(
  establishmentId: string,
  date: Date = new Date(),
): Promise<string> {
  const supabase = getAdminSupabase();
  const periodCode = getBillingPeriodCode(date);
  const periodDates = getBillingPeriodDates(periodCode);

  // Check if it already exists
  const { data: existing } = await supabase
    .from("billing_periods")
    .select("id")
    .eq("establishment_id", establishmentId)
    .eq("period_code", periodCode)
    .maybeSingle();

  if (existing) return (existing as any).id;

  // Create it
  const { data: created, error } = await supabase
    .from("billing_periods")
    .insert({
      establishment_id: establishmentId,
      period_code: periodCode,
      start_date: periodDates.start.toISOString().split("T")[0],
      end_date: periodDates.end.toISOString().split("T")[0],
      status: "open",
    })
    .select("id")
    .single();

  if (error) {
    // Might be a race condition — try to fetch again
    const { data: reFetch } = await supabase
      .from("billing_periods")
      .select("id")
      .eq("establishment_id", establishmentId)
      .eq("period_code", periodCode)
      .maybeSingle();

    if (reFetch) return (reFetch as any).id;
    throw error;
  }

  return (created as any).id;
}

// =============================================================================
// 3. Pro: Call to invoice
// =============================================================================

export async function callToInvoice(
  billingPeriodId: string,
  establishmentId: string,
): Promise<OpResult<{ invoiceGenerated: boolean }>> {
  const supabase = getAdminSupabase();

  const { data: period, error } = await supabase
    .from("billing_periods")
    .select("*")
    .eq("id", billingPeriodId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!period) return { ok: false, error: "Periode de facturation introuvable.", errorCode: "not_found" };

  const p = period as any;
  if (p.status !== "closed") {
    return {
      ok: false,
      error: `Impossible de soumettre un appel a facture pour une periode en statut "${p.status}".`,
      errorCode: "invalid_status",
    };
  }

  // Check deadline
  if (p.call_to_invoice_deadline) {
    const deadline = new Date(p.call_to_invoice_deadline);
    if (new Date() > deadline) {
      return {
        ok: false,
        error: "La date limite pour l'appel a facture est depassee. Les transactions seront reportees.",
        errorCode: "deadline_passed",
      };
    }
  }

  const now = new Date();

  // Update status
  await supabase
    .from("billing_periods")
    .update({
      status: "invoice_submitted",
      invoice_submitted_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", billingPeriodId);

  // Generate VosFactures commission invoice
  let invoiceGenerated = false;
  void (async () => {
    try {
      // Fetch establishment info
      const { data: estab } = await supabase
        .from("establishments")
        .select("name, city, address")
        .eq("id", establishmentId)
        .maybeSingle();

      // Fetch pro user info
      const { data: proMember } = await supabase
        .from("pro_establishment_memberships")
        .select("user_id")
        .eq("establishment_id", establishmentId)
        .eq("role", "owner")
        .maybeSingle();

      let proName = "Professionnel";
      let proEmail = "";
      let proIce = "";

      if (proMember) {
        const { data: proUser } = await supabase.auth.admin.getUserById((proMember as any).user_id);
        proName = proUser?.user?.user_metadata?.full_name || proUser?.user?.email || proName;
        proEmail = proUser?.user?.email || "";
        proIce = proUser?.user?.user_metadata?.ice || "";
      }

      // Fetch transaction summary by type
      const { data: txs } = await supabase
        .from("transactions")
        .select("type, gross_amount, commission_rate, commission_amount")
        .eq("establishment_id", establishmentId)
        .eq("billing_period", p.period_code)
        .eq("status", "completed");

      const lineItemsByType: Record<string, { count: number; gross: number; commission: number; rate: number }> = {};
      if (txs) {
        for (const tx of txs as any[]) {
          if (!lineItemsByType[tx.type]) {
            lineItemsByType[tx.type] = { count: 0, gross: 0, commission: 0, rate: tx.commission_rate ?? 0 };
          }
          lineItemsByType[tx.type].count++;
          lineItemsByType[tx.type].gross += tx.gross_amount ?? 0;
          lineItemsByType[tx.type].commission += tx.commission_amount ?? 0;
        }
      }

      const typeLabels: Record<string, string> = {
        pack_sale: "Ventes de Packs",
        reservation_deposit: "Acomptes de reservation",
        advertising_purchase: "Achats publicitaires",
        visibility_purchase: "Achats de visibilite",
        digital_menu_purchase: "Menu digital",
        booking_link_purchase: "Lien booking",
      };

      const lineItems = Object.entries(lineItemsByType).map(([type, data]) => ({
        description: typeLabels[type] || type,
        quantity: data.count,
        grossCents: data.gross,
        commissionRate: data.rate,
        commissionCents: data.commission,
      }));

      // Calculate payment due date
      const paymentDueDate = new Date(now);
      paymentDueDate.setDate(paymentDueDate.getDate() + BILLING_PERIOD.PAYMENT_DELAY_DAYS);

      await generateCommissionInvoice({
        billingPeriodId,
        periodCode: p.period_code,
        establishmentId,
        establishmentName: (estab as any)?.name || "Etablissement",
        proUserName: proName,
        proEmail,
        proIce: proIce || undefined,
        proCity: (estab as any)?.city || undefined,
        proAddress: (estab as any)?.address || undefined,
        totalGrossCents: p.total_gross,
        totalCommissionCents: p.total_commission,
        totalNetCents: p.total_net,
        totalRefundsCents: p.total_refunds,
        transactionCount: p.transaction_count,
        lineItems,
        paymentDueDate: paymentDueDate.toISOString().split("T")[0],
      });

      invoiceGenerated = true;
    } catch (err) {
      console.error("[Billing] Failed to generate commission invoice:", err);
    }
  })();

  // Notify admin
  void emitAdminNotification({
    type: "billing_invoice_submitted",
    title: "Appel a facture soumis",
    body: `L'etablissement a soumis un appel a facture pour la periode ${p.period_code}. Montant commission: ${(p.total_commission / 100).toFixed(2)} MAD.`,
    data: { billing_period_id: billingPeriodId, establishment_id: establishmentId, period_code: p.period_code },
  }).catch(() => {});

  return { ok: true, data: { invoiceGenerated } };
}

// =============================================================================
// 4. Admin: Validate invoice
// =============================================================================

export async function validateInvoice(
  billingPeriodId: string,
  adminUserId: string,
): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { data: period, error } = await supabase
    .from("billing_periods")
    .select("id, status, establishment_id, period_code, total_net")
    .eq("id", billingPeriodId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!period) return { ok: false, error: "Periode introuvable.", errorCode: "not_found" };

  if ((period as any).status !== "invoice_submitted") {
    return { ok: false, error: "Cette facture n'est pas en attente de validation.", errorCode: "invalid_status" };
  }

  const paymentDue = new Date();
  paymentDue.setDate(paymentDue.getDate() + BILLING_PERIOD.PAYMENT_DELAY_DAYS);

  await supabase
    .from("billing_periods")
    .update({
      status: "invoice_validated",
      invoice_validated_at: new Date().toISOString(),
      payment_due_date: paymentDue.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", billingPeriodId);

  // Notify pro
  void notifyProMembers({
    supabase,
    establishmentId: (period as any).establishment_id,
    category: "billing",
    title: "Facture validee",
    body: `Votre facture pour la periode ${(period as any).period_code} a ete validee. Virement prevu le ${paymentDue.toISOString().split("T")[0]}.`,
    data: { billing_period_id: billingPeriodId },
  }).catch(() => {});

  return { ok: true, data: undefined };
}

// =============================================================================
// 5. Admin: Execute payment
// =============================================================================

export async function executePayment(
  billingPeriodId: string,
  adminUserId: string,
): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { data: period, error } = await supabase
    .from("billing_periods")
    .select("id, status, establishment_id, period_code, total_net")
    .eq("id", billingPeriodId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!period) return { ok: false, error: "Periode introuvable.", errorCode: "not_found" };

  const p = period as any;
  if (!["invoice_validated", "payment_scheduled"].includes(p.status)) {
    return { ok: false, error: "Cette facture n'est pas en attente de paiement.", errorCode: "invalid_status" };
  }

  await supabase
    .from("billing_periods")
    .update({
      status: "paid",
      payment_executed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", billingPeriodId);

  // Notify pro
  void notifyProMembers({
    supabase,
    establishmentId: p.establishment_id,
    category: "billing",
    title: "Virement effectue",
    body: `Le virement de ${(p.total_net / 100).toFixed(2)} MAD pour la periode ${p.period_code} a ete effectue.`,
    data: { billing_period_id: billingPeriodId, amount_cents: p.total_net },
  }).catch(() => {});

  return { ok: true, data: undefined };
}

// =============================================================================
// 6. Cron: Send reminders for uninvoiced periods
// =============================================================================

export async function sendInvoiceReminders(): Promise<number> {
  const supabase = getAdminSupabase();
  const now = new Date();

  // Find closed periods where deadline is approaching (J+3 and J+7)
  const { data: periods, error } = await supabase
    .from("billing_periods")
    .select("id, establishment_id, period_code, call_to_invoice_deadline, end_date")
    .eq("status", "closed")
    .not("call_to_invoice_deadline", "is", null)
    .limit(200);

  if (error || !periods) return 0;

  let reminded = 0;

  for (const period of periods) {
    const p = period as any;
    const endDate = new Date(p.end_date);
    const daysSinceClose = Math.floor((now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));

    // Send reminder at J+3 and J+7
    if (daysSinceClose === 3 || daysSinceClose === 7) {
      void notifyProMembers({
        supabase,
        establishmentId: p.establishment_id,
        category: "billing_reminder",
        title: daysSinceClose === 7 ? "Dernier rappel : appel a facture" : "Rappel : appel a facture",
        body: `Votre releve pour la periode ${p.period_code} est pret. Soumettez votre appel a facture avant le ${new Date(p.call_to_invoice_deadline).toISOString().split("T")[0]}.`,
        data: { billing_period_id: p.id, period_code: p.period_code },
      }).catch(() => {});

      reminded++;
    }
  }

  return reminded;
}

// =============================================================================
// 7. Cron: Rollover unsubmitted invoices
// =============================================================================

export async function rolloverExpiredPeriods(): Promise<number> {
  const supabase = getAdminSupabase();
  const now = new Date();

  // Find closed periods past their deadline
  const { data: periods, error } = await supabase
    .from("billing_periods")
    .select("id, establishment_id, period_code, call_to_invoice_deadline")
    .eq("status", "closed")
    .lt("call_to_invoice_deadline", now.toISOString())
    .limit(200);

  if (error || !periods) return 0;

  let rolledOver = 0;

  for (const period of periods) {
    const p = period as any;

    // Update transactions to point to the next billing period
    const nextPeriodCode = getBillingPeriodCode(new Date()); // current period

    await supabase
      .from("transactions")
      .update({ billing_period: nextPeriodCode })
      .eq("establishment_id", p.establishment_id)
      .eq("billing_period", p.period_code)
      .eq("status", "completed");

    // Mark old period as corrected (transactions moved)
    await supabase
      .from("billing_periods")
      .update({
        status: "corrected",
        updated_at: now.toISOString(),
      })
      .eq("id", p.id);

    // Ensure new period exists
    await ensureBillingPeriod(p.establishment_id, now);

    rolledOver++;
  }

  if (rolledOver > 0) {
    console.log(`[Billing] Rolled over ${rolledOver} expired periods`);
  }

  return rolledOver;
}

// =============================================================================
// 8. Dispute: Pro contests invoice (3.6)
// =============================================================================

export async function createBillingDispute(
  billingPeriodId: string,
  establishmentId: string,
  reason: string,
  disputedTransactionIds?: string[] | null,
  evidence?: Array<{ url: string; type: string; description?: string }> | null,
): Promise<OpResult<{ disputeId: string }>> {
  const supabase = getAdminSupabase();

  const { data: period, error } = await supabase
    .from("billing_periods")
    .select("id, status, period_code")
    .eq("id", billingPeriodId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!period) return { ok: false, error: "Periode introuvable.", errorCode: "not_found" };

  const p = period as any;
  const validStatuses = ["closed", "invoice_submitted", "invoice_validated", "payment_scheduled"];
  if (!validStatuses.includes(p.status)) {
    return { ok: false, error: "Cette periode ne peut pas etre contestee.", errorCode: "invalid_status" };
  }

  // Create dispute
  const { data: dispute, error: dispErr } = await supabase
    .from("billing_disputes")
    .insert({
      billing_period_id: billingPeriodId,
      establishment_id: establishmentId,
      disputed_transactions: disputedTransactionIds ?? null,
      reason,
      evidence: evidence ?? null,
      status: "open",
    })
    .select("id")
    .single();

  if (dispErr) return { ok: false, error: dispErr.message };

  // Update period status
  await supabase
    .from("billing_periods")
    .update({ status: "disputed", updated_at: new Date().toISOString() })
    .eq("id", billingPeriodId);

  // Notify admin
  void emitAdminNotification({
    type: "billing_dispute",
    title: "Contestation de facture",
    body: `Un etablissement conteste la facture de la periode ${p.period_code}. Motif: ${reason.slice(0, 100)}`,
    data: { dispute_id: (dispute as any).id, billing_period_id: billingPeriodId },
  }).catch(() => {});

  return { ok: true, data: { disputeId: (dispute as any).id } };
}

// =============================================================================
// 9. Admin: Respond to dispute
// =============================================================================

export async function respondToDispute(
  disputeId: string,
  adminUserId: string,
  decision: "accept" | "reject",
  response: string,
  correctionAmountCents?: number,
): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { data: dispute, error } = await supabase
    .from("billing_disputes")
    .select("id, billing_period_id, establishment_id, status")
    .eq("id", disputeId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!dispute) return { ok: false, error: "Contestation introuvable.", errorCode: "not_found" };

  const d = dispute as any;
  if (!["open", "under_review"].includes(d.status)) {
    return { ok: false, error: "Cette contestation a deja ete traitee.", errorCode: "already_resolved" };
  }

  const now = new Date();
  const newStatus = decision === "accept" ? "resolved_accepted" : "resolved_rejected";

  await supabase
    .from("billing_disputes")
    .update({
      status: newStatus,
      admin_response: response,
      admin_responded_by: adminUserId,
      admin_responded_at: now.toISOString(),
      correction_amount: decision === "accept" ? (correctionAmountCents ?? 0) : null,
      updated_at: now.toISOString(),
    })
    .eq("id", disputeId);

  // If accepted with correction → generate credit note via VosFactures
  if (decision === "accept" && correctionAmountCents && correctionAmountCents > 0) {
    void (async () => {
      try {
        // Fetch original invoice VF ID
        const { data: period } = await supabase
          .from("billing_periods")
          .select("vosfactures_invoice_id, period_code")
          .eq("id", d.billing_period_id)
          .maybeSingle();

        const vfInvoiceId = (period as any)?.vosfactures_invoice_id;
        if (vfInvoiceId) {
          // Fetch pro info
          const { data: proMember } = await supabase
            .from("pro_establishment_memberships")
            .select("user_id")
            .eq("establishment_id", d.establishment_id)
            .eq("role", "owner")
            .maybeSingle();

          let proName = "Professionnel";
          let proEmail = "";
          if (proMember) {
            const { data: proUser } = await supabase.auth.admin.getUserById((proMember as any).user_id);
            proName = proUser?.user?.user_metadata?.full_name || proUser?.user?.email || proName;
            proEmail = proUser?.user?.email || "";
          }

          await generateCorrectionCreditNote({
            disputeId,
            billingPeriodId: d.billing_period_id,
            originalVfDocumentId: Number(vfInvoiceId),
            proUserName: proName,
            proEmail,
            correctionAmountCents,
            reason: response,
          });
        }
      } catch (err) {
        console.error("[Billing] Failed to generate correction credit note:", err);
      }
    })();
  }

  // Update period status back to appropriate state
  await supabase
    .from("billing_periods")
    .update({
      status: decision === "accept" ? "corrected" : "dispute_resolved",
      updated_at: now.toISOString(),
    })
    .eq("id", d.billing_period_id);

  // Notify pro
  void notifyProMembers({
    supabase,
    establishmentId: d.establishment_id,
    category: "billing_dispute",
    title: decision === "accept" ? "Contestation acceptee" : "Contestation rejetee",
    body: decision === "accept"
      ? `Votre contestation a ete acceptee. Un avoir de ${((correctionAmountCents ?? 0) / 100).toFixed(2)} MAD va etre emis.`
      : `Votre contestation a ete rejetee. Motif : ${response.slice(0, 100)}`,
    data: { dispute_id: disputeId, decision },
  }).catch(() => {});

  return { ok: true, data: undefined };
}

// =============================================================================
// 10. Escalate dispute
// =============================================================================

export async function escalateDispute(disputeId: string): Promise<OpResult> {
  const supabase = getAdminSupabase();

  const { data: dispute, error } = await supabase
    .from("billing_disputes")
    .select("id, status, establishment_id")
    .eq("id", disputeId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!dispute) return { ok: false, error: "Contestation introuvable.", errorCode: "not_found" };

  if ((dispute as any).status !== "resolved_rejected") {
    return { ok: false, error: "Seule une contestation rejetee peut etre escaladee.", errorCode: "invalid_status" };
  }

  await supabase
    .from("billing_disputes")
    .update({
      status: "escalated",
      escalated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", disputeId);

  void emitAdminNotification({
    type: "billing_dispute_escalated",
    title: "Contestation escaladee",
    body: "Un professionnel a escalade une contestation de facture. Resolution requise sous 10 jours ouvrables.",
    data: { dispute_id: disputeId },
  }).catch(() => {});

  return { ok: true, data: undefined };
}
