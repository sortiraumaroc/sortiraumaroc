import type { RequestHandler } from "express";
import { randomBytes, scrypt, timingSafeEqual, createHash } from "crypto";
import { promisify } from "util";

import {
  buildSetCookieHeader,
  createAdminSessionToken,
  getSessionCookieName,
  isRequestSecure,
} from "../adminSession";
import { assertAdminApiEnabled, getAdminSupabase } from "../supabaseAdmin";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

// ============================================================================
// SECURITY: Rate limiting for admin login attempts
// ============================================================================
const loginAttempts = new Map<string, { count: number; lastAttempt: number; lockedUntil: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_ATTEMPTS_PER_WINDOW = 5; // Max 5 attempts per minute
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minute lockout after too many failures

function checkAdminRateLimit(identifier: string): { allowed: boolean; retryAfter?: number; reason?: string } {
  const now = Date.now();
  const record = loginAttempts.get(identifier);

  // Clean up old entries periodically (every 100 checks)
  if (Math.random() < 0.01) {
    for (const [key, val] of loginAttempts.entries()) {
      if (now - val.lastAttempt > LOCKOUT_DURATION_MS) {
        loginAttempts.delete(key);
      }
    }
  }

  if (!record) {
    loginAttempts.set(identifier, { count: 1, lastAttempt: now, lockedUntil: 0 });
    return { allowed: true };
  }

  // Check if still locked out
  if (record.lockedUntil > now) {
    const retryAfter = Math.ceil((record.lockedUntil - now) / 1000);
    return { allowed: false, retryAfter, reason: "account_locked" };
  }

  // Reset if window expired
  if (now - record.lastAttempt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(identifier, { count: 1, lastAttempt: now, lockedUntil: 0 });
    return { allowed: true };
  }

  // Check rate limit
  if (record.count >= MAX_ATTEMPTS_PER_WINDOW) {
    // Lock the account
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    const retryAfter = Math.ceil(LOCKOUT_DURATION_MS / 1000);
    return { allowed: false, retryAfter, reason: "too_many_attempts" };
  }

  record.count++;
  record.lastAttempt = now;
  return { allowed: true };
}

function resetAdminRateLimit(identifier: string): void {
  loginAttempts.delete(identifier);
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const storedKey = Buffer.from(keyHex, "hex");
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;

  return timingSafeEqual(storedKey, derivedKey);
}

/**
 * SECURITY: Timing-safe password comparison for env password
 * Uses constant-time comparison to prevent timing attacks
 */
function verifyEnvPassword(provided: string, expected: string): boolean {
  // Hash both passwords to ensure constant-length comparison
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();

  return timingSafeEqual(providedHash, expectedHash);
}

export const adminLogin: RequestHandler = async (req, res) => {
  const enabled = assertAdminApiEnabled();
  if (enabled.ok === false) return res.status(503).json({ ok: false, error: enabled.message });

  const email = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password.trim() : "";

  if (!password) return res.status(400).json({ ok: false, error: "Mot de passe requis" });

  // SECURITY: Rate limit based on IP and email combination
  const clientIp = (req.ip || req.socket?.remoteAddress || "unknown").trim();
  const rateLimitKey = `${clientIp}:${email || "anonymous"}`;

  const rateCheck = checkAdminRateLimit(rateLimitKey);
  if (!rateCheck.allowed) {
    console.warn(
      "[adminLogin] SECURITY: Rate limit exceeded",
      "IP:", clientIp,
      "Email:", email,
      "Reason:", rateCheck.reason
    );
    return res.status(429).json({
      ok: false,
      error: rateCheck.reason === "account_locked"
        ? "Compte temporairement verrouillé. Réessayez plus tard."
        : "Trop de tentatives. Réessayez dans quelques minutes.",
      retryAfter: rateCheck.retryAfter,
    });
  }

  // First, try to authenticate via environment variables (legacy/fallback)
  const envUsername = process.env.ADMIN_DASHBOARD_USERNAME?.trim().toLowerCase();
  const envPassword = (process.env.ADMIN_DASHBOARD_PASSWORD || process.env.ADMIN_API_KEY || "").trim();

  // SECURITY: Use timing-safe comparison for env password
  if (envPassword && verifyEnvPassword(password, envPassword)) {
    // For legacy auth, email can match envUsername OR be empty/same as envUsername
    if (!envUsername || !email || email === envUsername) {
      // Legacy auth succeeded - find or create collaborator for superadmin
      const supabase = getAdminSupabase();
      const adminEmail = email || envUsername || "admin@sortiraumaroc.ma";

      // Check if collaborator already exists for this superadmin
      let { data: existingCollab } = await supabase
        .from("admin_collaborators")
        .select("id, email, first_name, last_name, display_name, role_id")
        .eq("email", adminEmail)
        .maybeSingle();

      // If not exists, create one
      if (!existingCollab) {
        const { data: newCollab, error: createError } = await supabase
          .from("admin_collaborators")
          .insert({
            email: adminEmail,
            first_name: "Super",
            last_name: "Admin",
            display_name: "Admin",
            role_id: "superadmin",
            status: "active",
            password_hash: "legacy_auth_no_password",
          })
          .select("id, email, first_name, last_name, display_name, role_id")
          .single();

        if (createError) {
          console.error("[adminLogin] Failed to create superadmin collaborator:", createError);
        } else {
          existingCollab = newCollab;
        }
      }

      const collaboratorId = existingCollab?.id || null;
      const displayName = existingCollab?.display_name || "Admin";

      const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
      const token = createAdminSessionToken({
        v: 1,
        exp,
        sub: adminEmail,
        collaborator_id: collaboratorId,
        role: "superadmin",
        name: displayName,
      });

      // Update last login time if collaborator exists
      if (collaboratorId) {
        await supabase
          .from("admin_collaborators")
          .update({ last_login_at: new Date().toISOString() })
          .eq("id", collaboratorId);
      }

      const secure = isRequestSecure(req);
      const cookie = buildSetCookieHeader({
        name: getSessionCookieName(),
        value: token,
        maxAgeSeconds: 60 * 60 * 12,
        secure,
        httpOnly: true,
        sameSite: secure ? "None" : "Lax",
        path: "/",
      });

      res.setHeader("Set-Cookie", cookie);

      // SECURITY: Reset rate limit on successful login
      resetAdminRateLimit(rateLimitKey);

      // Audit: log admin login
      try {
        await supabase.from("admin_audit_log").insert({
          actor_id: collaboratorId,
          action: "admin.login",
          entity_type: "admin_collaborator",
          entity_id: collaboratorId ?? adminEmail,
          metadata: {
            actor_email: adminEmail,
            actor_name: displayName,
            actor_role: "superadmin",
            method: "legacy_env",
          },
        });
      } catch (_) { /* audit log failure must not block login */ }

      return res.json({ ok: true, session_token: token });
    }
  }

  // Try to authenticate via admin_collaborators table
  const supabase = getAdminSupabase();

  const { data: collaborator, error } = await supabase
    .from("admin_collaborators")
    .select("id, email, password_hash, first_name, last_name, display_name, role_id, status")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("Admin login DB error:", error);
    return res.status(500).json({ ok: false, error: "Erreur serveur" });
  }

  if (!collaborator) {
    return res.status(401).json({ ok: false, error: "Identifiants invalides" });
  }

  if (collaborator.status === "suspended") {
    return res.status(403).json({ ok: false, error: "Compte suspendu. Contactez un administrateur." });
  }

  // Verify password
  const passwordValid = await verifyPassword(password, collaborator.password_hash);
  if (!passwordValid) {
    // SECURITY: Log failed login attempt
    console.warn(
      "[adminLogin] SECURITY: Failed login attempt",
      "IP:", clientIp,
      "Email:", email
    );
    return res.status(401).json({ ok: false, error: "Identifiants invalides" });
  }

  // SECURITY: Reset rate limit on successful login
  resetAdminRateLimit(rateLimitKey);

  // Update last login time
  await supabase
    .from("admin_collaborators")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", collaborator.id);

  // Create session token
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 12; // 12 hours
  const displayName = collaborator.display_name || `${collaborator.first_name} ${collaborator.last_name}`.trim();
  const token = createAdminSessionToken({
    v: 1,
    exp,
    sub: collaborator.email,
    collaborator_id: collaborator.id,
    role: collaborator.role_id,
    name: displayName,
  });

  const secure = isRequestSecure(req);
  const cookie = buildSetCookieHeader({
    name: getSessionCookieName(),
    value: token,
    maxAgeSeconds: 60 * 60 * 12,
    secure,
    httpOnly: true,
    sameSite: secure ? "None" : "Lax",
    path: "/",
  });

  res.setHeader("Set-Cookie", cookie);

  // Audit: log collaborator login
  try {
    await supabase.from("admin_audit_log").insert({
      actor_id: collaborator.id,
      action: "admin.login",
      entity_type: "admin_collaborator",
      entity_id: collaborator.id,
      metadata: {
        actor_email: collaborator.email,
        actor_name: displayName,
        actor_role: collaborator.role_id,
        method: "collaborator_password",
      },
    });
  } catch (_) { /* audit log failure must not block login */ }

  res.json({
    ok: true,
    session_token: token,
    collaborator: {
      id: collaborator.id,
      email: collaborator.email,
      firstName: collaborator.first_name,
      lastName: collaborator.last_name,
      displayName: collaborator.display_name,
      roleId: collaborator.role_id,
    },
  });
};

export const adminLogout: RequestHandler = async (req, res) => {
  const secure = isRequestSecure(req);
  const cookie = buildSetCookieHeader({
    name: getSessionCookieName(),
    value: "",
    maxAgeSeconds: 0,
    secure,
    httpOnly: true,
    sameSite: secure ? "None" : "Lax",
    path: "/",
  });

  res.setHeader("Set-Cookie", cookie);
  res.json({ ok: true });
};
