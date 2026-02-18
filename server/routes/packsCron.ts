/**
 * Packs Cron Routes — Phase 4 + Phase 6 (Cron endpoints)
 *
 * 13 endpoints:
 *  - POST /api/admin/cron/packs/activate-scheduled      — approved → active at sale_start_date
 *  - POST /api/admin/cron/packs/end-expired             — active → ended at sale_end_date
 *  - POST /api/admin/cron/packs/expire-purchases        — active → expired past validity_end_date
 *  - POST /api/admin/cron/packs/expiration-reminders    — email J-7 before pack expiry
 *  - POST /api/admin/cron/billing/close-periods          — close periods past end_date
 *  - POST /api/admin/cron/billing/invoice-reminders      — J+3 / J+7 reminders
 *  - POST /api/admin/cron/billing/rollover-expired       — rollover unsubmitted to next period
 *  - POST /api/admin/cron/billing/alert-stale-disputes   — admin alert for disputes > 5 days
 *  - POST /api/admin/cron/billing/alert-late-payments    — admin alert for overdue payments
 *  - POST /api/admin/cron/billing/reconciliation         — verify financial coherence
 *  - POST /api/admin/cron/vf/retry-pending               — retry pending VosFactures documents
 *  - POST /api/admin/cron/vf/alert-stale                 — alert admin for pending > 24h
 *  - POST /api/admin/cron/packs/run-all                  — master runner
 */

import type { Router, Request, Response, RequestHandler } from "express";
import {
  activateScheduledPacks,
  endExpiredPacks,
} from "../packLifecycleLogic";
import {
  closeBillingPeriods,
  sendInvoiceReminders,
  rolloverExpiredPeriods,
} from "../billingPeriodLogic";
import { retryPendingDocuments, alertStaleDocuments } from "../vosfactures/retry";
import {
  expirePurchases,
  sendPackExpirationReminders,
  alertStaleDisputes,
  alertLatePayments,
  runReconciliationReport,
} from "../packsCronLogic";

// =============================================================================
// Cron auth (same pattern as reservationV2Cron.ts)
// =============================================================================

function verifyCronSecret(req: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const cronSecret = req.headers["x-cron-secret"];
  return cronSecret === process.env.CRON_SECRET;
}

// =============================================================================
// Individual cron handlers
// =============================================================================

// POST /api/admin/cron/packs/activate-scheduled
const cronActivateScheduled: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const count = await activateScheduledPacks();
    res.json({ ok: true, count });
  } catch (err) {
    console.error("[PacksCron] activateScheduled error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/packs/end-expired
const cronEndExpired: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const count = await endExpiredPacks();
    res.json({ ok: true, count });
  } catch (err) {
    console.error("[PacksCron] endExpired error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/billing/close-periods
const cronClosePeriods: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const count = await closeBillingPeriods();
    res.json({ ok: true, count });
  } catch (err) {
    console.error("[PacksCron] closePeriods error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/billing/invoice-reminders
const cronInvoiceReminders: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const count = await sendInvoiceReminders();
    res.json({ ok: true, count });
  } catch (err) {
    console.error("[PacksCron] invoiceReminders error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/billing/rollover-expired
const cronRolloverExpired: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const count = await rolloverExpiredPeriods();
    res.json({ ok: true, count });
  } catch (err) {
    console.error("[PacksCron] rolloverExpired error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/vf/retry-pending
const cronVfRetryPending: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const result = await retryPendingDocuments();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[PacksCron] vfRetryPending error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/vf/alert-stale
const cronVfAlertStale: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const staleCount = await alertStaleDocuments();
    res.json({ ok: true, staleCount });
  } catch (err) {
    console.error("[PacksCron] vfAlertStale error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/packs/expire-purchases (Phase 6)
const cronExpirePurchases: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const count = await expirePurchases();
    res.json({ ok: true, count });
  } catch (err) {
    console.error("[PacksCron] expirePurchases error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/packs/expiration-reminders (Phase 6)
const cronExpirationReminders: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const count = await sendPackExpirationReminders();
    res.json({ ok: true, count });
  } catch (err) {
    console.error("[PacksCron] expirationReminders error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/billing/alert-stale-disputes (Phase 6)
const cronAlertStaleDisputes: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const count = await alertStaleDisputes();
    res.json({ ok: true, count });
  } catch (err) {
    console.error("[PacksCron] alertStaleDisputes error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/billing/alert-late-payments (Phase 6)
const cronAlertLatePayments: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const count = await alertLatePayments();
    res.json({ ok: true, count });
  } catch (err) {
    console.error("[PacksCron] alertLatePayments error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/billing/reconciliation (Phase 6)
const cronReconciliation: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const result = await runReconciliationReport();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[PacksCron] reconciliation error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// =============================================================================
// Master runner: POST /api/admin/cron/packs/run-all
// =============================================================================

interface CronJobConfig {
  name: string;
  schedule: "every_15min" | "every_1h" | "daily";
  dailyHour?: number;
  fn: () => Promise<unknown>;
}

const CRON_JOBS: CronJobConfig[] = [
  // Phase 4 jobs
  { name: "activate-scheduled-packs", schedule: "every_15min", fn: activateScheduledPacks },
  { name: "end-expired-packs", schedule: "daily", dailyHour: 1, fn: endExpiredPacks },
  { name: "close-billing-periods", schedule: "daily", dailyHour: 0, fn: closeBillingPeriods },
  { name: "invoice-reminders", schedule: "daily", dailyHour: 9, fn: sendInvoiceReminders },
  { name: "rollover-expired-periods", schedule: "daily", dailyHour: 2, fn: rolloverExpiredPeriods },
  { name: "vf-retry-pending", schedule: "every_15min", fn: retryPendingDocuments },
  { name: "vf-alert-stale", schedule: "daily", dailyHour: 8, fn: alertStaleDocuments },
  // Phase 6 jobs
  { name: "expire-purchases", schedule: "daily", dailyHour: 0, fn: expirePurchases },
  { name: "pack-expiration-reminders", schedule: "daily", dailyHour: 10, fn: sendPackExpirationReminders },
  { name: "alert-stale-disputes", schedule: "daily", dailyHour: 9, fn: alertStaleDisputes },
  { name: "alert-late-payments", schedule: "daily", dailyHour: 9, fn: alertLatePayments },
  { name: "reconciliation-report", schedule: "daily", dailyHour: 2, fn: runReconciliationReport },
];

function isJobDueNow(job: CronJobConfig): boolean {
  const now = new Date();
  const minutes = now.getMinutes();
  const hours = now.getHours();

  switch (job.schedule) {
    case "every_15min":
      return minutes % 15 < 5; // within first 5 min of each 15min window
    case "every_1h":
      return minutes < 5; // first 5 min of each hour
    case "daily":
      return hours === (job.dailyHour ?? 0) && minutes < 5;
    default:
      return false;
  }
}

const cronRunAll: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  const smart = req.query.smart !== "false"; // default: smart scheduling
  const results: Record<string, { ok: boolean; result?: unknown; error?: string }> = {};

  for (const job of CRON_JOBS) {
    if (smart && !isJobDueNow(job)) continue;

    try {
      const result = await job.fn();
      results[job.name] = { ok: true, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[PacksCron] ${job.name} failed:`, message);
      results[job.name] = { ok: false, error: message };
    }
  }

  const jobsRun = Object.keys(results).length;
  console.log(`[PacksCron] run-all: ${jobsRun} jobs executed`);

  res.json({ ok: true, jobsRun, results });
};

// =============================================================================
// Route registration
// =============================================================================

export function registerPacksCronRoutes(app: Router): void {
  // Phase 4 routes
  app.post("/api/admin/cron/packs/activate-scheduled", cronActivateScheduled);
  app.post("/api/admin/cron/packs/end-expired", cronEndExpired);
  app.post("/api/admin/cron/billing/close-periods", cronClosePeriods);
  app.post("/api/admin/cron/billing/invoice-reminders", cronInvoiceReminders);
  app.post("/api/admin/cron/billing/rollover-expired", cronRolloverExpired);
  app.post("/api/admin/cron/vf/retry-pending", cronVfRetryPending);
  app.post("/api/admin/cron/vf/alert-stale", cronVfAlertStale);
  // Phase 6 routes
  app.post("/api/admin/cron/packs/expire-purchases", cronExpirePurchases);
  app.post("/api/admin/cron/packs/expiration-reminders", cronExpirationReminders);
  app.post("/api/admin/cron/billing/alert-stale-disputes", cronAlertStaleDisputes);
  app.post("/api/admin/cron/billing/alert-late-payments", cronAlertLatePayments);
  app.post("/api/admin/cron/billing/reconciliation", cronReconciliation);
  // Master runner
  app.post("/api/admin/cron/packs/run-all", cronRunAll);
}
