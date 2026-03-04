/**
 * Support Cron Endpoints
 *
 * Auth: x-cron-secret header
 * Plesk cron: * /1 * * * * curl -s -X POST https://sam.ma/api/admin/cron/support/run-all -H "x-cron-secret: $CRON_SECRET"
 */

import type { RequestHandler } from "express";
import { expireUnansweredChats, sendUnreadMessageEmails } from "../supportCron";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("supportCron");

function verifyCronSecret(req: { header: (name: string) => string | undefined }): boolean {
  const secret = req.header("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return secret === expected;
}

/**
 * POST /api/admin/cron/support/expire-unanswered
 * 5-min timer: insert system message for unanswered chats
 */
export const cronExpireUnanswered: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const result = await expireUnansweredChats();
  res.json({ ok: true, ...result });
};

/**
 * POST /api/admin/cron/support/send-unread-emails
 * Email notification for unread messages > 15min
 */
export const cronSendUnreadEmails: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const result = await sendUnreadMessageEmails();
  res.json({ ok: true, ...result });
};

type CronJob = {
  name: string;
  schedule: "every_1min" | "every_15min";
  handler: () => Promise<Record<string, unknown>>;
};

const CRON_JOBS: CronJob[] = [
  { name: "expire-unanswered", schedule: "every_1min", handler: expireUnansweredChats },
  { name: "send-unread-emails", schedule: "every_15min", handler: sendUnreadMessageEmails },
];

function isJobDueNow(schedule: CronJob["schedule"]): boolean {
  const minute = new Date().getMinutes();
  switch (schedule) {
    case "every_1min":
      return true;
    case "every_15min":
      return minute % 15 === 0;
    default:
      return false;
  }
}

/**
 * POST /api/admin/cron/support/run-all
 * Master runner — smart scheduling
 */
export const cronRunAll: RequestHandler = async (req, res) => {
  if (!verifyCronSecret(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const smart = req.query.smart !== "false";
  const results: Record<string, unknown> = {};

  for (const job of CRON_JOBS) {
    if (smart && !isJobDueNow(job.schedule)) {
      results[job.name] = "skipped (not due)";
      continue;
    }
    try {
      results[job.name] = await job.handler();
    } catch (e) {
      log.error({ job: job.name, err: e }, "Cron job error");
      results[job.name] = { error: String(e) };
    }
  }

  res.json({ ok: true, results });
};

export function registerSupportCronRoutes(app: import("express").Express): void {
  app.post("/api/admin/cron/support/expire-unanswered", cronExpireUnanswered);
  app.post("/api/admin/cron/support/send-unread-emails", cronSendUnreadEmails);
  app.post("/api/admin/cron/support/run-all", cronRunAll);
}
