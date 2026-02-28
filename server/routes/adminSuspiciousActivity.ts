/**
 * Admin API — Gestion des alertes de comportement suspect
 *
 * GET  /api/admin/suspicious-activity        — Liste paginée avec filtres
 * GET  /api/admin/suspicious-activity/stats   — Compteurs agrégés
 * POST /api/admin/suspicious-activity/:id/resolve — Résoudre une alerte
 */

import type { RequestHandler, Express } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { requireAdminKey } from "./adminHelpers";

// =============================================================================
// List alerts
// =============================================================================

const listAlerts: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();

    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "50"), 10) || 50, 1), 200);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

    const resolvedFilter = req.query.resolved;
    const severity = typeof req.query.severity === "string" ? req.query.severity : undefined;
    const actorType = typeof req.query.actor_type === "string" ? req.query.actor_type : undefined;
    const alertType = typeof req.query.alert_type === "string" ? req.query.alert_type : undefined;
    const establishmentId = typeof req.query.establishment_id === "string" ? req.query.establishment_id : undefined;

    let query = supabase
      .from("suspicious_activity_alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (resolvedFilter === "true") query = query.eq("resolved", true);
    else if (resolvedFilter === "false") query = query.eq("resolved", false);

    if (severity) query = query.eq("severity", severity);
    if (actorType) query = query.eq("actor_type", actorType);
    if (alertType) query = query.eq("alert_type", alertType);
    if (establishmentId) query = query.eq("establishment_id", establishmentId);

    const { data, error } = await query;

    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true, items: data ?? [], hasMore: (data ?? []).length === limit });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
};

// =============================================================================
// Stats
// =============================================================================

const getAlertStats: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();

    // Total non résolu
    const { count: unresolvedCount } = await supabase
      .from("suspicious_activity_alerts")
      .select("id", { count: "exact", head: true })
      .eq("resolved", false);

    // Total résolu
    const { count: resolvedCount } = await supabase
      .from("suspicious_activity_alerts")
      .select("id", { count: "exact", head: true })
      .eq("resolved", true);

    // Par sévérité (non résolu)
    const { count: criticalCount } = await supabase
      .from("suspicious_activity_alerts")
      .select("id", { count: "exact", head: true })
      .eq("resolved", false)
      .eq("severity", "critical");

    const { count: warningCount } = await supabase
      .from("suspicious_activity_alerts")
      .select("id", { count: "exact", head: true })
      .eq("resolved", false)
      .eq("severity", "warning");

    // Par acteur (non résolu)
    const { count: consumerCount } = await supabase
      .from("suspicious_activity_alerts")
      .select("id", { count: "exact", head: true })
      .eq("resolved", false)
      .eq("actor_type", "consumer");

    const { count: proCount } = await supabase
      .from("suspicious_activity_alerts")
      .select("id", { count: "exact", head: true })
      .eq("resolved", false)
      .eq("actor_type", "pro");

    res.json({
      ok: true,
      total: (unresolvedCount ?? 0) + (resolvedCount ?? 0),
      unresolved: unresolvedCount ?? 0,
      resolved: resolvedCount ?? 0,
      by_severity: {
        critical: criticalCount ?? 0,
        warning: warningCount ?? 0,
      },
      by_actor_type: {
        consumer: consumerCount ?? 0,
        pro: proCount ?? 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
};

// =============================================================================
// Resolve alert
// =============================================================================

const resolveAlert: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    if (!id) return res.status(400).json({ error: "id is required" });

    const body = req.body as Record<string, unknown>;
    const resolvedBy = typeof body.resolved_by === "string" ? body.resolved_by : "admin";
    const notes = typeof body.resolution_notes === "string" ? body.resolution_notes : null;

    const supabase = getAdminSupabase();

    const { error } = await supabase
      .from("suspicious_activity_alerts")
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy,
        resolution_notes: notes,
      })
      .eq("id", id);

    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erreur interne" });
  }
};

// =============================================================================
// Registration
// =============================================================================

export function registerAdminSuspiciousActivityRoutes(app: Express) {
  app.get("/api/admin/suspicious-activity", listAlerts);
  app.get("/api/admin/suspicious-activity/stats", getAlertStats);
  app.post("/api/admin/suspicious-activity/:id/resolve", resolveAlert);
}
