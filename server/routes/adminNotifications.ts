import type { RequestHandler } from "express";
import type { Express } from "express";

import { getAdminSupabase } from "../supabaseAdmin";
import { requireAdminKey } from "./adminHelpers";
import { zBody, zParams, zIdParam } from "../lib/validate";
import { AdminNotificationBulkActionSchema } from "../schemas/adminNotifications";

function parseLimit(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(200, Math.max(1, Math.floor(n)));
}

function parseOffset(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function parseIsoString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

export type AdminNotificationApiRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
  category: string;
  severity: string;
  created_at: string;
  read_at: string | null;
};

function parseString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed || null;
}

export const listAdminNotifications: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const limit = parseLimit(req.query.limit, 50);
  const offset = parseOffset(req.query.offset);
  const unreadOnly = String(req.query.unread ?? "").toLowerCase() === "true";
  const afterIso = parseIsoString(req.query.after);
  const category = parseString(req.query.category);
  const severity = parseString(req.query.severity);

  const supabase = getAdminSupabase();

  // Fetch limit+1 to determine hasMore
  const fetchCount = limit + 1;
  let q = supabase
    .from("admin_notifications")
    .select("id,type,title,body,data,category,severity,created_at,read_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + fetchCount - 1);

  if (unreadOnly) q = q.is("read_at", null);
  if (afterIso) q = q.gt("created_at", afterIso);
  if (category) q = q.eq("category", category);
  if (severity) q = q.eq("severity", severity);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const all = (data ?? []) as AdminNotificationApiRow[];
  const hasMore = all.length > limit;
  const items = hasMore ? all.slice(0, limit) : all;

  res.json({ ok: true, items, hasMore });
};

export const getAdminNotificationsUnreadCount: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const { count, error } = await supabase
    .from("admin_notifications")
    .select("id", { head: true, count: "exact" })
    .is("read_at", null);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, unread: typeof count === "number" ? count : 0 });
};

export const markAdminNotificationRead: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "id is required" });

  const supabase = getAdminSupabase();
  const readAt = new Date().toISOString();

  const { error } = await supabase
    .from("admin_notifications")
    .update({ read_at: readAt })
    .eq("id", id)
    .is("read_at", null);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

export const markAllAdminNotificationsRead: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const readAt = new Date().toISOString();

  const { error } = await supabase.from("admin_notifications").update({ read_at: readAt }).is("read_at", null);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// Bulk actions (mark-read or delete multiple)
// ---------------------------------------------------------------------------

export const bulkAdminNotificationAction: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const body = req.body as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).filter((id): id is string => typeof id === "string") : [];

  if (!["read", "delete"].includes(action)) {
    return res.status(400).json({ error: "Invalid action. Must be 'read' or 'delete'." });
  }
  if (ids.length === 0 || ids.length > 100) {
    return res.status(400).json({ error: "Provide between 1 and 100 ids." });
  }

  const supabase = getAdminSupabase();

  if (action === "read") {
    const readAt = new Date().toISOString();
    const { error } = await supabase
      .from("admin_notifications")
      .update({ read_at: readAt })
      .in("id", ids)
      .is("read_at", null);
    if (error) return res.status(500).json({ error: error.message });
  } else {
    const { error } = await supabase
      .from("admin_notifications")
      .delete()
      .in("id", ids);
    if (error) return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true, affected: ids.length });
};

export const deleteAdminNotification: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "id is required" });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("admin_notifications")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "not_found" });

  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerAdminNotificationRoutes(app: Express) {
  app.get("/api/admin/notifications", listAdminNotifications);
  app.get("/api/admin/notifications/unread-count", getAdminNotificationsUnreadCount);
  app.post("/api/admin/notifications/:id/read", zParams(zIdParam), markAdminNotificationRead);
  app.delete("/api/admin/notifications/:id", zParams(zIdParam), deleteAdminNotification);
  app.post("/api/admin/notifications/mark-all-read", markAllAdminNotificationsRead);

  // Alias routes: some browser extensions / blockers aggressively block URLs containing "notifications".
  app.get("/api/admin/alerts", listAdminNotifications);
  app.get("/api/admin/alerts/unread-count", getAdminNotificationsUnreadCount);
  app.post("/api/admin/alerts/:id/read", zParams(zIdParam), markAdminNotificationRead);
  app.delete("/api/admin/alerts/:id", zParams(zIdParam), deleteAdminNotification);
  app.post("/api/admin/alerts/mark-all-read", markAllAdminNotificationsRead);
  app.post("/api/admin/notifications/bulk-action", zBody(AdminNotificationBulkActionSchema), bulkAdminNotificationAction);
  app.post("/api/admin/alerts/bulk-action", zBody(AdminNotificationBulkActionSchema), bulkAdminNotificationAction);
}
