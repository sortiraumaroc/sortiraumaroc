/**
 * Admin Route Helpers — Shared utilities for admin route modules.
 *
 * Extracted from the monolithic admin.ts to support module decomposition.
 * Contains auth checks, type coercion, error translation, and common patterns.
 */

import type { RequestHandler } from "express";
import { randomBytes } from "crypto";

import {
  parseCookies,
  getSessionCookieName,
  verifyAdminSessionToken,
} from "../adminSession";
import {
  assertAdminApiEnabled,
  checkAdminKey,
} from "../supabaseAdmin";

// Re-export getAdminSupabase for convenience
export { getAdminSupabase } from "../supabaseAdmin";
export { emitAdminNotification } from "../adminNotifications";

// Re-export checkAdminKey for modules that need raw key comparison
export { checkAdminKey } from "../supabaseAdmin";

// =============================================================================
// Types
// =============================================================================

export type EstablishmentRow = {
  id: string;
  verified: boolean;
  name: string | null;
  universe: string | null;
  subcategory: string | null;
  specialties: string[] | null;
  city: string | null;
  postal_code: string | null;
  region: string | null;
  country: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  description_short: string | null;
  description_long: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  email: string | null;
  social_links: unknown;
  hours: unknown;
  tags: string[] | null;
  amenities: string[] | null;
  cover_url: string | null;
  gallery_urls: string[] | null;
  ambiance_tags: string[] | null;
  service_types: string[] | null;
  extra: unknown;
  mix_experience: unknown;
};

// =============================================================================
// Auth helpers
// =============================================================================

function getAdminSessionToken(
  req: Parameters<RequestHandler>[0],
): { token: string; source: "cookie" | "header" } | null {
  const cookies = parseCookies(req.header("cookie") ?? undefined);
  const cookieToken = cookies[getSessionCookieName()];
  if (cookieToken) return { token: cookieToken, source: "cookie" };

  const headerToken = req.header("x-admin-session") ?? undefined;
  if (headerToken && headerToken.trim())
    return { token: headerToken.trim(), source: "header" };

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
  } catch { /* intentional: invalid origin URL */
    return false;
  }

  const host = req.header("x-forwarded-host") ?? req.header("host");
  if (!host) return false;

  return origin.host === host;
}

export function requireAdminKey(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
): boolean {
  const enabled = assertAdminApiEnabled();
  if (enabled.ok === false) {
    res.status(503).json({ error: enabled.message });
    return false;
  }

  const session = getAdminSessionToken(req);
  if (session) {
    const payload = verifyAdminSessionToken(session.token);
    if (payload !== null) {
      if (
        session.source === "cookie" &&
        !isSafeMethod(req.method) &&
        !isSameOrigin(req)
      ) {
        res.status(403).json({ error: "Accès refusé" });
        return false;
      }

      (req as any).adminSession = payload;
      return true;
    }
  }

  const header = req.header("x-admin-key") ?? undefined;
  if (!checkAdminKey(header)) {
    res.status(401).json({ error: "Non autorisé" });
    return false;
  }

  return true;
}

export function hasValidAdminSession(
  req: Parameters<RequestHandler>[0],
): boolean {
  const session = getAdminSessionToken(req);
  if (!session) return false;
  return verifyAdminSessionToken(session.token) !== null;
}

export function getAdminSessionSub(
  req: Parameters<RequestHandler>[0],
): string | null {
  const session = getAdminSessionToken(req);
  if (!session) return null;
  const payload = verifyAdminSessionToken(session.token);
  return payload?.sub ?? null;
}

// =============================================================================
// Type coercion helpers
// =============================================================================

export function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

export function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function generateProvisionalPassword(): string {
  const token = randomBytes(18).toString("base64url");
  return `Sam-${token}`;
}

export function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
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

// =============================================================================
// Error translation
// =============================================================================

export function translateErrorMessage(
  message: string | undefined,
): string {
  if (!message) return "Erreur inattendue";

  const translations: Record<string, string> = {
    "A user with this email address has already been registered":
      "Un utilisateur avec cette adresse email existe déjà",
    "User already registered": "Utilisateur déjà enregistré",
    "Email already exists": "Cette adresse email est déjà utilisée",
    "Invalid email": "Adresse email invalide",
    "Password should be at least 6 characters":
      "Le mot de passe doit contenir au moins 6 caractères",
    "Email not confirmed": "Adresse email non confirmée",
    "Invalid login credentials": "Identifiants de connexion invalides",
    "User not found": "Utilisateur introuvable",
    "Email rate limit exceeded":
      "Limite d'envoi d'emails dépassée, réessayez plus tard",
    "For security purposes, you can only request this once every 60 seconds":
      "Pour des raisons de sécurité, vous ne pouvez faire cette demande qu'une fois par minute",
    "Unable to validate email address: invalid format":
      "Format d'adresse email invalide",
    "Signup requires a valid password":
      "L'inscription nécessite un mot de passe valide",
    "Password is too weak": "Le mot de passe est trop faible",
    "New password should be different from the old password":
      "Le nouveau mot de passe doit être différent de l'ancien",
  };

  if (translations[message]) return translations[message];

  for (const [key, value] of Object.entries(translations)) {
    if (message.toLowerCase().includes(key.toLowerCase())) return value;
  }

  return message;
}

// =============================================================================
// Audit actor info
// =============================================================================

export type AuditActorInfo = {
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  actor_role: string | null;
};

/**
 * Extract full actor identity from the admin session attached to the request.
 * Returns { actor_id, actor_email, actor_name, actor_role } for audit logging.
 */
export function getAuditActorInfo(
  req: Parameters<RequestHandler>[0],
): AuditActorInfo {
  const session = (req as any).adminSession;
  if (session) {
    return {
      actor_id: session.collaborator_id ?? null,
      actor_email: session.sub ?? null,
      actor_name: session.name ?? null,
      actor_role: session.role ?? null,
    };
  }
  // Fallback: try to decode from token directly
  const tokenResult = getAdminSessionToken(req);
  if (tokenResult) {
    const payload = verifyAdminSessionToken(tokenResult.token);
    if (payload) {
      return {
        actor_id: payload.collaborator_id ?? null,
        actor_email: payload.sub ?? null,
        actor_name: payload.name ?? null,
        actor_role: payload.role ?? null,
      };
    }
  }
  return { actor_id: null, actor_email: null, actor_name: null, actor_role: null };
}

// =============================================================================
// Superadmin check
// =============================================================================

export function requireSuperadmin(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
): boolean {
  if (!requireAdminKey(req, res)) return false;

  // API key-based access is treated as superadmin.
  const headerKey = req.header("x-admin-key") ?? undefined;
  if (checkAdminKey(headerKey)) return true;

  // Check if the session has superadmin role
  const session = (req as any).adminSession;
  if (session?.role === "superadmin") return true;

  // Legacy check: if ADMIN_DASHBOARD_USERNAME is set, allow that specific user
  const cfgUsername = process.env.ADMIN_DASHBOARD_USERNAME?.trim();
  if (cfgUsername) {
    const sub = getAdminSessionSub(req);
    if (sub === cfgUsername) return true;
  }

  res.status(403).json({ error: "Accès refusé" });
  return false;
}
