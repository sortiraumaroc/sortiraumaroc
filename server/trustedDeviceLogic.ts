/**
 * Trusted Device Logic
 *
 * Allows users to skip OTP verification on recognized devices.
 * A device trust token (random UUID) is stored as an HttpOnly secure cookie.
 * The server stores a SHA-256 hash of the token — never the plaintext.
 *
 * Flow:
 * 1. User logs in successfully (OTP or password) → server issues trust token cookie
 * 2. On next login attempt, server checks for trust cookie → if valid, skip OTP
 * 3. User can list and revoke trusted devices from their profile
 */

import crypto from "crypto";
import type { Request, Response } from "express";
import { getAdminSupabase } from "./supabaseAdmin";
import { parseCookies } from "./adminSession";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TRUST_TOKEN_COOKIE_NAME = "sam_device_trust";
const TRUST_TOKEN_EXPIRY_DAYS = 90;
const TRUST_TOKEN_EXPIRY_MS = TRUST_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
const MAX_TRUSTED_DEVICES_PER_USER = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateTrustToken(): string {
  return crypto.randomUUID();
}

/**
 * Read the trust cookie from the request (manual parse — no cookie-parser middleware).
 */
function getTrustCookie(req: Request): string | undefined {
  const cookies = parseCookies(req.header("cookie") ?? undefined);
  return cookies[TRUST_TOKEN_COOKIE_NAME] || undefined;
}

/**
 * Derive a human-readable device name from User-Agent (lightweight, no dependency).
 */
function parseDeviceName(userAgent: string): string {
  if (!userAgent) return "Appareil inconnu";

  let browser = "Navigateur";
  let os = "";

  // Detect browser
  if (userAgent.includes("Edg/") || userAgent.includes("Edge/")) browser = "Edge";
  else if (userAgent.includes("OPR/") || userAgent.includes("Opera")) browser = "Opera";
  else if (userAgent.includes("Chrome/") && !userAgent.includes("Edg/")) browser = "Chrome";
  else if (userAgent.includes("Safari/") && !userAgent.includes("Chrome/")) browser = "Safari";
  else if (userAgent.includes("Firefox/")) browser = "Firefox";

  // Detect OS
  if (userAgent.includes("iPhone") || userAgent.includes("iPad")) os = "iOS";
  else if (userAgent.includes("Android")) os = "Android";
  else if (userAgent.includes("Windows")) os = "Windows";
  else if (userAgent.includes("Mac OS")) os = "macOS";
  else if (userAgent.includes("Linux")) os = "Linux";

  if (os) return `${browser} sur ${os}`;
  return browser;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

// ─────────────────────────────────────────────────────────────────────────────
// Core functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if the current request has a valid trusted device cookie for the given user.
 * Returns true if OTP can be skipped.
 */
export async function isTrustedDevice(
  req: Request,
  userId: string
): Promise<boolean> {
  try {
    const token = getTrustCookie(req);
    if (!token || token.length < 10) {
      return false;
    }

    const tokenHash = hashToken(token);
    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("trusted_devices")
      .select("id, expires_at, revoked_at")
      .eq("user_id", userId)
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .single();

    if (error || !data) return false;

    // Check expiry
    if (new Date(data.expires_at) < new Date()) {
      // Expired — clean up
      void supabase
        .from("trusted_devices")
        .delete()
        .eq("id", data.id)
        .then(() => {});
      return false;
    }

    // Update last_used_at (best-effort)
    void supabase
      .from("trusted_devices")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id)
      .then(() => {});

    return true;
  } catch (err) {
    console.error("[TrustedDevice] Error checking trust:", err);
    return false;
  }
}

/**
 * Issue a new trusted device token for the user.
 * Sets the HttpOnly cookie on the response and stores the hash in DB.
 */
export async function issueTrustedDevice(
  req: Request,
  res: Response,
  userId: string
): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    const token = generateTrustToken();
    const tokenHash = hashToken(token);
    const userAgent = req.headers["user-agent"] || "";
    const deviceName = parseDeviceName(userAgent);
    const ipAddress = getClientIp(req);
    const expiresAt = new Date(Date.now() + TRUST_TOKEN_EXPIRY_MS);

    // Enforce max devices per user — remove oldest if at limit
    const { data: existingDevices } = await supabase
      .from("trusted_devices")
      .select("id, created_at")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .order("created_at", { ascending: true });

    if (existingDevices && existingDevices.length >= MAX_TRUSTED_DEVICES_PER_USER) {
      // Remove the oldest device(s) to make room
      const toRemove = existingDevices.slice(
        0,
        existingDevices.length - MAX_TRUSTED_DEVICES_PER_USER + 1
      );
      const idsToRemove = toRemove.map((d) => d.id);
      await supabase
        .from("trusted_devices")
        .delete()
        .in("id", idsToRemove);
    }

    // Insert new trusted device
    const { error: insertError } = await supabase
      .from("trusted_devices")
      .insert({
        user_id: userId,
        token_hash: tokenHash,
        device_name: deviceName,
        ip_address: ipAddress,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error("[TrustedDevice] Failed to store device:", insertError);
      return;
    }

    // Set HttpOnly secure cookie
    res.cookie(TRUST_TOKEN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: TRUST_TOKEN_EXPIRY_MS,
      path: "/",
    });

    console.log(
      `[TrustedDevice] Issued trust token for user ${userId} — device: ${deviceName}`
    );
  } catch (err) {
    console.error("[TrustedDevice] Error issuing token:", err);
    // Non-blocking — don't fail the login
  }
}

/**
 * Revoke the current device's trust token (e.g. on logout).
 */
export async function revokeCurrentDevice(req: Request, res: Response): Promise<void> {
  try {
    const token = getTrustCookie(req);
    if (!token) return;

    const tokenHash = hashToken(token);
    const supabase = getAdminSupabase();

    await supabase
      .from("trusted_devices")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", tokenHash);

    // Clear the cookie
    res.clearCookie(TRUST_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  } catch (err) {
    console.error("[TrustedDevice] Error revoking current device:", err);
  }
}

/**
 * List all trusted devices for a user (for profile management UI).
 */
export async function listTrustedDevices(
  req: Request,
  userId: string
): Promise<
  Array<{
    id: string;
    device_name: string;
    ip_address: string;
    created_at: string;
    last_used_at: string;
    is_current: boolean;
  }>
> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("trusted_devices")
    .select("id, device_name, ip_address, created_at, last_used_at, token_hash")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("last_used_at", { ascending: false });

  if (error || !data) return [];

  // Determine which device is the current one (if cookie present)
  let currentTokenHash: string | null = null;
  const token = getTrustCookie(req);
  if (token) {
    currentTokenHash = hashToken(token);
  }

  return data.map((d) => ({
    id: d.id,
    device_name: d.device_name || "Appareil inconnu",
    ip_address: d.ip_address || "",
    created_at: d.created_at,
    last_used_at: d.last_used_at,
    is_current: currentTokenHash ? d.token_hash === currentTokenHash : false,
  }));
}

/**
 * Revoke a specific trusted device by ID (user action from profile).
 */
export async function revokeTrustedDevice(
  userId: string,
  deviceId: string
): Promise<boolean> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("trusted_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", deviceId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id")
    .single();

  return !error && !!data;
}

/**
 * Revoke ALL trusted devices for a user (e.g. password change, security action).
 */
export async function revokeAllTrustedDevices(userId: string): Promise<number> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("trusted_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id");

  if (error) return 0;
  return data?.length || 0;
}

/**
 * Clean up expired and revoked devices (cron job helper).
 * Deletes devices that expired more than 7 days ago or were revoked more than 7 days ago.
 */
export async function cleanupExpiredDevices(): Promise<number> {
  const supabase = getAdminSupabase();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Delete expired devices
  const { data: expired } = await supabase
    .from("trusted_devices")
    .delete()
    .lt("expires_at", cutoff)
    .select("id");

  // Delete revoked devices older than 7 days
  const { data: revoked } = await supabase
    .from("trusted_devices")
    .delete()
    .not("revoked_at", "is", null)
    .lt("revoked_at", cutoff)
    .select("id");

  const total = (expired?.length || 0) + (revoked?.length || 0);
  if (total > 0) {
    console.log(`[TrustedDevice] Cleaned up ${total} expired/revoked devices`);
  }
  return total;
}

/**
 * Check if the request's cookie matches any user's trusted device.
 * Used by login handlers to determine if OTP can be skipped.
 * Returns the userId if trust is valid, null otherwise.
 */
export async function getTrustedDeviceUserId(
  req: Request
): Promise<string | null> {
  try {
    const token = getTrustCookie(req);
    if (!token || token.length < 10) {
      return null;
    }

    const tokenHash = hashToken(token);
    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("trusted_devices")
      .select("id, user_id, expires_at, revoked_at")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .single();

    if (error || !data) return null;

    if (new Date(data.expires_at) < new Date()) {
      void supabase.from("trusted_devices").delete().eq("id", data.id).then(() => {});
      return null;
    }

    // Update last_used_at (best-effort)
    void supabase
      .from("trusted_devices")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id)
      .then(() => {});

    return data.user_id;
  } catch {
    return null;
  }
}
