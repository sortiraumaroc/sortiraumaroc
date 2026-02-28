/**
 * Suspicious Activity — Cron Routes
 *
 * Scan batch quotidien pour détecter les comportements suspects côté pro + consumer.
 * Auth: x-cron-secret header
 *
 * POST /api/admin/cron/suspicious-activity/scan
 */

import type { Router, Request, Response } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { reportSuspiciousActivity } from "../suspiciousActivity";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("suspiciousActivityCron");

// =============================================================================
// Cron auth
// =============================================================================

function verifyCronSecret(req: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const cronSecret = req.headers["x-cron-secret"];
  return cronSecret === process.env.CRON_SECRET;
}

// =============================================================================
// Scan logic
// =============================================================================

async function runSuspiciousActivityScan(): Promise<{
  consumer_alerts: number;
  pro_alerts: number;
}> {
  const supabase = getAdminSupabase();
  let consumerAlerts = 0;
  let proAlerts = 0;

  // -------------------------------------------------------------------------
  // 1. Pros avec taux de rejet/annulation > 50% sur 7 jours
  // -------------------------------------------------------------------------
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Récupérer les réservations par établissement sur les 7 derniers jours
    const { data: recentReservations } = await supabase
      .from("reservations")
      .select("establishment_id, status")
      .gte("created_at", sevenDaysAgo)
      .in("status", [
        "confirmed", "completed", "honored", "no_show",
        "rejected_by_pro", "cancelled_by_pro",
      ]);

    if (recentReservations && recentReservations.length > 0) {
      // Grouper par établissement
      const byEstab = new Map<string, { total: number; rejected: number }>();
      for (const r of recentReservations) {
        const eid = r.establishment_id as string;
        const curr = byEstab.get(eid) ?? { total: 0, rejected: 0 };
        curr.total++;
        if (r.status === "rejected_by_pro" || r.status === "cancelled_by_pro") {
          curr.rejected++;
        }
        byEstab.set(eid, curr);
      }

      for (const [establishmentId, stats] of byEstab) {
        if (stats.total < 5) continue; // Minimum 5 réservations pour être significatif
        const rejectionRate = stats.rejected / stats.total;
        if (rejectionRate <= 0.5) continue;

        // Trouver le owner_id de l'établissement
        const { data: estab } = await supabase
          .from("establishments")
          .select("owner_id")
          .eq("id", establishmentId)
          .maybeSingle();

        const ownerId = (estab as any)?.owner_id ?? "unknown";

        const result = await reportSuspiciousActivity({
          actorType: "pro",
          actorId: ownerId,
          alertType: "pro_excessive_rejections",
          severity: "warning",
          title: "Pro — Taux de rejet élevé",
          details: `${stats.rejected}/${stats.total} réservations rejetées/annulées (${Math.round(rejectionRate * 100)}%) en 7 jours`,
          context: { total: stats.total, rejected: stats.rejected, rate: rejectionRate },
          establishmentId,
          deduplicationKey: `pro_rejections_${establishmentId}`,
          deduplicationWindowHours: 168, // 7 jours
        });

        if (result.ok && !result.deduplicated) proAlerts++;
      }
    }
  } catch (err) {
    log.error({ err }, "Pro rejection scan error");
  }

  // -------------------------------------------------------------------------
  // 2. Pros inactifs depuis 14+ jours avec réservations en attente
  // -------------------------------------------------------------------------
  try {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    // Établissements avec des réservations en attente
    const { data: pendingReservations } = await supabase
      .from("reservations")
      .select("establishment_id")
      .in("status", ["requested", "pending_pro_validation"])
      .lt("created_at", fourteenDaysAgo);

    if (pendingReservations && pendingReservations.length > 0) {
      const pendingEstabs = [...new Set(pendingReservations.map((r) => r.establishment_id as string))];

      for (const establishmentId of pendingEstabs) {
        const { data: estab } = await supabase
          .from("establishments")
          .select("owner_id, name")
          .eq("id", establishmentId)
          .maybeSingle();

        if (!estab) continue;
        const ownerId = (estab as any).owner_id ?? "unknown";
        const name = (estab as any).name ?? "";

        const result = await reportSuspiciousActivity({
          actorType: "pro",
          actorId: ownerId,
          alertType: "pro_inactivity_drop",
          severity: "warning",
          title: "Pro inactif — Réservations en attente",
          details: `Établissement "${name}" a des réservations en attente depuis plus de 14 jours sans réponse`,
          context: { establishment_name: name },
          establishmentId,
          deduplicationKey: `pro_inactive_${establishmentId}`,
          deduplicationWindowHours: 168, // 7 jours
        });

        if (result.ok && !result.deduplicated) proAlerts++;
      }
    }
  } catch (err) {
    log.error({ err }, "Pro inactivity scan error");
  }

  // -------------------------------------------------------------------------
  // 3. Consumers avec > 5 no-shows en 30 jours (sans suspension active)
  // -------------------------------------------------------------------------
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: noShowReservations } = await supabase
      .from("reservations")
      .select("user_id")
      .eq("status", "no_show")
      .gte("updated_at", thirtyDaysAgo);

    if (noShowReservations && noShowReservations.length > 0) {
      const byUser = new Map<string, number>();
      for (const r of noShowReservations) {
        const uid = r.user_id as string;
        byUser.set(uid, (byUser.get(uid) ?? 0) + 1);
      }

      for (const [userId, count] of byUser) {
        if (count < 5) continue;

        const result = await reportSuspiciousActivity({
          actorType: "consumer",
          actorId: userId,
          alertType: "consumer_excessive_no_shows",
          severity: "warning",
          title: "Consumer — No-shows excessifs",
          details: `${count} no-shows en 30 jours`,
          context: { no_show_count: count, period_days: 30 },
          deduplicationKey: `excessive_noshows_${userId}`,
          deduplicationWindowHours: 168, // 7 jours
        });

        if (result.ok && !result.deduplicated) consumerAlerts++;
      }
    }
  } catch (err) {
    log.error({ err }, "Consumer no-show scan error");
  }

  return { consumer_alerts: consumerAlerts, pro_alerts: proAlerts };
}

// =============================================================================
// Handler
// =============================================================================

async function cronScan(req: Request, res: Response) {
  if (!verifyCronSecret(req)) return res.status(403).json({ error: "forbidden" });

  try {
    const result = await runSuspiciousActivityScan();
    log.info(result, "Suspicious activity scan completed");
    res.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "cronScan error");
    res.status(500).json({ error: "internal_error" });
  }
}

// =============================================================================
// Route registration
// =============================================================================

export function registerSuspiciousActivityCronRoutes(app: Router): void {
  app.post("/api/admin/cron/suspicious-activity/scan", cronScan);
}
