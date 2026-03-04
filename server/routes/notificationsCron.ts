/**
 * Notifications / Banners / Wheel — Cron Routes
 *
 * 10 individual cron endpoints + 1 master runner:
 *  - POST /api/admin/cron/campaigns/send-scheduled         — process scheduled push campaigns
 *  - POST /api/admin/cron/banners/expire                   — expire old banners
 *  - POST /api/admin/cron/wheel/daily-reminders            — send daily not-played reminders
 *  - POST /api/admin/cron/wheel/prize-expiry-reminders     — send prize expiration reminders
 *  - POST /api/admin/cron/wheel/expire-prizes              — expire unconsumed prizes
 *  - POST /api/admin/cron/wheel/admin-recap                — send daily admin recap
 *  - POST /api/admin/cron/wheel/end-expired                — end expired wheel events
 *  - POST /api/admin/cron/wheel/alert-depleted             — alert depleted prize stocks
 *  - POST /api/admin/cron/wheel/detect-fraud               — run fraud detection scan
 *  - POST /api/admin/cron/notifications/run-all            — master runner (smart scheduling)
 */

import type { Router, Request, Response, RequestHandler } from "express";
import { createModuleLogger } from "../lib/logger";
import { processScheduledCampaigns } from "../pushCampaignLogic";

const log = createModuleLogger("notificationsCron");
import { expireOldBanners } from "../bannerLogic";
import {
  sendDailyNotPlayedReminders,
  sendPrizeExpirationReminders,
  expireUnconsumedPrizes,
  sendDailyAdminRecap,
  endExpiredWheels,
  alertDepletedPrizes,
} from "../wheelCronLogic";
import { runFraudDetectionScan } from "../wheelFraudDetection";

// =============================================================================
// Cron auth (same pattern as packsCron.ts)
// =============================================================================

function verifyCronSecret(req: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const cronSecret = req.headers["x-cron-secret"];
  return cronSecret === process.env.CRON_SECRET;
}

// =============================================================================
// Individual cron handlers
// =============================================================================

// POST /api/admin/cron/campaigns/send-scheduled
const cronSendScheduledCampaigns: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const count = await processScheduledCampaigns();
    res.json({ ok: true, count });
  } catch (err) {
    log.error({ err }, "sendScheduledCampaigns error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/banners/expire
const cronExpireBanners: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const count = await expireOldBanners();
    res.json({ ok: true, count });
  } catch (err) {
    log.error({ err }, "expireBanners error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/wheel/daily-reminders
const cronDailyReminders: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const count = await sendDailyNotPlayedReminders();
    res.json({ ok: true, count });
  } catch (err) {
    log.error({ err }, "dailyReminders error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/wheel/prize-expiry-reminders
const cronPrizeExpiryReminders: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const count = await sendPrizeExpirationReminders();
    res.json({ ok: true, count });
  } catch (err) {
    log.error({ err }, "prizeExpiryReminders error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/wheel/expire-prizes
const cronExpirePrizes: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const count = await expireUnconsumedPrizes();
    res.json({ ok: true, count });
  } catch (err) {
    log.error({ err }, "expirePrizes error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/wheel/admin-recap
const cronAdminRecap: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const result = await sendDailyAdminRecap();
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "adminRecap error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/wheel/end-expired
const cronEndExpiredWheels: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const count = await endExpiredWheels();
    res.json({ ok: true, count });
  } catch (err) {
    log.error({ err }, "endExpiredWheels error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/wheel/alert-depleted
const cronAlertDepleted: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const count = await alertDepletedPrizes();
    res.json({ ok: true, count });
  } catch (err) {
    log.error({ err }, "alertDepleted error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// POST /api/admin/cron/wheel/detect-fraud
const cronDetectFraud: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const result = await runFraudDetectionScan();
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "detectFraud error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// =============================================================================
// Smart scheduling
// =============================================================================

type CronSchedule = "every_5min" | "every_15min" | "every_30min" | "every_1h" | "daily";

interface CronJob {
  name: string;
  handler: () => Promise<unknown>;
  schedule: CronSchedule;
  dailyHour?: number;
  dailyMinute?: number;
}

const CRON_JOBS: CronJob[] = [
  { name: "campaigns-send-scheduled", handler: processScheduledCampaigns, schedule: "every_5min" },
  { name: "banners-expire", handler: expireOldBanners, schedule: "daily", dailyHour: 0, dailyMinute: 0 },
  { name: "wheel-daily-reminders", handler: sendDailyNotPlayedReminders, schedule: "daily", dailyHour: 14, dailyMinute: 0 },
  { name: "wheel-prize-expiry-reminders", handler: sendPrizeExpirationReminders, schedule: "daily", dailyHour: 10, dailyMinute: 0 },
  { name: "wheel-expire-prizes", handler: expireUnconsumedPrizes, schedule: "daily", dailyHour: 0, dailyMinute: 0 },
  { name: "wheel-admin-recap", handler: sendDailyAdminRecap, schedule: "daily", dailyHour: 23, dailyMinute: 0 },
  { name: "wheel-end-expired", handler: endExpiredWheels, schedule: "daily", dailyHour: 0, dailyMinute: 0 },
  { name: "wheel-alert-depleted", handler: alertDepletedPrizes, schedule: "daily", dailyHour: 9, dailyMinute: 0 },
  { name: "wheel-detect-fraud", handler: runFraudDetectionScan, schedule: "daily", dailyHour: 5, dailyMinute: 0 },
];

function isJobDueNow(job: CronJob): boolean {
  const now = new Date();
  const minutes = now.getMinutes();
  const hours = now.getHours();

  switch (job.schedule) {
    case "every_5min":
      return true; // always run (called every 5min by Plesk cron)
    case "every_15min":
      return minutes % 15 < 5;
    case "every_30min":
      return minutes % 30 < 5;
    case "every_1h":
      return minutes < 5;
    case "daily":
      return hours === (job.dailyHour ?? 0) && minutes < 5;
    default:
      return false;
  }
}

// =============================================================================
// Master runner: POST /api/admin/cron/notifications/run-all
// =============================================================================

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
      const result = await job.handler();
      results[job.name] = { ok: true, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ err, jobName: job.name }, "Cron job failed");
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

export function registerNotificationsCronRoutes(app: Router): void {
  // Push campaigns
  app.post("/api/admin/cron/campaigns/send-scheduled", cronSendScheduledCampaigns);
  // Banners
  app.post("/api/admin/cron/banners/expire", cronExpireBanners);
  // Wheel of Fortune
  app.post("/api/admin/cron/wheel/daily-reminders", cronDailyReminders);
  app.post("/api/admin/cron/wheel/prize-expiry-reminders", cronPrizeExpiryReminders);
  app.post("/api/admin/cron/wheel/expire-prizes", cronExpirePrizes);
  app.post("/api/admin/cron/wheel/admin-recap", cronAdminRecap);
  app.post("/api/admin/cron/wheel/end-expired", cronEndExpiredWheels);
  app.post("/api/admin/cron/wheel/alert-depleted", cronAlertDepleted);
  app.post("/api/admin/cron/wheel/detect-fraud", cronDetectFraud);
  // Master runner
  app.post("/api/admin/cron/notifications/run-all", cronRunAll);
}
