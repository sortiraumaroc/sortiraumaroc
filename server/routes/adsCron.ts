/**
 * Ads Cron Jobs
 *
 * Endpoints called by cron scheduler for:
 * 1. Reset daily ad budgets at midnight
 * 2. Pause campaigns with exhausted budgets
 * 3. Reactivate paused campaigns at new day
 * 4. Recalculate quality scores (daily)
 * 5. Bill CPM impressions (hourly)
 * 6. Generate monthly campaign invoices (1st of month)
 */

import type { Request, Response } from "express";
import type { Express } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { createCampaignInvoice } from "../ads/invoicing";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("adsCron");

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function verifyCronSecret(req: Request): boolean {
  const cronSecret = req.headers["x-cron-secret"];
  if (process.env.NODE_ENV !== "production") return true;
  return cronSecret === process.env.CRON_SECRET;
}

// ---------------------------------------------------------------------------
// POST /api/admin/cron/ads-daily-reset
// Reset daily spent counters and manage campaign states
// Should be called at 00:00 Morocco time (Africa/Casablanca)
// ---------------------------------------------------------------------------

export async function cronAdsDailyReset(req: Request, res: Response) {
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  }

  const supabase = getAdminSupabase();
  const now = new Date().toISOString();
  const stats = {
    daily_reset_count: 0,
    reactivated_count: 0,
    paused_count: 0,
    errors: [] as string[],
  };

  try {
    // Step 1: Reset daily_spent_cents for all active campaigns
    const { data: resetCampaigns, error: resetError } = await supabase
      .from("pro_campaigns")
      .update({
        daily_spent_cents: 0,
        updated_at: now,
      })
      .in("status", ["active", "paused"])
      .select("id");

    if (resetError) {
      stats.errors.push(`Reset error: ${resetError.message}`);
      log.error({ err: resetError }, "Reset daily budgets error");
    } else {
      stats.daily_reset_count = resetCampaigns?.length ?? 0;
      log.info({ count: stats.daily_reset_count }, "Reset daily budgets for campaigns");
    }

    // Step 2: Reactivate campaigns that were paused due to daily budget exhaustion
    // These are campaigns where:
    // - status = 'paused'
    // - pause_reason = 'daily_budget_exhausted'
    // - budget_cents > spent_cents (still have total budget)
    // - starts_at <= now <= ends_at (within active date range)
    const { data: reactivated, error: reactivateError } = await supabase
      .from("pro_campaigns")
      .update({
        status: "active",
        pause_reason: null,
        updated_at: now,
      })
      .eq("status", "paused")
      .eq("pause_reason", "daily_budget_exhausted")
      .lte("starts_at", now)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .select("id");

    if (reactivateError) {
      stats.errors.push(`Reactivate error: ${reactivateError.message}`);
      log.error({ err: reactivateError }, "Reactivate campaigns error");
    } else {
      stats.reactivated_count = reactivated?.length ?? 0;
      log.info({ count: stats.reactivated_count }, "Reactivated campaigns");
    }

    // Step 3: Pause campaigns with exhausted total budget
    // These are campaigns where spent_cents >= budget_cents
    const { data: paused, error: pauseError } = await supabase
      .from("pro_campaigns")
      .update({
        status: "paused",
        pause_reason: "total_budget_exhausted",
        updated_at: now,
      })
      .eq("status", "active")
      .not("budget_cents", "is", null)
      .filter("spent_cents", "gte", supabase.rpc("get_campaign_budget_cents"))
      .select("id");

    // Alternative approach using raw SQL via RPC if the above doesn't work
    if (pauseError) {
      // Try a different approach - select and update individually
      const { data: exhaustedCampaigns } = await supabase
        .from("pro_campaigns")
        .select("id, budget_cents, spent_cents")
        .eq("status", "active")
        .not("budget_cents", "is", null);

      for (const campaign of exhaustedCampaigns ?? []) {
        const budget = (campaign as any).budget_cents ?? 0;
        const spent = (campaign as any).spent_cents ?? 0;
        if (spent >= budget && budget > 0) {
          await supabase
            .from("pro_campaigns")
            .update({
              status: "paused",
              pause_reason: "total_budget_exhausted",
              updated_at: now,
            })
            .eq("id", (campaign as any).id);
          stats.paused_count++;
        }
      }
    } else {
      stats.paused_count = paused?.length ?? 0;
    }

    log.info({ count: stats.paused_count }, "Paused campaigns with exhausted budget");

    // Step 4: End campaigns past their end date
    const { error: endError } = await supabase
      .from("pro_campaigns")
      .update({
        status: "completed",
        updated_at: now,
      })
      .eq("status", "active")
      .lt("ends_at", now);

    if (endError) {
      stats.errors.push(`End campaigns error: ${endError.message}`);
      log.error({ err: endError }, "End campaigns error");
    }

    return res.json({
      ok: true,
      message: "Daily ads reset completed",
      stats,
      executed_at: now,
    });
  } catch (err) {
    log.error({ err }, "Unexpected error in daily reset");
    return res.status(500).json({
      ok: false,
      error: "Internal server error",
      stats,
    });
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/cron/ads-check-budgets
// Check and pause campaigns with exhausted daily budgets
// Should be called every 15 minutes
// ---------------------------------------------------------------------------

export async function cronAdsCheckBudgets(req: Request, res: Response) {
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  }

  const supabase = getAdminSupabase();
  const now = new Date().toISOString();
  let pausedCount = 0;

  try {
    // Find active campaigns where daily_spent_cents >= daily_budget_cents
    const { data: campaigns } = await supabase
      .from("pro_campaigns")
      .select("id, daily_budget_cents, daily_spent_cents")
      .eq("status", "active")
      .not("daily_budget_cents", "is", null);

    for (const campaign of campaigns ?? []) {
      const dailyBudget = (campaign as any).daily_budget_cents ?? 0;
      const dailySpent = (campaign as any).daily_spent_cents ?? 0;

      if (dailyBudget > 0 && dailySpent >= dailyBudget) {
        await supabase
          .from("pro_campaigns")
          .update({
            status: "paused",
            pause_reason: "daily_budget_exhausted",
            updated_at: now,
          })
          .eq("id", (campaign as any).id);
        pausedCount++;
      }
    }

    log.info({ pausedCount }, "Budget check completed");

    return res.json({
      ok: true,
      message: "Budget check completed",
      paused_count: pausedCount,
      checked_at: now,
    });
  } catch (err) {
    log.error({ err }, "Budget check error");
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/cron/ads-bill-impressions
// Bill CPM campaigns for their impressions
// Should be called every hour
// ---------------------------------------------------------------------------

export async function cronAdsBillImpressions(req: Request, res: Response) {
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  }

  const supabase = getAdminSupabase();
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600000).toISOString();
  let billedCount = 0;
  let totalBilledCents = 0;

  try {
    // Get active CPM campaigns
    const { data: campaigns } = await supabase
      .from("pro_campaigns")
      .select("id, establishment_id, cpm_cents, billing_model")
      .eq("status", "active")
      .eq("billing_model", "cpm");

    for (const campaign of campaigns ?? []) {
      const campaignId = (campaign as any).id;
      const establishmentId = (campaign as any).establishment_id;
      const cpmCents = (campaign as any).cpm_cents ?? 1000;

      // Count unbilled impressions for this campaign in the last hour
      const { count: impressionCount } = await supabase
        .from("ad_impressions")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("billed", false)
        .gte("created_at", oneHourAgo);

      if (!impressionCount || impressionCount === 0) continue;

      // Calculate cost (CPM = cost per 1000 impressions)
      const costCents = Math.round((cpmCents * impressionCount) / 1000);
      if (costCents <= 0) continue;

      // Debit the wallet
      const { error: debitError } = await supabase.rpc("debit_ad_wallet", {
        p_establishment_id: establishmentId,
        p_amount: costCents,
        p_transaction_type: "impression_charge",
        p_reference_id: campaignId,
        p_description: `${impressionCount} impressions - ${(costCents / 100).toFixed(2)} MAD`,
      });

      if (debitError) {
        log.error({ err: debitError, campaignId }, "Failed to bill campaign");
        continue;
      }

      // Mark impressions as billed
      await supabase
        .from("ad_impressions")
        .update({ billed: true })
        .eq("campaign_id", campaignId)
        .eq("billed", false)
        .gte("created_at", oneHourAgo);

      // Update campaign spent
      await supabase
        .from("pro_campaigns")
        .update({
          spent_cents: supabase.rpc("increment_cents", { x: costCents }),
          daily_spent_cents: supabase.rpc("increment_cents", { x: costCents }),
        })
        .eq("id", campaignId);

      billedCount++;
      totalBilledCents += costCents;
    }

    log.info({ billedCount, totalBilledCents }, "Billed CPM campaigns");

    return res.json({
      ok: true,
      message: "Impressions billing completed",
      billed_campaigns: billedCount,
      total_billed_cents: totalBilledCents,
      billed_at: now.toISOString(),
    });
  } catch (err) {
    log.error({ err }, "Impressions billing error");
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/cron/ads-recalculate-quality
// Recalculate quality scores for all active campaigns
// Should be called daily at 03:00
// ---------------------------------------------------------------------------

export async function cronAdsRecalculateQuality(req: Request, res: Response) {
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  }

  try {
    const { recalculateQualityScores } = await import("../ads/qualityScore");
    const supabase = getAdminSupabase();
    const result = await recalculateQualityScores(supabase);

    log.info({ updated: result.updated, errors: result.errors }, "Quality scores recalculated");

    return res.json({
      ok: true,
      message: "Quality scores recalculated",
      ...result,
      executed_at: new Date().toISOString(),
    });
  } catch (err) {
    log.error({ err }, "Quality score recalculation error");
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/cron/ads-generate-invoices
// Generate invoices for campaigns with unbilled spending from previous month
// Should be called on the 1st of each month at 06:00
// ---------------------------------------------------------------------------

export async function cronAdsGenerateInvoices(req: Request, res: Response) {
  if (!verifyCronSecret(req)) {
    return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  }

  const supabase = getAdminSupabase();
  const now = new Date();

  // Calculate previous month date range
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const periodLabel = `${prevMonth.toLocaleString("fr-FR", { month: "long", year: "numeric" })}`;

  let invoicedCount = 0;
  let totalInvoicedCents = 0;
  const errors: string[] = [];

  try {
    // Find campaigns that have spent money (completed or active with spending)
    const { data: campaigns } = await supabase
      .from("pro_campaigns")
      .select("id, establishment_id, title, type, spent_cents, billing_model")
      .gt("spent_cents", 0)
      .in("status", ["active", "paused", "completed"]);

    if (!campaigns || campaigns.length === 0) {
      return res.json({
        ok: true,
        message: "No campaigns to invoice",
        invoiced_count: 0,
        period: periodLabel,
        executed_at: now.toISOString(),
      });
    }

    for (const campaign of campaigns) {
      const campaignId = (campaign as any).id;
      const establishmentId = (campaign as any).establishment_id;
      const spentCents = (campaign as any).spent_cents ?? 0;
      const campaignTitle = (campaign as any).title;
      const campaignType = (campaign as any).type as string;

      if (spentCents <= 0) continue;

      // Check if we already generated an invoice for this campaign this month
      const { count: existingCount } = await supabase
        .from("ad_invoices")
        .select("*", { count: "exact", head: true })
        .eq("reference_id", campaignId)
        .eq("reference_type", "campaign")
        .gte("issued_at", prevMonth.toISOString())
        .lte("issued_at", prevMonthEnd.toISOString());

      if (existingCount && existingCount > 0) continue;

      // Map campaign type to invoice type
      let invoiceType: "sponsored_result" | "featured_pack" | "home_takeover" | "push_notification" | "email_campaign" = "sponsored_result";
      if (campaignType === "featured_pack") invoiceType = "featured_pack";
      else if (campaignType === "home_takeover") invoiceType = "home_takeover";
      else if (campaignType === "push_notification") invoiceType = "push_notification";
      else if (campaignType === "email_campaign") invoiceType = "email_campaign";

      try {
        const invoice = await createCampaignInvoice({
          establishmentId,
          campaignId,
          campaignType: invoiceType,
          amountCents: spentCents,
          campaignTitle: `${campaignTitle} — ${periodLabel}`,
        });

        if (invoice) {
          invoicedCount++;
          totalInvoicedCents += spentCents;
          log.info({ campaignId, amountMAD: (spentCents / 100).toFixed(2) }, "Invoice generated for campaign");
        }
      } catch (err) {
        const msg = `Failed to invoice campaign ${campaignId}: ${err instanceof Error ? err.message : "unknown"}`;
        errors.push(msg);
        log.error({ campaignId }, msg);
      }
    }

    log.info({ invoicedCount, totalMAD: (totalInvoicedCents / 100).toFixed(2) }, "Monthly invoicing completed");

    return res.json({
      ok: true,
      message: "Monthly campaign invoicing completed",
      invoiced_count: invoicedCount,
      total_invoiced_cents: totalInvoicedCents,
      period: periodLabel,
      errors: errors.length > 0 ? errors : undefined,
      executed_at: now.toISOString(),
    });
  } catch (err) {
    log.error({ err }, "Monthly invoicing error");
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
}

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerAdsCronRoutes(app: Express) {
  app.post("/api/admin/cron/ads-daily-reset", cronAdsDailyReset);
  app.post("/api/admin/cron/ads-check-budgets", cronAdsCheckBudgets);
  app.post("/api/admin/cron/ads-bill-impressions", cronAdsBillImpressions);
  app.post("/api/admin/cron/ads-recalculate-quality", cronAdsRecalculateQuality);
  app.post("/api/admin/cron/ads-generate-invoices", cronAdsGenerateInvoices);
}
