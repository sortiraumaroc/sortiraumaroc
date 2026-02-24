/**
 * User Preferences Cron Routes (Prompt 12)
 *
 * Endpoints:
 *  - POST /api/admin/cron/preferences/recompute-active — daily recompute for active users
 *  - POST /api/admin/cron/preferences/run-all          — master runner
 */

import type { Router, Request, RequestHandler } from "express";
import { recomputeActiveUserPreferences } from "../lib/userPreferences";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("preferenceCron");

// =============================================================================
// Cron auth
// =============================================================================

function verifyCronSecret(req: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const cronSecret = req.headers["x-cron-secret"];
  return cronSecret === process.env.CRON_SECRET;
}

// =============================================================================
// Individual handlers
// =============================================================================

// POST /api/admin/cron/preferences/recompute-active
const cronRecomputeActive: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  try {
    const result = await recomputeActiveUserPreferences();
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "recompute-active error");
    res.status(500).json({ ok: false, error: "internal_error" });
  }
};

// =============================================================================
// Master runner: POST /api/admin/cron/preferences/run-all
// =============================================================================

interface CronJobConfig {
  name: string;
  fn: () => Promise<unknown>;
  schedule: "daily";
  dailyHour: number;
  dailyMinute: number;
}

const CRON_JOBS: CronJobConfig[] = [
  {
    name: "recompute-active",
    fn: recomputeActiveUserPreferences,
    schedule: "daily",
    dailyHour: 3,
    dailyMinute: 0,
  },
];

function isJobDueNow(config: CronJobConfig, now: Date): boolean {
  const hour = now.getHours();
  const minute = now.getMinutes();
  if (config.schedule === "daily") {
    return hour === config.dailyHour && Math.abs(minute - config.dailyMinute) < 5;
  }
  return false;
}

const cronRunAll: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ ok: false, error: "Invalid cron secret" });
    return;
  }

  const smart = String(req.query.smart ?? "true") !== "false";
  const now = new Date();
  const results: Record<string, unknown> = {};

  for (const job of CRON_JOBS) {
    if (smart && !isJobDueNow(job, now)) continue;

    try {
      results[job.name] = await job.fn();
    } catch (err) {
      results[job.name] = { error: (err as Error).message };
    }
  }

  const jobsRun = Object.keys(results).length;
  log.info({ jobsRun }, "run-all completed");
  res.json({ ok: true, jobsRun, results });
};

// =============================================================================
// Route registration
// =============================================================================

export function registerPreferenceCronRoutes(app: Router): void {
  app.post("/api/admin/cron/preferences/recompute-active", cronRecomputeActive);
  app.post("/api/admin/cron/preferences/run-all", cronRunAll);
}
