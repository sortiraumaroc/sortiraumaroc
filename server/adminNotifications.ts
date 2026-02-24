import { getAdminSupabase } from "./supabaseAdmin";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("adminNotifications");

type AdminNotificationRow = {
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  category?: string;
  severity?: string;
};

// =============================================================================
// Inference helpers
// =============================================================================

function inferCategory(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("reservation") || t.includes("booking") || t.includes("waitlist") || t.includes("cancellation") || t.includes("noshow"))
    return "booking";
  if (t.includes("payment") || t.includes("payout") || t.includes("finance"))
    return "finance";
  if (t.includes("visibility"))
    return "visibility";
  if (t.includes("review") || t.includes("signal"))
    return "review";
  if (t.includes("ramadan"))
    return "ramadan";
  if (
    t.includes("moderation") ||
    t.includes("profile_update") ||
    t.includes("inventory") ||
    t.includes("ad_campaign") ||
    t.includes("pack") ||
    t.includes("deal") ||
    t.includes("offer") ||
    t.includes("claim") ||
    t.includes("username")
  )
    return "moderation";
  if (t.includes("message") || t.includes("support"))
    return "support";
  if (t.includes("fraud") || t.includes("alert"))
    return "alert";
  return "system";
}

function inferSeverity(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("fraud") || t.includes("alert") || t.includes("finance_discrepancy"))
    return "critical";
  if (t.includes("reject") || t.includes("modification_requested") || t.includes("cancellation") || t.includes("noshow"))
    return "warning";
  return "info";
}

// =============================================================================
// Emit
// =============================================================================

// =============================================================================
// Auto-cleanup: supprime les notifications > 90 jours
// =============================================================================

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 jour
const RETENTION_DAYS = 90;

async function cleanupOldNotifications(): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("admin_notifications")
      .delete()
      .lt("created_at", cutoff)
      .select("id");
    if (error) {
      log.error({ err: error.message }, "Cleanup error");
    } else {
      const count = data?.length ?? 0;
      if (count > 0) {
        log.info({ count, retentionDays: RETENTION_DAYS }, "Deleted old notifications");
      }
    }
  } catch (e) {
    log.error({ err: e }, "Cleanup crashed");
  }
}

let _cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startNotificationCleanupCron(): void {
  if (_cleanupTimer) return;
  // Run once at startup (after 30s delay to not block startup), then every 24h
  setTimeout(() => {
    void cleanupOldNotifications();
    _cleanupTimer = setInterval(() => void cleanupOldNotifications(), CLEANUP_INTERVAL_MS);
  }, 30_000);
  log.info({ intervalHours: 24, retentionDays: RETENTION_DAYS }, "Cleanup cron scheduled");
}

// =============================================================================
// Emit
// =============================================================================

export async function emitAdminNotification(input: AdminNotificationRow): Promise<void> {
  try {
    const supabase = getAdminSupabase();

    const payload = {
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data ?? {},
      category: input.category ?? inferCategory(input.type),
      severity: input.severity ?? inferSeverity(input.type),
    };

    log.info({ type: payload.type, title: payload.title, category: payload.category, severity: payload.severity }, "Inserting notification");
    const { data, error } = await supabase.from("admin_notifications").insert(payload).select("id").maybeSingle();
    if (error) {
      log.error({ err: error.message, code: error.code, details: error.details }, "Insert failed");
    } else {
      log.info({ id: (data as any)?.id }, "Inserted OK");
    }
  } catch (e) {
    log.error({ err: e }, "Emit notification crashed");
  }
}
