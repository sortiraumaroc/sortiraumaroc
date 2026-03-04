/**
 * Consumer TOTP Routes
 * API endpoints for user personal dynamic QR codes
 *
 * Endpoints:
 * - GET  /api/consumer/totp/secret     - Get or generate TOTP secret for current user
 * - GET  /api/consumer/totp/code       - Generate current TOTP code
 * - POST /api/consumer/totp/regenerate - Regenerate secret (if compromised)
 * - POST /api/consumer/totp/validate   - Validate a user QR code (for Pro scanner)
 * - GET  /api/consumer/totp/user-info/:userId - Get user info after validation (for Pro)
 */

import type { Request, Response } from "express";
import type { Express } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { authRateLimiter, createRateLimiter } from "../middleware/rateLimiter";
import { zBody, zParams } from "../lib/validate";
import { ValidateConsumerTotpSchema, ConsumerUserIdParams } from "../schemas/consumerTotpRoutes";
import {
  generateTOTP,
  validateTOTP,
  getSecondsUntilNextPeriod,
  generateSecret,
} from "../lib/totp";
import { scoreToReliabilityLevel } from "../consumerReliability";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("consumerTotp");

// ============================================================================
// Types
// ============================================================================

interface ConsumerTOTPSecretRow {
  id: string;
  user_id: string;
  secret: string;
  algorithm: string;
  digits: number;
  period: number;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  validation_count: number;
}

interface ConsumerUserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  status: string;
  account_status: string;
  created_at: string;
}

interface ConsumerUserStatsRow {
  user_id: string;
  reliability_score: number;
  reservations_count: number;
  no_shows_count: number;
  last_activity_at: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) {
    log.warn("no bearer token in request");
    return null;
  }

  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase.auth.getUser(token);
    if (error) {
      log.warn({ error: error.message }, "auth.getUser error");
      return null;
    }
    if (!data.user) {
      log.warn("no user in response");
      return null;
    }
    return typeof data.user.id === "string" ? data.user.id.trim() : null;
  } catch (e) {
    log.error({ err: e }, "getUserIdFromRequest exception");
    return null;
  }
}

/**
 * Generate QR payload for user TOTP
 * Format: SAM:USER:v1:{userId}:{totpCode}:{timestamp}
 */
function encodeUserQRPayload(userId: string, code: string): string {
  const ts = Math.floor(Date.now() / 1000);
  return `SAM:USER:v1:${userId}:${code}:${ts}`;
}

/**
 * Decode user QR payload
 * Returns null if not a valid user QR format
 */
function decodeUserQRPayload(
  qrString: string
): { userId: string; code: string; ts: number } | null {
  const trimmed = qrString.trim();

  // Check for user QR format: SAM:USER:v1:{userId}:{code}:{ts}
  if (trimmed.startsWith("SAM:USER:v")) {
    const parts = trimmed.split(":");
    if (parts.length >= 6) {
      return {
        userId: parts[3],
        code: parts[4],
        ts: parseInt(parts[5], 10),
      };
    }
  }

  return null;
}

// ============================================================================
// GET /api/consumer/totp/secret
// Get or generate TOTP secret for current user
// ============================================================================

export async function getConsumerTOTPSecret(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = await getUserIdFromRequest(req);

    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const supabase = getAdminSupabase();

    // Verify user exists and is active — auto-create consumer_users row if missing
    let { data: user, error: userError } = await supabase
      .from("consumer_users")
      .select("id, full_name, account_status")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      // User may be authenticated via Supabase Auth but missing from consumer_users.
      // Insert (not upsert) to avoid overwriting existing data in a race condition.
      const { data: authData } = await supabase.auth.admin.getUserById(userId);
      const email = authData?.user?.email ?? `unknown+${userId}@example.invalid`;
      const meta = authData?.user?.user_metadata;
      const fullName =
        typeof meta?.full_name === "string" ? meta.full_name
        : [meta?.first_name, meta?.last_name].filter(Boolean).join(" ") || "";

      const { error: insErr } = await supabase
        .from("consumer_users")
        .insert({ id: userId, email, full_name: fullName, city: "", country: "" });

      // 23505 = unique_violation (row already exists) — that's fine
      if (insErr && insErr.code !== "23505") {
        log.error({ err: insErr }, "failed to auto-create consumer_users");
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Re-select (either just-created or pre-existing)
      const { data: refetched, error: refetchErr } = await supabase
        .from("consumer_users")
        .select("id, full_name, account_status")
        .eq("id", userId)
        .single();

      if (refetchErr || !refetched) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      user = refetched;

      // Also ensure consumer_user_stats row exists
      await supabase
        .from("consumer_user_stats")
        .upsert({ user_id: userId }, { onConflict: "user_id" })
        .then(() => {});
    }

    if (user.account_status !== "active") {
      res.status(403).json({
        error: "Account not active",
        account_status: user.account_status,
      });
      return;
    }

    // Get or create TOTP secret
    let { data: secretRow, error: secretError } = await supabase
      .from("consumer_user_totp_secrets")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .single();

    if (secretError || !secretRow) {
      // Generate new secret
      const newSecret = generateSecret(20);

      const { data: inserted, error: insertError } = await supabase
        .from("consumer_user_totp_secrets")
        .insert({
          user_id: userId,
          secret: newSecret,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
        })
        .select()
        .single();

      if (insertError) {
        log.error({ err: insertError }, "error creating secret");
        res.status(500).json({ error: "Failed to generate TOTP secret" });
        return;
      }

      secretRow = inserted;
    }

    // Return secret info for client
    res.json({
      ok: true,
      userId,
      userName: user.full_name,
      secret: secretRow.secret,
      algorithm: secretRow.algorithm,
      digits: secretRow.digits,
      period: secretRow.period,
      secondsRemaining: getSecondsUntilNextPeriod(secretRow.period),
    });
  } catch (error) {
    log.error({ err: error }, "error in getConsumerTOTPSecret");
    res.status(500).json({ error: "Internal server error" });
  }
}

// ============================================================================
// GET /api/consumer/totp/code
// Generate current TOTP code for user
// ============================================================================

export async function generateConsumerTOTPCode(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = await getUserIdFromRequest(req);

    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const supabase = getAdminSupabase();

    // Get user info — auto-create if missing
    let { data: user, error: userError } = await supabase
      .from("consumer_users")
      .select("id, full_name, account_status")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      const { data: authData } = await supabase.auth.admin.getUserById(userId);
      const email = authData?.user?.email ?? `unknown+${userId}@example.invalid`;
      const meta = authData?.user?.user_metadata;
      const fullName =
        typeof meta?.full_name === "string" ? meta.full_name
        : [meta?.first_name, meta?.last_name].filter(Boolean).join(" ") || "";

      await supabase
        .from("consumer_users")
        .insert({ id: userId, email, full_name: fullName, city: "", country: "" })
        .then(() => {}); // ignore 23505 unique_violation

      const { data: refetched } = await supabase
        .from("consumer_users")
        .select("id, full_name, account_status")
        .eq("id", userId)
        .single();
      if (!refetched) { res.status(404).json({ error: "User not found" }); return; }
      user = refetched;
      await supabase.from("consumer_user_stats").upsert({ user_id: userId }, { onConflict: "user_id" }).then(() => {});
    }

    if (user.account_status !== "active") {
      res.status(403).json({ error: "Account not active" });
      return;
    }

    // Get TOTP secret
    const { data: secretRow, error: secretError } = await supabase
      .from("consumer_user_totp_secrets")
      .select("secret, algorithm, digits, period")
      .eq("user_id", userId)
      .eq("is_active", true)
      .single();

    if (secretError || !secretRow) {
      res.status(404).json({
        error: "No TOTP secret found",
        hint: "Call GET /api/consumer/totp/secret first",
      });
      return;
    }

    // Generate code
    const code = generateTOTP({
      secret: secretRow.secret,
      algorithm: secretRow.algorithm as "SHA1" | "SHA256" | "SHA512",
      digits: secretRow.digits,
      period: secretRow.period,
    });

    // Generate QR payload
    const qrString = encodeUserQRPayload(userId, code);

    res.json({
      ok: true,
      code,
      qrString,
      userId,
      userName: user.full_name,
      expiresIn: getSecondsUntilNextPeriod(secretRow.period),
      period: secretRow.period,
    });
  } catch (error) {
    log.error({ err: error }, "error in generateConsumerTOTPCode");
    res.status(500).json({ error: "Internal server error" });
  }
}

// ============================================================================
// POST /api/consumer/totp/regenerate
// Regenerate TOTP secret (if compromised)
// ============================================================================

export async function regenerateConsumerTOTPSecret(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const userId = await getUserIdFromRequest(req);

    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const supabase = getAdminSupabase();

    // Verify user exists — auto-create if missing
    let { data: user, error: userError } = await supabase
      .from("consumer_users")
      .select("id, account_status")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      const { data: authData } = await supabase.auth.admin.getUserById(userId);
      const email = authData?.user?.email ?? `unknown+${userId}@example.invalid`;
      const meta = authData?.user?.user_metadata;
      const fullName =
        typeof meta?.full_name === "string" ? meta.full_name
        : [meta?.first_name, meta?.last_name].filter(Boolean).join(" ") || "";

      await supabase
        .from("consumer_users")
        .insert({ id: userId, email, full_name: fullName, city: "", country: "" })
        .then(() => {}); // ignore 23505

      const { data: refetched } = await supabase
        .from("consumer_users")
        .select("id, account_status")
        .eq("id", userId)
        .single();
      if (!refetched) { res.status(404).json({ error: "User not found" }); return; }
      user = refetched;
      await supabase.from("consumer_user_stats").upsert({ user_id: userId }, { onConflict: "user_id" }).then(() => {});
    }

    if (user.account_status !== "active") {
      res.status(403).json({ error: "Account not active" });
      return;
    }

    // Deactivate old secret
    await supabase
      .from("consumer_user_totp_secrets")
      .update({ is_active: false })
      .eq("user_id", userId)
      .eq("is_active", true);

    // Generate new secret
    const newSecret = generateSecret(20);

    const { data: inserted, error: insertError } = await supabase
      .from("consumer_user_totp_secrets")
      .insert({
        user_id: userId,
        secret: newSecret,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
      })
      .select()
      .single();

    if (insertError) {
      log.error({ err: insertError }, "error regenerating secret");
      res.status(500).json({ error: "Failed to regenerate secret" });
      return;
    }

    res.json({
      ok: true,
      message: "TOTP secret regenerated successfully",
      secret: newSecret,
      period: 30,
      digits: 6,
    });
  } catch (error) {
    log.error({ err: error }, "error in regenerateConsumerTOTPSecret");
    res.status(500).json({ error: "Internal server error" });
  }
}

// ============================================================================
// POST /api/consumer/totp/validate
// Validate a user QR code (called by Pro scanner)
// ============================================================================

export async function validateConsumerTOTPCode(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { qrString, code, userId: targetUserId, establishmentId } = req.body;
    const validatorUserId = await getUserIdFromRequest(req); // Pro who is scanning

    // Must have either qrString or (code + userId)
    if (!qrString && (!code || !targetUserId)) {
      res.status(400).json({
        error: "Missing required fields",
        hint: "Provide either qrString or (code + userId)",
      });
      return;
    }

    const supabase = getAdminSupabase();

    let userIdToValidate = targetUserId;
    let codeToValidate = code;

    // If qrString is provided, decode it
    if (qrString) {
      const payload = decodeUserQRPayload(qrString);

      if (!payload) {
        res.json({
          ok: true,
          result: "rejected",
          reason: "invalid_format",
          message: "Format QR invalide",
        });
        return;
      }

      userIdToValidate = payload.userId;
      codeToValidate = payload.code;

      // Check if QR is too old (prevent replay with screenshots)
      const maxAgeSeconds = 90; // 3 periods
      const now = Math.floor(Date.now() / 1000);
      const age = now - payload.ts;

      if (age < 0 || age > maxAgeSeconds) {
        await logValidation(supabase, {
          userId: userIdToValidate,
          submittedCode: codeToValidate,
          isValid: false,
          rejectionReason: "expired_qr",
          establishmentId,
          validatorUserId,
        });

        res.json({
          ok: true,
          result: "rejected",
          reason: "expired_qr",
          message: "QR code expiré, demandez un nouveau",
        });
        return;
      }
    }

    // Get user info
    const { data: user, error: userError } = await supabase
      .from("consumer_users")
      .select("id, full_name, email, account_status, created_at")
      .eq("id", userIdToValidate)
      .single();

    if (userError || !user) {
      await logValidation(supabase, {
        userId: userIdToValidate,
        submittedCode: codeToValidate,
        isValid: false,
        rejectionReason: "user_not_found",
        establishmentId,
        validatorUserId,
      });

      res.json({
        ok: true,
        result: "rejected",
        reason: "user_not_found",
        message: "Utilisateur non trouvé",
      });
      return;
    }

    if (user.account_status !== "active") {
      await logValidation(supabase, {
        userId: userIdToValidate,
        submittedCode: codeToValidate,
        isValid: false,
        rejectionReason: "account_inactive",
        establishmentId,
        validatorUserId,
      });

      res.json({
        ok: true,
        result: "rejected",
        reason: "account_inactive",
        message: "Compte utilisateur inactif",
      });
      return;
    }

    // Get TOTP secret
    const { data: secretRow, error: secretError } = await supabase
      .from("consumer_user_totp_secrets")
      .select("id, secret, algorithm, digits, period")
      .eq("user_id", userIdToValidate)
      .eq("is_active", true)
      .single();

    if (secretError || !secretRow) {
      await logValidation(supabase, {
        userId: userIdToValidate,
        submittedCode: codeToValidate,
        isValid: false,
        rejectionReason: "no_secret",
        establishmentId,
        validatorUserId,
      });

      res.json({
        ok: true,
        result: "rejected",
        reason: "no_secret",
        message: "Utilisateur sans QR code configuré",
      });
      return;
    }

    // Validate TOTP
    const validation = validateTOTP(codeToValidate, {
      secret: secretRow.secret,
      algorithm: secretRow.algorithm as "SHA1" | "SHA256" | "SHA512",
      digits: secretRow.digits,
      period: secretRow.period,
      window: 1, // Accept ±1 period for clock drift
    });

    if (!validation.valid) {
      await logValidation(supabase, {
        userId: userIdToValidate,
        secretId: secretRow.id,
        submittedCode: codeToValidate,
        expectedCode: validation.expectedCode,
        isValid: false,
        rejectionReason: validation.reason || "invalid_code",
        establishmentId,
        validatorUserId,
      });

      res.json({
        ok: true,
        result: "rejected",
        reason: "invalid_code",
        message: "Code QR invalide ou expiré",
      });
      return;
    }

    // Success! Get user stats
    const { data: stats } = await supabase
      .from("consumer_user_stats")
      .select("reliability_score, reservations_count, no_shows_count, last_activity_at")
      .eq("user_id", userIdToValidate)
      .single();

    // Update secret usage stats
    await supabase
      .from("consumer_user_totp_secrets")
      .update({
        last_used_at: new Date().toISOString(),
        validation_count: (secretRow as any).validation_count + 1,
      })
      .eq("id", secretRow.id);

    await logValidation(supabase, {
      userId: userIdToValidate,
      secretId: secretRow.id,
      submittedCode: codeToValidate,
      expectedCode: validation.expectedCode,
      isValid: true,
      timeWindow: validation.timeWindow,
      establishmentId,
      validatorUserId,
    });

    // Get reliability level from score
    const reliabilityScore = stats?.reliability_score ?? 100;
    const reliabilityLevel = scoreToReliabilityLevel(reliabilityScore);

    // ── Enrich: fetch today's reservations + active packs for this establishment ──
    let todayReservations: Array<{
      id: string;
      booking_reference: string | null;
      status: string | null;
      payment_status: string | null;
      starts_at: string | null;
      party_size: number | null;
      checked_in_at: string | null;
      kind: string | null;
    }> = [];

    let activePacks: Array<{
      id: string;
      pack_id: string | null;
      quantity: number;
      total_price: number | null;
      currency: string | null;
      status: string | null;
      valid_from: string | null;
      valid_until: string | null;
      meta: Record<string, unknown> | null;
    }> = [];

    if (establishmentId) {
      // Today's and tomorrow's reservations for this user at this establishment
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString();

      const { data: reservations } = await supabase
        .from("reservations")
        .select("id, booking_reference, status, payment_status, starts_at, party_size, checked_in_at, kind")
        .eq("user_id", userIdToValidate)
        .eq("establishment_id", establishmentId)
        .gte("starts_at", startOfToday)
        .lt("starts_at", endOfTomorrow)
        .order("starts_at", { ascending: true })
        .limit(10);

      if (reservations) {
        todayReservations = reservations as typeof todayReservations;
      }

      // Active pack purchases for this user at this establishment
      // Note: buyer_user_id is inside meta jsonb column
      const { data: packs } = await supabase
        .from("pack_purchases")
        .select("id, pack_id, quantity, total_price, currency, status, valid_from, valid_until, meta")
        .eq("establishment_id", establishmentId)
        .eq("payment_status", "paid")
        .contains("meta", { buyer_user_id: userIdToValidate });

      if (packs) {
        const nowIso = now.toISOString();
        activePacks = (packs as typeof activePacks).filter((p) => {
          // Keep only active and non-expired packs
          if (p.status !== "active") return false;
          if (p.valid_until && p.valid_until < nowIso) return false;
          return true;
        });
      }
    }

    res.json({
      ok: true,
      result: "accepted",
      reason: "ok",
      message: "Utilisateur vérifié ✓",
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        memberSince: user.created_at,
        reliabilityScore,
        reliabilityLevel,
        reservationsCount: stats?.reservations_count ?? 0,
        noShowsCount: stats?.no_shows_count ?? 0,
        lastActivity: stats?.last_activity_at,
      },
      reservations: todayReservations.map((r) => ({
        id: r.id,
        bookingReference: r.booking_reference,
        status: r.status,
        paymentStatus: r.payment_status,
        startsAt: r.starts_at,
        partySize: r.party_size,
        checkedInAt: r.checked_in_at,
        kind: r.kind,
      })),
      packs: activePacks.map((p) => ({
        id: p.id,
        packId: p.pack_id,
        title: (p.meta as Record<string, unknown> | null)?.pack_title as string | null ?? null,
        quantity: p.quantity,
        totalPrice: p.total_price,
        currency: p.currency,
        status: p.status,
        validFrom: p.valid_from,
        validUntil: p.valid_until,
      })),
    });
  } catch (error) {
    log.error({ err: error }, "error in validateConsumerTOTPCode");
    res.status(500).json({ error: "Internal server error" });
  }
}

// ============================================================================
// GET /api/consumer/totp/user-info/:userId
// Get user info after validation (for Pro dashboard)
// ============================================================================

export async function getConsumerUserInfo(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { userId: targetUserId } = req.params;
    const requesterId = await getUserIdFromRequest(req);

    if (!targetUserId) {
      res.status(400).json({ error: "Missing userId" });
      return;
    }

    // TODO: Add Pro authentication check here
    // For now, allow any authenticated user to check

    const supabase = getAdminSupabase();

    // Get user info
    const { data: user, error: userError } = await supabase
      .from("consumer_users")
      .select("id, full_name, email, account_status, created_at")
      .eq("id", targetUserId)
      .single();

    if (userError || !user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Get user stats
    const { data: stats } = await supabase
      .from("consumer_user_stats")
      .select("reliability_score, reservations_count, no_shows_count, last_activity_at")
      .eq("user_id", targetUserId)
      .single();

    const reliabilityScore = stats?.reliability_score ?? 100;
    const reliabilityLevel = scoreToReliabilityLevel(reliabilityScore);

    res.json({
      ok: true,
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        accountStatus: user.account_status,
        memberSince: user.created_at,
        reliabilityScore,
        reliabilityLevel,
        reservationsCount: stats?.reservations_count ?? 0,
        noShowsCount: stats?.no_shows_count ?? 0,
        lastActivity: stats?.last_activity_at,
      },
    });
  } catch (error) {
    log.error({ err: error }, "error in getConsumerUserInfo");
    res.status(500).json({ error: "Internal server error" });
  }
}

// ============================================================================
// Helper: Log validation attempt
// ============================================================================

async function logValidation(
  supabase: ReturnType<typeof getAdminSupabase>,
  data: {
    userId: string;
    secretId?: string;
    submittedCode: string;
    expectedCode?: string;
    isValid: boolean;
    rejectionReason?: string;
    timeWindow?: number;
    establishmentId?: string;
    validatorUserId?: string | null;
  }
): Promise<void> {
  try {
    await supabase.from("consumer_totp_validation_logs").insert({
      user_id: data.userId,
      secret_id: data.secretId || null,
      submitted_code: data.submittedCode,
      expected_code: data.expectedCode || null,
      is_valid: data.isValid,
      rejection_reason: data.rejectionReason || null,
      time_window: data.timeWindow ?? null,
      establishment_id: data.establishmentId || null,
      validated_by_user_id: data.validatorUserId || null,
    });
  } catch (error) {
    log.error({ err: error }, "error logging validation");
    // Don't throw - logging failure shouldn't break validation
  }
}

// ============================================================================
// GET /api/consumer/totp/health
// Quick health check — verifies DB tables exist and are accessible
// No auth required (diagnostic endpoint)
// ============================================================================

export async function consumerTotpHealthCheck(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const supabase = getAdminSupabase();
    const checks: Record<string, string> = {};

    // Check consumer_users table
    const { error: cuErr } = await supabase
      .from("consumer_users")
      .select("id")
      .limit(1);
    checks.consumer_users = cuErr ? `ERROR: ${cuErr.message}` : "OK";

    // Check consumer_user_totp_secrets table
    const { error: tsErr } = await supabase
      .from("consumer_user_totp_secrets")
      .select("id")
      .limit(1);
    checks.consumer_user_totp_secrets = tsErr ? `ERROR: ${tsErr.message}` : "OK";

    // Check consumer_totp_validation_logs table
    const { error: vlErr } = await supabase
      .from("consumer_totp_validation_logs")
      .select("id")
      .limit(1);
    checks.consumer_totp_validation_logs = vlErr ? `ERROR: ${vlErr.message}` : "OK";

    // Check consumer_user_stats table
    const { error: usErr } = await supabase
      .from("consumer_user_stats")
      .select("user_id")
      .limit(1);
    checks.consumer_user_stats = usErr ? `ERROR: ${usErr.message}` : "OK";

    const allOk = Object.values(checks).every((v) => v === "OK");

    res.status(allOk ? 200 : 503).json({
      ok: allOk,
      service: "consumer-totp",
      checks,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ err: error }, "health check failed");
    res.status(500).json({
      ok: false,
      service: "consumer-totp",
      error: "Health check failed",
      timestamp: new Date().toISOString(),
    });
  }
}

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerConsumerTotpRoutes(app: Express) {
  app.get("/api/consumer/totp/health", consumerTotpHealthCheck);
  app.get("/api/consumer/totp/secret", createRateLimiter("totp-secret", { windowMs: 5 * 60 * 1000, maxRequests: 10 }), getConsumerTOTPSecret);
  app.get("/api/consumer/totp/code", createRateLimiter("totp-code", { windowMs: 5 * 60 * 1000, maxRequests: 10 }), generateConsumerTOTPCode);
  app.post("/api/consumer/totp/regenerate", authRateLimiter, regenerateConsumerTOTPSecret);
  app.post("/api/consumer/totp/validate", authRateLimiter, zBody(ValidateConsumerTotpSchema), validateConsumerTOTPCode);
  app.get("/api/consumer/totp/user-info/:userId", zParams(ConsumerUserIdParams), getConsumerUserInfo);
}
