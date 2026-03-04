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
 *  - POST /api/admin/cron/finance/retry-pending           — retry pending finance operations
 *  - POST /api/admin/cron/finance/detect-stuck-refunds    — detect & enqueue stuck refunds
 *  - POST /api/admin/cron/packs/run-all                  — master runner
 */

import type { Router, Request, Response, RequestHandler } from "express";
import { createModuleLogger } from "../lib/logger";
import {
  activateScheduledPacks,
  endExpiredPacks,
} from "../packLifecycleLogic";

const log = createModuleLogger("packsCron");
import {
  closeBillingPeriods,
  sendInvoiceReminders,
  rolloverExpiredPeriods,
} from "../billingPeriodLogic";
import { retryPendingDocuments, alertStaleDocuments } from "../vosfactures/retry";
import { retryPendingFinanceOperations, detectStuckRefunds } from "../finance/retryQueue";
import { withCronLock } from "../lib/cronLock";
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
    log.error({ err }, "activateScheduled error");
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
    log.error({ err }, "endExpired error");
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
    log.error({ err }, "closePeriods error");
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
    log.error({ err }, "invoiceReminders error");
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
    log.error({ err }, "rolloverExpired error");
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
    log.error({ err }, "vfRetryPending error");
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
    log.error({ err }, "vfAlertStale error");
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
    log.error({ err }, "expirePurchases error");
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
    log.error({ err }, "expirationReminders error");
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
    log.error({ err }, "alertStaleDisputes error");
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
    log.error({ err }, "alertLatePayments error");
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
    log.error({ err }, "reconciliation error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/finance/retry-pending
const cronFinanceRetryPending: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const result = await retryPendingFinanceOperations();
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "financeRetryPending error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/finance/detect-stuck-refunds
const cronDetectStuckRefunds: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const stuckCount = await detectStuckRefunds();
    res.json({ ok: true, stuckCount });
  } catch (err) {
    log.error({ err }, "detectStuckRefunds error");
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
  // Finance retry queue
  { name: "finance-retry-pending", schedule: "every_15min", fn: retryPendingFinanceOperations },
  { name: "finance-detect-stuck-refunds", schedule: "daily", dailyHour: 7, fn: detectStuckRefunds },
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
      // Wrap each job in a cron lock to prevent concurrent executions
      const lockResult = await withCronLock(job.name, job.fn);
      if (lockResult.skipped) {
        results[job.name] = { ok: true, result: { skipped: true } };
      } else {
        results[job.name] = { ok: true, result: lockResult.result };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ jobName: job.name, error: message }, "Cron job failed");
      results[job.name] = { ok: false, error: message };
    }
  }

  const jobsRun = Object.keys(results).length;
  log.info({ jobsRun }, "run-all completed");

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
  // Finance retry queue
  app.post("/api/admin/cron/finance/retry-pending", cronFinanceRetryPending);
  app.post("/api/admin/cron/finance/detect-stuck-refunds", cronDetectStuckRefunds);
  // Phase 6 routes
  app.post("/api/admin/cron/packs/expire-purchases", cronExpirePurchases);
  app.post("/api/admin/cron/packs/expiration-reminders", cronExpirationReminders);
  app.post("/api/admin/cron/billing/alert-stale-disputes", cronAlertStaleDisputes);
  app.post("/api/admin/cron/billing/alert-late-payments", cronAlertLatePayments);
  app.post("/api/admin/cron/billing/reconciliation", cronReconciliation);
  // Master runner
  app.post("/api/admin/cron/packs/run-all", cronRunAll);
}
