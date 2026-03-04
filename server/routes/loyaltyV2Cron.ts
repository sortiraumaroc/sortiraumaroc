/**
 * Loyalty V2 — Cron Routes
 *
 * 10 endpoints cron + 1 master runner :
 * - expire-cards, expire-rewards, expire-gifts
 * - remind-cards-j15, remind-rewards-j7, remind-rewards-j2, remind-gifts-j7
 * - fraud-detection
 * - send-pending-notifications
 * - run-all (smart scheduler)
 * - schedules (GET, admin info)
 */

import type { Router, Request, Response } from "express";
import { createModuleLogger } from "../lib/logger";
import {
  runAllLoyaltyCronJobs,
  getLoyaltyCronSchedules,
  expireLoyaltyCards,
  expireLoyaltyRewards,
  expirePlatformGiftDistributions,
  remindExpiringCards,
  remindExpiringRewardsJ7,
  remindExpiringRewardsJ2,
  remindExpiringPlatformGiftsJ7,
  runFraudDetection,
  sendPendingNotifications,
} from "../loyaltyCronV2";

const log = createModuleLogger("loyaltyV2Cron");

// =============================================================================
// Cron auth (same pattern as reservationV2Cron.ts)
// =============================================================================

function verifyCronSecret(req: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const cronSecret = req.headers["x-cron-secret"];
  return cronSecret === process.env.CRON_SECRET;
}

// =============================================================================
// Handlers
// =============================================================================

async function cronExpireCards(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(403).json({ error: "forbidden" });
  try {
    const result = await expireLoyaltyCards();
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "cronExpireCards error");
    res.status(500).json({ error: "internal_error" });
  }
}

async function cronExpireRewards(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(403).json({ error: "forbidden" });
  try {
    const result = await expireLoyaltyRewards();
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "cronExpireRewards error");
    res.status(500).json({ error: "internal_error" });
  }
}

async function cronExpireGifts(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(403).json({ error: "forbidden" });
  try {
    const result = await expirePlatformGiftDistributions();
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "cronExpireGifts error");
    res.status(500).json({ error: "internal_error" });
  }
}

async function cronRemindCardsJ15(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(403).json({ error: "forbidden" });
  try {
    const result = await remindExpiringCards();
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "cronRemindCardsJ15 error");
    res.status(500).json({ error: "internal_error" });
  }
}

async function cronRemindRewardsJ7(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(403).json({ error: "forbidden" });
  try {
    const result = await remindExpiringRewardsJ7();
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "cronRemindRewardsJ7 error");
    res.status(500).json({ error: "internal_error" });
  }
}

async function cronRemindRewardsJ2(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(403).json({ error: "forbidden" });
  try {
    const result = await remindExpiringRewardsJ2();
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "cronRemindRewardsJ2 error");
    res.status(500).json({ error: "internal_error" });
  }
}

async function cronRemindGiftsJ7(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(403).json({ error: "forbidden" });
  try {
    const result = await remindExpiringPlatformGiftsJ7();
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "cronRemindGiftsJ7 error");
    res.status(500).json({ error: "internal_error" });
  }
}

async function cronFraudDetection(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(403).json({ error: "forbidden" });
  try {
    const result = await runFraudDetection();
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "cronFraudDetection error");
    res.status(500).json({ error: "internal_error" });
  }
}

async function cronSendPendingNotifications(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(403).json({ error: "forbidden" });
  try {
    const result = await sendPendingNotifications();
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "cronSendPendingNotifications error");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// Master runner
// =============================================================================

async function cronRunAll(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(403).json({ error: "forbidden" });
  try {
    const forceAll = req.query.force === "true";
    const { results } = await runAllLoyaltyCronJobs({ smart: !forceAll, forceAll });
    res.json({ ok: true, results });
  } catch (err) {
    log.error({ err }, "cronRunAll error");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// Schedules (admin info)
// =============================================================================

async function getSchedules(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(403).json({ error: "forbidden" });
  const schedules = getLoyaltyCronSchedules();
  res.json({ ok: true, schedules });
}

// =============================================================================
// Route registration
// =============================================================================

export function registerLoyaltyV2CronRoutes(app: Router): void {
  // Individual cron endpoints
  app.post("/api/admin/cron/loyalty-v2/expire-cards", cronExpireCards);
  app.post("/api/admin/cron/loyalty-v2/expire-rewards", cronExpireRewards);
  app.post("/api/admin/cron/loyalty-v2/expire-gifts", cronExpireGifts);
  app.post("/api/admin/cron/loyalty-v2/remind-cards-j15", cronRemindCardsJ15);
  app.post("/api/admin/cron/loyalty-v2/remind-rewards-j7", cronRemindRewardsJ7);
  app.post("/api/admin/cron/loyalty-v2/remind-rewards-j2", cronRemindRewardsJ2);
  app.post("/api/admin/cron/loyalty-v2/remind-gifts-j7", cronRemindGiftsJ7);
  app.post("/api/admin/cron/loyalty-v2/fraud-detection", cronFraudDetection);
  app.post("/api/admin/cron/loyalty-v2/send-pending-notifications", cronSendPendingNotifications);

  // Master runner
  app.post("/api/admin/cron/loyalty-v2/run-all", cronRunAll);

  // Schedules
  app.get("/api/admin/cron/loyalty-v2/schedules", getSchedules);
}
