import type { RequestHandler } from "express";

import { getSessionCookieName, parseCookies, verifyAdminSessionToken } from "../adminSession";
import { assertAdminApiEnabled, checkAdminKey, getAdminSupabase } from "../supabaseAdmin";

function getAdminSessionToken(req: Parameters<RequestHandler>[0]): { token: string; source: "cookie" | "header" } | null {
  const cookies = parseCookies(req.header("cookie") ?? undefined);
  const cookieToken = cookies[getSessionCookieName()];
  if (cookieToken) return { token: cookieToken, source: "cookie" };

  const headerToken = req.header("x-admin-session") ?? undefined;
  if (headerToken && headerToken.trim()) return { token: headerToken.trim(), source: "header" };

  const authHeader = req.header("authorization") ?? undefined;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return { token: bearer, source: "header" };
  }

  return null;
}

function isSafeMethod(method: string | undefined): boolean {
  const m = (method || "GET").toUpperCase();
  return m === "GET" || m === "HEAD" || m === "OPTIONS";
}

function isSameOrigin(req: Parameters<RequestHandler>[0]): boolean {
  const originHeader = req.header("origin");
  if (!originHeader) return true;

  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return false;
  }

  const host = req.header("x-forwarded-host") ?? req.header("host");
  if (!host) return false;

  return origin.host === host;
}

function requireAdminKey(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]): boolean {
  const enabled = assertAdminApiEnabled();
  if (enabled.ok === false) {
    res.status(503).json({ error: enabled.message });
    return false;
  }

  const session = getAdminSessionToken(req);
  if (session && verifyAdminSessionToken(session.token) !== null) {
    // CSRF protection for cookie-based sessions.
    if (session.source === "cookie" && !isSafeMethod(req.method) && !isSameOrigin(req)) {
      res.status(403).json({ error: "Forbidden" });
      return false;
    }

    return true;
  }

  const header = req.header("x-admin-key") ?? undefined;
  if (!checkAdminKey(header)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

function parseLimit(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(200, Math.max(1, Math.floor(n)));
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
  created_at: string;
  read_at: string | null;
};

export const listAdminNotifications: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const limit = parseLimit(req.query.limit, 50);
  const unreadOnly = String(req.query.unread ?? "").toLowerCase() === "true";
  const afterIso = parseIsoString(req.query.after);

  const supabase = getAdminSupabase();

  let q = supabase
    .from("admin_notifications")
    .select("id,type,title,body,data,created_at,read_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) q = q.is("read_at", null);
  if (afterIso) q = q.gt("created_at", afterIso);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, items: (data ?? []) as AdminNotificationApiRow[] });
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
