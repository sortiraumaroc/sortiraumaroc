/**
 * Routes Cron Ramadan — Tâches automatisées
 *
 * POST /api/cron/ramadan/activate  — Activer les offres approuvées
 * POST /api/cron/ramadan/expire    — Expirer les offres passées
 *
 * Ces endpoints sont protégés par une clé cron (CRON_SECRET).
 * Ils sont appelés par un scheduler externe (cron, Supabase Edge Function, etc.)
 */

import { Router } from "express";
import type { RequestHandler } from "express";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("ramadanCron");
import {
  activateScheduledRamadanOffers,
  expireRamadanOffers,
} from "../ramadanOfferLogic";

// =============================================================================
// Auth cron
// =============================================================================

function ensureCronAuth(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
): boolean {
  const cronSecret = process.env.CRON_SECRET ?? process.env.ADMIN_API_KEY ?? "";
  const provided = (req.header("x-cron-secret") ?? req.header("x-admin-key") ?? "").trim();

  if (!cronSecret || !provided || provided !== cronSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

// =============================================================================
// Router
// =============================================================================

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/cron/ramadan/activate — Activer les offres programmées
// ---------------------------------------------------------------------------
router.post("/activate", (async (req, res) => {
  if (!ensureCronAuth(req, res)) return;

  try {
    const count = await activateScheduledRamadanOffers();
    return res.json({ ok: true, activated: count });
  } catch (e) {
    log.error({ err: e }, "Activate error");
    return res.status(500).json({ error: "Erreur interne." });
  }
}) as RequestHandler);

// ---------------------------------------------------------------------------
// POST /api/cron/ramadan/expire — Expirer les offres dépassées
// ---------------------------------------------------------------------------
router.post("/expire", (async (req, res) => {
  if (!ensureCronAuth(req, res)) return;

  try {
    const count = await expireRamadanOffers();
    return res.json({ ok: true, expired: count });
  } catch (e) {
    log.error({ err: e }, "Expire error");
    return res.status(500).json({ error: "Erreur interne." });
  }
}) as RequestHandler);

export default router;
