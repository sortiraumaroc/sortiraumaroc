/**
 * Routes API PRO - Notifications, Preferences, Permissions, Invoices
 *
 * Extracted from the monolithic pro.ts.
 *
 * Endpoints for:
 * - Notifications list / mark-read / mark-all-read / delete
 * - Notification preferences (popups, sound)
 * - Permissions CRUD (get / update / reset)
 * - Invoices list + finance invoice lookup
 */

import type { RequestHandler } from "express";

import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";
import {
  hasPermission,
  getPermissionMatrix,
  saveRolePermissions,
  resetPermissionsToDefaults,
} from "../permissionLogic";
import {
  CUSTOMIZABLE_ROLES,
  ALL_PERMISSION_KEYS,
  OWNER_ONLY_PERMISSIONS,
  type CustomizableRole,
  type PermissionKey,
} from "../../shared/permissionTypes";
import { getUserPreferences, updateUserPreferences } from "../notificationPreferences";
import { ensureInvoiceForProInvoice } from "../finance";
import {
  parseBearerToken,
  getUserFromBearerToken,
  ensureRole,
  ensureCanViewBilling,
  ensureCanCreateTeamMember,
  isRecord,
  asString,
} from "./proHelpers";

const log = createModuleLogger("proNotifs");

// =============================================================================
// Local helpers
// =============================================================================

function parseIsoOrNull(raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return null;
  const dt = new Date(v);
  if (!Number.isFinite(dt.getTime())) return null;
  return dt.toISOString();
}

// =============================================================================
// Notification Handlers
// =============================================================================

export const listProNotifications: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const fromIso = parseIsoOrNull(req.query.from);
  const toIso = parseIsoOrNull(req.query.to);
  const unreadOnly = String(req.query.unread_only ?? "").toLowerCase() === "true";

  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, Math.floor(limitRaw))) : 200;

  const supabase = getAdminSupabase();

  let q = supabase
    .from("pro_notifications")
    .select("*")
    .eq("user_id", userResult.user.id)
    .or(`establishment_id.is.null,establishment_id.eq.${establishmentId}`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (fromIso) q = q.gte("created_at", fromIso);
  if (toIso) q = q.lt("created_at", toIso);
  if (unreadOnly) q = q.is("read_at", null);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const { count, error: countErr } = await supabase
    .from("pro_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userResult.user.id)
    .is("read_at", null)
    .or(`establishment_id.is.null,establishment_id.eq.${establishmentId}`);

  if (countErr) return res.status(500).json({ error: countErr.message });

  res.json({ ok: true, unreadCount: typeof count === "number" ? count : 0, notifications: data ?? [] });
};

export const markProNotificationRead: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const notificationId = typeof req.params.notificationId === "string" ? req.params.notificationId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!notificationId) return res.status(400).json({ error: "notificationId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("pro_notifications")
    .update({ read_at: nowIso })
    .eq("id", notificationId)
    .eq("user_id", userResult.user.id)
    .or(`establishment_id.is.null,establishment_id.eq.${establishmentId}`)
    .select("id")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Not found" });

  res.json({ ok: true });
};

export const markAllProNotificationsRead: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from("pro_notifications")
    .update({ read_at: nowIso })
    .eq("user_id", userResult.user.id)
    .is("read_at", null)
    .or(`establishment_id.is.null,establishment_id.eq.${establishmentId}`);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
};

export const deleteProNotification: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const notificationId = typeof req.params.notificationId === "string" ? req.params.notificationId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!notificationId) return res.status(400).json({ error: "notificationId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("pro_notifications")
    .delete()
    .eq("id", notificationId)
    .eq("user_id", userResult.user.id)
    .or(`establishment_id.is.null,establishment_id.eq.${establishmentId}`)
    .select("id")
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "Not found" });

  res.json({ ok: true });
};

// =============================================================================
// Notification Preferences
// =============================================================================

export const getProNotificationPreferences: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  try {
    const prefs = await getUserPreferences(userResult.user.id, "pro");

    res.json({
      ok: true,
      preferences: {
        popupsEnabled: prefs.pro_popups_enabled ?? true,
        soundEnabled: prefs.pro_sound_enabled ?? true,
      },
    });
  } catch (err) {
    log.error({ err }, "getProNotificationPreferences error");
    res.status(500).json({ error: "internal_error" });
  }
};

export const updateProNotificationPreferences: RequestHandler = async (req, res) => {
  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const body = req.body;
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "invalid_body" });
  }

  try {
    const updates: Record<string, boolean> = {};
    if (typeof body.popupsEnabled === "boolean") updates.pro_popups_enabled = body.popupsEnabled;
    if (typeof body.soundEnabled === "boolean") updates.pro_sound_enabled = body.soundEnabled;

    const prefs = await updateUserPreferences(userResult.user.id, "pro", updates);

    res.json({
      ok: true,
      preferences: {
        popupsEnabled: prefs.pro_popups_enabled ?? true,
        soundEnabled: prefs.pro_sound_enabled ?? true,
      },
    });
  } catch (err) {
    log.error({ err }, "updateProNotificationPreferences error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// Permissions CRUD
// =============================================================================

export const getEstablishmentPermissions: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  // Any member can read permissions (needed for client-side tab filtering)
  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  try {
    const matrix = await getPermissionMatrix(establishmentId);
    res.json({ ok: true, permissions: matrix });
  } catch (err) {
    log.error({ err }, "getEstablishmentPermissions error");
    res.status(500).json({ error: "internal_error" });
  }
};

export const updateEstablishmentPermissions: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  // Owner-only
  const permission = await ensureCanCreateTeamMember({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  const { role, permissions } = req.body as { role: string; permissions: Record<string, boolean> };
  if (!role || !CUSTOMIZABLE_ROLES.includes(role as CustomizableRole)) {
    return res.status(400).json({ error: "Invalid role" });
  }

  if (!permissions || typeof permissions !== "object") {
    return res.status(400).json({ error: "Invalid permissions" });
  }

  // Filter to valid permission keys only
  const safePerms: Partial<Record<PermissionKey, boolean>> = {};
  for (const key of ALL_PERMISSION_KEYS) {
    if (OWNER_ONLY_PERMISSIONS.has(key)) continue;
    if (typeof permissions[key] === "boolean") {
      safePerms[key] = permissions[key];
    }
  }

  try {
    await saveRolePermissions(establishmentId, role as CustomizableRole, safePerms);
    const matrix = await getPermissionMatrix(establishmentId);
    res.json({ ok: true, permissions: matrix });
  } catch (err) {
    log.error({ err }, "updateEstablishmentPermissions error");
    res.status(500).json({ error: "internal_error" });
  }
};

export const resetEstablishmentPermissions: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  // Owner-only
  const permission = await ensureCanCreateTeamMember({ establishmentId, userId: userResult.user.id });
  if (permission.ok === false) return res.status(permission.status).json({ error: permission.error });

  try {
    await resetPermissionsToDefaults(establishmentId);
    const matrix = await getPermissionMatrix(establishmentId);
    res.json({ ok: true, permissions: matrix });
  } catch (err) {
    log.error({ err }, "resetEstablishmentPermissions error");
    res.status(500).json({ error: "internal_error" });
  }
};

// =============================================================================
// Invoices
// =============================================================================

export const listProInvoices: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureCanViewBilling({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 50;

  const supabase = getAdminSupabase();
  let q = supabase
    .from("pro_invoices")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("due_date", { ascending: false })
    .limit(limit);

  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const invoices = (data ?? []) as Array<Record<string, unknown>>;
  const invoiceIds = invoices
    .map((inv) => (typeof inv.id === "string" ? inv.id : ""))
    .filter((x): x is string => !!x);

  const financeByProInvoiceId = new Map<string, { invoice_number: string; issued_at: string }>();

  if (invoiceIds.length) {
    try {
      const { data: finRows, error: finErr } = await supabase
        .from("finance_invoices")
        .select("reference_id,invoice_number,issued_at")
        .eq("reference_type", "pro_invoice")
        .in("reference_id", invoiceIds)
        .limit(500);

      if (finErr) throw finErr;

      for (const row of (finRows ?? []) as Array<Record<string, unknown>>) {
        const refId = typeof row.reference_id === "string" ? row.reference_id : "";
        const invoiceNumber = typeof row.invoice_number === "string" ? row.invoice_number : "";
        const issuedAt = typeof row.issued_at === "string" ? row.issued_at : "";
        if (refId && invoiceNumber && issuedAt) {
          financeByProInvoiceId.set(refId, { invoice_number: invoiceNumber, issued_at: issuedAt });
        }
      }
    } catch (err) {
      log.warn({ err }, "Non-fatal: failed to fetch finance invoice identifiers for pro invoices");
    }
  }

  const enriched = invoices.map((inv) => {
    const id = typeof inv.id === "string" ? inv.id : "";
    const fin = id ? financeByProInvoiceId.get(id) : undefined;
    return {
      ...inv,
      invoice_number: fin?.invoice_number ?? null,
      invoice_issued_at: fin?.issued_at ?? null,
    };
  });

  res.json({ ok: true, invoices: enriched });
};

export const getProInvoiceFinanceInvoice: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const proInvoiceId = typeof req.params.invoiceId === "string" ? req.params.invoiceId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!proInvoiceId) return res.status(400).json({ error: "invoiceId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureCanViewBilling({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data: invoiceRow, error: invErr } = await supabase
    .from("pro_invoices")
    .select("id")
    .eq("id", proInvoiceId)
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (invErr) return res.status(500).json({ error: invErr.message });
  if (!invoiceRow) return res.status(404).json({ error: "invoice_not_found" });

  const actor = { userId: userResult.user.id, role: `pro:${roleRes.role}` };

  try {
    const financeInvoice = await ensureInvoiceForProInvoice({
      proInvoiceId,
      actor,
      idempotencyKey: `invoice:pro_invoice:${proInvoiceId}`,
    });

    if (!financeInvoice) return res.status(400).json({ error: "invoice_unavailable" });

    return res.json({
      ok: true,
      invoice: {
        id: financeInvoice.id,
        invoice_number: financeInvoice.invoice_number,
        issued_at: financeInvoice.issued_at,
        amount_cents: financeInvoice.amount_cents,
        currency: financeInvoice.currency,
        reference_type: financeInvoice.reference_type,
        reference_id: financeInvoice.reference_id,
      },
    });
  } catch (e) {
    log.error({ err: e }, "getProInvoiceFinanceInvoice failed");
    return res.status(500).json({ error: "invoice_error" });
  }
};
