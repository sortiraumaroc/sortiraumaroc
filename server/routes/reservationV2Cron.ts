/**
 * Reservation V2 — Cron Routes
 *
 * HTTP endpoints for all V2 cron jobs.
 * All endpoints are POST and authenticated via x-cron-secret header.
 * Can also be called individually or via the master runner.
 */

import type { Router, Request, Response } from "express";
import {
  expireUnprocessedReservations,
  remindProUnprocessedReservations,
  requestVenueConfirmation,
  remindVenueConfirmation,
  autoValidateVenue,
  expireNoShowDisputesCron,
  freezeBufferSlots,
  sendUpgradeReminders,
  recalculateProTrustScores,
  autoLiftClientSuspensionsCron,
  autoLiftProDeactivationsCron,
  detectScoringPatterns,
  expireQuotesCron,
  runAllCronJobs,
  getCronJobSchedules,
} from "../reservationCronV2";

// =============================================================================
// Cron secret verification (matches existing pattern)
// =============================================================================

function verifyCronSecret(req: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const cronSecret = req.headers["x-cron-secret"];
  return cronSecret === process.env.CRON_SECRET;
}

// =============================================================================
// Individual cron endpoints
// =============================================================================

async function cronExpireUnprocessed(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  try {
    const result = await expireUnprocessedReservations();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cronExpireUnprocessed] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}

async function cronRemindProUnprocessed(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  try {
    const result = await remindProUnprocessedReservations();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cronRemindProUnprocessed] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}

async function cronVenueConfirmationH12(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  try {
    const result = await requestVenueConfirmation();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cronVenueConfirmationH12] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}

async function cronVenueConfirmationH18(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  try {
    const result = await remindVenueConfirmation();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cronVenueConfirmationH18] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}

async function cronAutoValidateH24(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  try {
    const result = await autoValidateVenue();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cronAutoValidateH24] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}

async function cronExpireNoShowDisputes(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  try {
    const result = await expireNoShowDisputesCron();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cronExpireNoShowDisputes] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}

async function cronFreezeBuffer(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  try {
    const result = await freezeBufferSlots();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cronFreezeBuffer] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}

async function cronUpgradeReminders(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  try {
    const result = await sendUpgradeReminders();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cronUpgradeReminders] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}

async function cronRecalcProTrust(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  try {
    const result = await recalculateProTrustScores();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cronRecalcProTrust] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}

async function cronLiftClientSuspensions(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  try {
    const result = await autoLiftClientSuspensionsCron();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cronLiftClientSuspensions] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}

async function cronLiftProDeactivations(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  try {
    const result = await autoLiftProDeactivationsCron();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cronLiftProDeactivations] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}

async function cronDetectPatterns(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  try {
    const result = await detectScoringPatterns();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cronDetectPatterns] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}

async function cronExpireQuotes(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  try {
    const result = await expireQuotesCron();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cronExpireQuotes] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}

// =============================================================================
// Master runner: run all or specific cron jobs
// =============================================================================

async function cronRunAll(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  try {
    const body = req.body as Record<string, unknown>;
    const only = Array.isArray(body.only) ? body.only.map(String) : undefined;
    // smart=true by default: only runs jobs that are due based on current time
    // Pass smart=false in body to force all jobs
    const smart = body.smart !== false;
    const results = await runAllCronJobs({ only, smart });
    res.json({ ok: true, jobsRun: results.length, results });
  } catch (err) {
    console.error("[cronRunAll] Error:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}

async function cronSchedules(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(401).json({ ok: false, error: "Invalid cron secret" });
  res.json({ ok: true, schedules: getCronJobSchedules() });
}

// =============================================================================
// Route registration
// =============================================================================

export function registerReservationV2CronRoutes(app: Router): void {
  // Individual cron endpoints
  app.post("/api/admin/cron/v2/expire-unprocessed", cronExpireUnprocessed);
  app.post("/api/admin/cron/v2/remind-pro-unprocessed", cronRemindProUnprocessed);
  app.post("/api/admin/cron/v2/venue-confirmation-h12", cronVenueConfirmationH12);
  app.post("/api/admin/cron/v2/venue-confirmation-h18", cronVenueConfirmationH18);
  app.post("/api/admin/cron/v2/auto-validate-h24", cronAutoValidateH24);
  app.post("/api/admin/cron/v2/expire-no-show-disputes", cronExpireNoShowDisputes);
  app.post("/api/admin/cron/v2/freeze-buffer", cronFreezeBuffer);
  app.post("/api/admin/cron/v2/upgrade-reminders", cronUpgradeReminders);
  app.post("/api/admin/cron/v2/recalc-pro-trust", cronRecalcProTrust);
  app.post("/api/admin/cron/v2/lift-client-suspensions", cronLiftClientSuspensions);
  app.post("/api/admin/cron/v2/lift-pro-deactivations", cronLiftProDeactivations);
  app.post("/api/admin/cron/v2/detect-patterns", cronDetectPatterns);
  app.post("/api/admin/cron/v2/expire-quotes", cronExpireQuotes);

  // Master runner
  app.post("/api/admin/cron/v2/run-all", cronRunAll);

  // Schedule info (GET for convenience, POST also works)
  app.get("/api/admin/cron/v2/schedules", cronSchedules);
  app.post("/api/admin/cron/v2/schedules", cronSchedules);
}
