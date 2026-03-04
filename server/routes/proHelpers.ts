/**
 * Pro Route Helpers — Shared utilities for pro route modules.
 *
 * Extracted from the monolithic pro.ts to support module decomposition.
 * Contains auth checks, type coercion, permission checks, and common patterns.
 */

import type { RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { hasPermission } from "../permissionLogic";

// =============================================================================
// Types
// =============================================================================

export type ProUser = { id: string; email?: string | null };

export type ProRole = "owner" | "manager" | "reception" | "accounting" | "marketing" | string;

export type MembershipRow = {
  establishment_id: string;
  user_id: string;
  role: ProRole;
};

// =============================================================================
// Type coercion helpers
// =============================================================================

export function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

export function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function asBoolean(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

export function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .map((x: unknown) => (typeof x === "string" ? x.trim() : ""))
    .filter((x: string) => x.length);
  return out;
}

export function asJsonObject(v: unknown): Record<string, unknown> | undefined {
  return isRecord(v) ? v : undefined;
}

export function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

// =============================================================================
// Auth helpers
// =============================================================================

export function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const [scheme, token] = trimmed.split(/\s+/, 2);
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;
  return token && token.trim() ? token.trim() : null;
}

export async function getUserFromBearerToken(token: string): Promise<
  { ok: true; user: ProUser } | { ok: false; error: string; status: number }
> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return { ok: false, status: 401, error: error.message };
  if (!data.user) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true, user: { id: data.user.id, email: data.user.email } };
}

// =============================================================================
// Role & permission checks
// =============================================================================

export async function ensureRole(args: {
  establishmentId: string;
  userId: string;
}): Promise<{ ok: true; role: ProRole } | { ok: false; status: number; error: string }> {
  const supabase = getAdminSupabase();

  const { data: membership, error: membershipError } = await supabase
    .from("pro_establishment_memberships")
    .select("establishment_id,user_id,role")
    .eq("establishment_id", args.establishmentId)
    .eq("user_id", args.userId)
    .maybeSingle();

  if (membershipError) return { ok: false, status: 500, error: membershipError.message };

  const role = (membership as MembershipRow | null)?.role ?? null;
  if (!role) return { ok: false, status: 403, error: "Forbidden" };

  return { ok: true, role };
}

export async function ensureCanSubmitProfileUpdate(args: {
  establishmentId: string;
  userId: string;
}): Promise<{ ok: true; role: ProRole } | { ok: false; status: number; error: string }> {
  const res = await ensureRole(args);
  if (res.ok === false) return res;

  const allowed = await hasPermission(args.establishmentId, res.role, "manage_profile");
  if (!allowed) return { ok: false, status: 403, error: "Forbidden" };

  return res;
}

export async function ensureCanCreateTeamMember(args: {
  establishmentId: string;
  userId: string;
}): Promise<{ ok: true; role: ProRole } | { ok: false; status: number; error: string }> {
  const res = await ensureRole(args);
  if (res.ok === false) return res;

  if (res.role !== "owner") {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return res;
}

export async function ensureCanManageReservations(args: {
  establishmentId: string;
  userId: string;
}): Promise<{ ok: true; role: ProRole } | { ok: false; status: number; error: string }> {
  const res = await ensureRole(args);
  if (res.ok === false) return res;

  const allowed = await hasPermission(args.establishmentId, res.role, "manage_reservations");
  if (!allowed) return { ok: false, status: 403, error: "Forbidden" };

  return res;
}

export async function ensureCanViewBilling(args: {
  establishmentId: string;
  userId: string;
}): Promise<{ ok: true; role: ProRole } | { ok: false; status: number; error: string }> {
  const res = await ensureRole(args);
  if (res.ok === false) return res;

  const allowed = await hasPermission(args.establishmentId, res.role, "view_billing");
  if (!allowed) return { ok: false, status: 403, error: "Forbidden" };

  return res;
}

export async function ensureCanManageInventory(args: {
  establishmentId: string;
  userId: string;
}): Promise<{ ok: true; role: ProRole } | { ok: false; status: number; error: string }> {
  const res = await ensureRole(args);
  if (res.ok === false) return res;

  const allowed = await hasPermission(args.establishmentId, res.role, "manage_inventory");
  if (!allowed) return { ok: false, status: 403, error: "Forbidden" };

  return res;
}

export async function ensureCanManageOffers(args: {
  establishmentId: string;
  userId: string;
}): Promise<{ ok: true; role: ProRole } | { ok: false; status: number; error: string }> {
  const res = await ensureRole(args);
  if (res.ok === false) return res;

  const allowed = await hasPermission(args.establishmentId, res.role, "manage_offers");
  if (!allowed) return { ok: false, status: 403, error: "Forbidden" };

  return res;
}

// =============================================================================
// Utility helpers (shared across pro modules)
// =============================================================================

export function looksLikeUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export function listInternalVisibilityOrderEmails(): string[] {
  const raw = typeof process.env.VISIBILITY_ORDERS_EMAILS === "string" ? process.env.VISIBILITY_ORDERS_EMAILS.trim() : "";
  if (raw) {
    return raw
      .split(/[;,]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const domain = (process.env.EMAIL_DOMAIN || "sortiraumaroc.ma").trim() || "sortiraumaroc.ma";
  return [`pro@${domain}`];
}

export function isDemoRoutesAllowed(): boolean {
  // Defense-in-depth: even if a demo/seed route gets registered by mistake, it should be a no-op in production.
  if (process.env.NODE_ENV === "production") return false;
  return String(process.env.ALLOW_DEMO_ROUTES ?? "").toLowerCase() === "true";
}

export function getDemoProCredentials(): { email: string; password: string } | null {
  if (!isDemoRoutesAllowed()) return null;

  const email = String(process.env.DEMO_PRO_EMAIL ?? "").trim().toLowerCase();
  const password = String(process.env.DEMO_PRO_PASSWORD ?? "").trim();

  if (!email || !email.includes("@") || !password) return null;
  return { email, password };
}

export function getDemoProEmail(): string | null {
  return getDemoProCredentials()?.email ?? null;
}
