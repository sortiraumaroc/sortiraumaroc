/**
 * Prompt 14 — Admin routes for contextual boosting management
 *
 * Endpoints:
 *   GET  /api/admin/search/boost-rules          List all rules (hardcoded + events)
 *   POST /api/admin/search/boost-events          Create event rule
 *   PUT  /api/admin/search/boost-events/:id      Update event rule
 *   DELETE /api/admin/search/boost-events/:id    Soft-delete event rule
 *   GET  /api/admin/search/boost-debug           Simulate boosts at a date
 */

import type { Express, Request, Response } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { requireAdminKey } from "./admin";
import { zBody, zParams, zIdParam } from "../lib/validate";
import { CreateBoostEventSchema, UpdateBoostEventSchema } from "../schemas/adminSearchBoost";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("adminSearchBoost");
import {
  getAllHardcodedRules,
  getContextualBoostsForNow,
  simulateBoostsAtDate,
} from "../lib/search/contextualBoosting";

export function registerAdminSearchBoostRoutes(app: Express): void {
  // ───────────────────────────────────────────────────────────────────
  // GET /api/admin/search/boost-rules
  // ───────────────────────────────────────────────────────────────────
  app.get("/api/admin/search/boost-rules", async (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;

    try {
      const hardcoded = getAllHardcodedRules().map((r) => ({
        id: r.id,
        name: r.name,
        condition: r.condition,
        effect: r.effect,
        priority: r.priority,
        source: r.source,
      }));

      const supabase = getAdminSupabase();
      const { data: events, error } = await supabase
        .from("search_boost_events")
        .select("*")
        .order("date_from", { ascending: false });

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      const currentBoosts = await getContextualBoostsForNow();

      return res.json({
        ok: true,
        hardcoded_rules: hardcoded,
        event_rules: events ?? [],
        current_boosts: currentBoosts,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      log.error({ err: msg }, "boost-rules error");
      return res.status(500).json({ error: msg });
    }
  });

  // ───────────────────────────────────────────────────────────────────
  // POST /api/admin/search/boost-events
  // ───────────────────────────────────────────────────────────────────
  app.post("/api/admin/search/boost-events", zBody(CreateBoostEventSchema), async (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;

    try {
      const { name, date_from, date_to, boost_config, priority } = req.body ?? {};

      if (!name || typeof name !== "string" || name.length > 100) {
        return res.status(400).json({ error: "name required (max 100 chars)" });
      }
      if (!date_from || !date_to || typeof date_from !== "string" || typeof date_to !== "string") {
        return res.status(400).json({ error: "date_from and date_to required (YYYY-MM-DD)" });
      }
      if (date_from > date_to) {
        return res.status(400).json({ error: "date_from must be <= date_to" });
      }
      if (!boost_config || typeof boost_config !== "object") {
        return res.status(400).json({ error: "boost_config required (object)" });
      }

      const supabase = getAdminSupabase();
      const { data, error } = await supabase
        .from("search_boost_events")
        .insert({
          name: name.trim().slice(0, 100),
          date_from,
          date_to,
          boost_config,
          priority: typeof priority === "number" ? Math.max(1, Math.min(100, priority)) : 50,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.json({ ok: true, event: data });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      log.error({ err: msg }, "boost-events create error");
      return res.status(500).json({ error: msg });
    }
  });

  // ───────────────────────────────────────────────────────────────────
  // PUT /api/admin/search/boost-events/:id
  // ───────────────────────────────────────────────────────────────────
  app.put("/api/admin/search/boost-events/:id", zParams(zIdParam), zBody(UpdateBoostEventSchema), async (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;

    try {
      const { id } = req.params;
      const updates: Record<string, unknown> = {};

      if (req.body.name != null) updates.name = String(req.body.name).trim().slice(0, 100);
      if (req.body.date_from != null) updates.date_from = req.body.date_from;
      if (req.body.date_to != null) updates.date_to = req.body.date_to;
      if (req.body.boost_config != null) updates.boost_config = req.body.boost_config;
      if (req.body.priority != null) updates.priority = Math.max(1, Math.min(100, Number(req.body.priority)));
      if (req.body.is_active != null) updates.is_active = Boolean(req.body.is_active);

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      updates.updated_at = new Date().toISOString();

      const supabase = getAdminSupabase();
      const { data, error } = await supabase
        .from("search_boost_events")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }
      if (!data) {
        return res.status(404).json({ error: "Event not found" });
      }

      return res.json({ ok: true, event: data });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      log.error({ err: msg }, "boost-events update error");
      return res.status(500).json({ error: msg });
    }
  });

  // ───────────────────────────────────────────────────────────────────
  // DELETE /api/admin/search/boost-events/:id (soft-delete)
  // ───────────────────────────────────────────────────────────────────
  app.delete("/api/admin/search/boost-events/:id", zParams(zIdParam), async (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;

    try {
      const { id } = req.params;
      const supabase = getAdminSupabase();

      const { error } = await supabase
        .from("search_boost_events")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      log.error({ err: msg }, "boost-events delete error");
      return res.status(500).json({ error: msg });
    }
  });

  // ───────────────────────────────────────────────────────────────────
  // GET /api/admin/search/boost-debug?date=2026-02-14T20:00:00
  // ───────────────────────────────────────────────────────────────────
  app.get("/api/admin/search/boost-debug", async (req: Request, res: Response) => {
    if (!requireAdminKey(req, res)) return;

    try {
      const dateParam = typeof req.query.date === "string" ? req.query.date : "";

      if (!dateParam) {
        // Default: current moment
        const boosts = await getContextualBoostsForNow();
        return res.json({ ok: true, date: new Date().toISOString(), boosts });
      }

      const boosts = await simulateBoostsAtDate(dateParam);
      return res.json({ ok: true, date: dateParam, boosts });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Internal error";
      log.error({ err: msg }, "boost-debug error");
      return res.status(500).json({ error: msg });
    }
  });
}
