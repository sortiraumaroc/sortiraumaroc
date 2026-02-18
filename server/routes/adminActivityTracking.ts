import type { RequestHandler, Router } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { requireAdminKey, requireSuperadmin } from "./admin";

// ─────────────────────────────────────────────────────────────────────────────
// Admin Activity Tracking — heartbeat-based active time measurement
// ─────────────────────────────────────────────────────────────────────────────

export function registerAdminActivityTrackingRoutes(router: Router): void {
  // ─── POST /api/admin/activity/heartbeat ──────────────────────────────────
  // Called every 30s by the client activity tracker for any logged-in admin.
  // Stores a heartbeat with the number of active seconds detected since last tick.
  // ──────────────────────────────────────────────────────────────────────────
  router.post("/api/admin/activity/heartbeat", (async (req, res) => {
    if (!requireAdminKey(req, res)) return;

    try {
      const session = (req as any).adminSession;
      if (!session?.collaborator_id) {
        return res.status(400).json({ error: "Session missing collaborator_id" });
      }

      const { session_id, active_seconds, page_path } = req.body ?? {};

      // Validate session_id
      if (!session_id || typeof session_id !== "string" || session_id.length > 100) {
        return res.status(400).json({ error: "Invalid session_id" });
      }

      // Validate active_seconds
      const seconds = Number(active_seconds);
      if (!Number.isInteger(seconds) || seconds < 1 || seconds > 120) {
        return res.status(400).json({ error: "active_seconds must be between 1 and 120" });
      }

      // Validate page_path (optional)
      const path = typeof page_path === "string" ? page_path.slice(0, 500) : null;

      const supabase = getAdminSupabase();
      const { error } = await supabase.from("admin_activity_heartbeats").insert({
        collaborator_id: session.collaborator_id,
        session_id,
        active_seconds: seconds,
        page_path: path,
      });

      if (error) {
        console.error("[activity-heartbeat] insert error:", error.message);
        return res.status(500).json({ error: "Failed to record heartbeat" });
      }

      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[activity-heartbeat] error:", err?.message ?? err);
      return res.status(500).json({ error: "Internal error" });
    }
  }) as RequestHandler);

  // ─── GET /api/admin/activity/stats ───────────────────────────────────────
  // Superadmin-only. Returns aggregated activity stats per collaborator
  // for a given date range, joined with establishment creation counts.
  // ──────────────────────────────────────────────────────────────────────────
  router.get("/api/admin/activity/stats", (async (req, res) => {
    if (!requireSuperadmin(req, res)) return;

    try {
      const from = typeof req.query.from === "string" ? req.query.from : formatToday();
      const to = typeof req.query.to === "string" ? req.query.to : formatToday();

      // Validate date format (YYYY-MM-DD)
      if (!isValidDate(from) || !isValidDate(to)) {
        return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
      }

      const supabase = getAdminSupabase();

      // Run all 3 queries in parallel
      const [activityResult, establishmentResult, collaboratorsResult] = await Promise.all([
        // 1. Activity stats via SQL function
        supabase.rpc("get_admin_activity_stats", {
          start_date: from,
          end_date: to,
        }),
        // 2. Establishment counts via SQL function
        supabase.rpc("get_admin_establishment_counts", {
          start_date: from,
          end_date: to,
        }),
        // 3. All collaborators for metadata
        supabase
          .from("admin_collaborators")
          .select("id, display_name, first_name, last_name, email, role_id, status")
          .eq("status", "active"),
      ]);

      if (activityResult.error) {
        console.error("[activity-stats] rpc get_admin_activity_stats error:", activityResult.error.message);
        return res.status(500).json({ error: "Failed to fetch activity stats" });
      }

      if (establishmentResult.error) {
        console.error("[activity-stats] rpc get_admin_establishment_counts error:", establishmentResult.error.message);
        return res.status(500).json({ error: "Failed to fetch establishment counts" });
      }

      if (collaboratorsResult.error) {
        console.error("[activity-stats] collaborators query error:", collaboratorsResult.error.message);
        return res.status(500).json({ error: "Failed to fetch collaborators" });
      }

      // Build lookup maps
      const activityMap = new Map<string, {
        session_count: number;
        total_active_seconds: number;
        first_heartbeat: string | null;
        last_heartbeat: string | null;
      }>();
      for (const row of activityResult.data ?? []) {
        activityMap.set(row.collaborator_id, {
          session_count: Number(row.session_count) || 0,
          total_active_seconds: Number(row.total_active_seconds) || 0,
          first_heartbeat: row.first_heartbeat ?? null,
          last_heartbeat: row.last_heartbeat ?? null,
        });
      }

      const estabMap = new Map<string, number>();
      for (const row of establishmentResult.data ?? []) {
        estabMap.set(row.collaborator_id, Number(row.establishment_count) || 0);
      }

      // Build response per collaborator
      let totalActiveSeconds = 0;
      let totalEstablishments = 0;
      let activeCollaborators = 0;

      const collaborators = (collaboratorsResult.data ?? []).map((c: any) => {
        const activity = activityMap.get(c.id);
        const estabCount = estabMap.get(c.id) ?? 0;
        const seconds = activity?.total_active_seconds ?? 0;

        if (seconds > 0) activeCollaborators++;
        totalActiveSeconds += seconds;
        totalEstablishments += estabCount;

        const displayName = c.display_name?.trim()
          || [c.first_name, c.last_name].filter(Boolean).join(" ").trim()
          || c.email
          || "Inconnu";

        return {
          collaborator_id: c.id,
          name: displayName,
          email: c.email,
          role: c.role_id,
          total_active_seconds: seconds,
          session_count: activity?.session_count ?? 0,
          establishments_created: estabCount,
          avg_seconds_per_establishment: estabCount > 0 ? Math.round(seconds / estabCount) : null,
          first_heartbeat: activity?.first_heartbeat ?? null,
          last_heartbeat: activity?.last_heartbeat ?? null,
        };
      });

      // Sort by total_active_seconds DESC (most active first)
      collaborators.sort((a: any, b: any) => b.total_active_seconds - a.total_active_seconds);

      return res.json({
        ok: true,
        period: { from, to },
        summary: {
          total_active_seconds: totalActiveSeconds,
          total_establishments: totalEstablishments,
          active_collaborators: activeCollaborators,
          avg_seconds_per_establishment:
            totalEstablishments > 0 ? Math.round(totalActiveSeconds / totalEstablishments) : null,
        },
        collaborators,
      });
    } catch (err: any) {
      console.error("[activity-stats] error:", err?.message ?? err);
      return res.status(500).json({ error: "Internal error" });
    }
  }) as RequestHandler);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatToday(): string {
  return new Date().toISOString().split("T")[0];
}

function isValidDate(str: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(Date.parse(str));
}
