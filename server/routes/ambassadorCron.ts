/**
 * Ambassador Program — Cron Routes
 *
 * 4 endpoints cron :
 * - expire-conversions : expirer les conversions pending > 48h
 * - expire-rewards : expirer les récompenses actives dépassées
 * - remind-applications : rappeler les candidatures pending > 48h
 * - run-all : exécuter les 3 jobs séquentiellement
 */

import type { Router, Request, Response } from "express";
import { createModuleLogger } from "../lib/logger";
import {
  expirePendingConversions,
  expireActiveRewards,
  remindPendingApplications,
  runAllAmbassadorCronJobs,
} from "../ambassadorCronLogic";

const log = createModuleLogger("ambassadorCron");

// =============================================================================
// Cron auth (same pattern as loyaltyV2Cron.ts)
// =============================================================================

function verifyCronSecret(req: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const cronSecret = req.headers["x-cron-secret"];
  return cronSecret === process.env.CRON_SECRET;
}

// =============================================================================
// Handlers
// =============================================================================

async function cronExpireConversions(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(403).json({ error: "forbidden" });
  try {
    const result = await expirePendingConversions();
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "cronExpireConversions error");
    res.status(500).json({ error: "internal_error" });
  }
}

async function cronExpireRewards(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(403).json({ error: "forbidden" });
  try {
    const result = await expireActiveRewards();
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "cronExpireRewards error");
    res.status(500).json({ error: "internal_error" });
  }
}

async function cronRemindApplications(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(403).json({ error: "forbidden" });
  try {
    const result = await remindPendingApplications();
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "cronRemindApplications error");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// Master runner
// =============================================================================

async function cronRunAll(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(403).json({ error: "forbidden" });
  try {
    const { results } = await runAllAmbassadorCronJobs();
    res.json({ ok: true, results });
  } catch (err) {
    log.error({ err }, "cronRunAll error");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// Route registration
// =============================================================================

export function registerAmbassadorCronRoutes(app: Router): void {
  app.post("/api/admin/cron/ambassador/expire-conversions", cronExpireConversions);
  app.post("/api/admin/cron/ambassador/expire-rewards", cronExpireRewards);
  app.post("/api/admin/cron/ambassador/remind-applications", cronRemindApplications);
  app.post("/api/admin/cron/ambassador/run-all", cronRunAll);
}
