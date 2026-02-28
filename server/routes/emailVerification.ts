/**
 * Email Verification Routes
 *
 * Handles email verification for user signup.
 * Sends a server-generated 6-digit code to the user's email address.
 * Codes and rate-limiting are stored in the database (not in-memory).
 * Supports reCAPTCHA v2 verification.
 */

import type { Request, Response } from "express";
import type { Express } from "express";
import crypto from "crypto";
import { sendLoggedEmail } from "../emailService";
import { verifyRecaptchaToken, isRecaptchaConfigured } from "./recaptcha";
import { getAdminSupabase } from "../supabaseAdmin";
import { issueTrustedDevice } from "../trustedDeviceLogic";
import { createModuleLogger } from "../lib/logger";
import { getPublicBaseUrl } from "../lib/publicBaseUrl";
import { zBody } from "../lib/validate";
import {
  emailSendCodeSchema,
  emailVerifyCodeSchema,
  emailSignupSchema,
  setEmailPasswordSchema,
} from "../schemas/emailVerification";

const log = createModuleLogger("emailVerification");

const MAX_ATTEMPTS_PER_HOUR = 5;
const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const VERIFIED_EMAIL_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/** Generate a cryptographically secure 6-digit code */
function generateCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function checkRateLimit(email: string): Promise<boolean> {
  const supabase = getAdminSupabase();
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const { data } = await supabase
    .from("consumer_email_verification_attempts")
    .select("attempt_count, window_start")
    .eq("email", email)
    .maybeSingle();

  if (!data) return false; // No attempts yet

  const windowStart = new Date(data.window_start);
  if (windowStart < oneHourAgo) return false; // Window expired

  return data.attempt_count >= MAX_ATTEMPTS_PER_HOUR;
}

async function incrementRateLimit(email: string): Promise<void> {
  const supabase = getAdminSupabase();
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const { data: existing } = await supabase
    .from("consumer_email_verification_attempts")
    .select("id, attempt_count, window_start")
    .eq("email", email)
    .maybeSingle();

  if (!existing) {
    // First attempt
    await supabase
      .from("consumer_email_verification_attempts")
      .insert({ email, attempt_count: 1, window_start: now.toISOString() });
  } else {
    const windowStart = new Date(existing.window_start);
    if (windowStart < oneHourAgo) {
      // Reset window
      await supabase
        .from("consumer_email_verification_attempts")
        .update({ attempt_count: 1, window_start: now.toISOString() })
        .eq("id", existing.id);
    } else {
      // Increment
      await supabase
        .from("consumer_email_verification_attempts")
        .update({ attempt_count: existing.attempt_count + 1 })
        .eq("id", existing.id);
    }
  }
}

async function storeVerificationCode(email: string, code: string, req: Request): Promise<void> {
  const supabase = getAdminSupabase();

  // Invalidate any previous active codes for this email
  await supabase
    .from("consumer_email_verification_codes")
    .delete()
    .eq("email", email)
    .is("verified_at", null);

  // Insert new code
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);
  await supabase
    .from("consumer_email_verification_codes")
    .insert({
      email,
      code,
      expires_at: expiresAt.toISOString(),
      ip_address: req.ip || req.socket.remoteAddress || null,
      user_agent: req.headers["user-agent"] || null,
    });
}

async function verifyStoredCode(email: string, code: string): Promise<{ valid: boolean; error?: string }> {
  const supabase = getAdminSupabase();

  // Find the most recent active code for this email
  const { data, error } = await supabase
    .from("consumer_email_verification_codes")
    .select("id, code, expires_at")
    .eq("email", email)
    .is("verified_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { valid: false, error: "Code expiré ou invalide" };
  }

  if (new Date(data.expires_at) < new Date()) {
    // Expired — clean up
    await supabase
      .from("consumer_email_verification_codes")
      .delete()
      .eq("id", data.id);
    return { valid: false, error: "Code expiré" };
  }

  if (data.code !== code) {
    return { valid: false, error: "Code incorrect" };
  }

  // Mark as verified
  await supabase
    .from("consumer_email_verification_codes")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", data.id);

  return { valid: true };
}

async function isEmailRecentlyVerified(email: string): Promise<boolean> {
  const supabase = getAdminSupabase();
  const fiveMinAgo = new Date(Date.now() - VERIFIED_EMAIL_EXPIRY_MS);

  const { data } = await supabase
    .from("consumer_email_verification_codes")
    .select("id")
    .eq("email", email)
    .not("verified_at", "is", null)
    .gte("verified_at", fiveMinAgo.toISOString())
    .limit(1)
    .maybeSingle();

  return !!data;
}

async function consumeEmailVerification(email: string): Promise<void> {
  const supabase = getAdminSupabase();
  const fiveMinAgo = new Date(Date.now() - VERIFIED_EMAIL_EXPIRY_MS);

  // Delete all verified codes for this email (consume one-time)
  await supabase
    .from("consumer_email_verification_codes")
    .delete()
    .eq("email", email)
    .not("verified_at", "is", null)
    .gte("verified_at", fiveMinAgo.toISOString());
}

// ---------------------------------------------------------------------------
// Endpoint 1: Send verification code
// POST /api/consumer/verify-email/send
// ---------------------------------------------------------------------------

export async function sendEmailVerificationCode(req: Request, res: Response) {
  try {
    const { email, recaptchaToken } = req.body;

    if (!email || typeof email !== "string" || !/.+@.+\..+/.test(email.trim())) {
      return res.status(400).json({ error: "Email invalide" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if email already exists in the database BEFORE sending any code
    const supabase = getAdminSupabase();
    const { data: authUsersList } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });

    const existingUser = authUsersList?.users?.find(
      (u: any) => u.email === normalizedEmail
    );

    if (existingUser) {
      log.info({ email: normalizedEmail }, "email already registered");
      return res.status(409).json({
        error: "Un compte existe déjà avec cet email. Veuillez vous connecter.",
        code: "EMAIL_ALREADY_EXISTS",
      });
    }

    // Rate limiting check (DB-based)
    const rateLimited = await checkRateLimit(normalizedEmail);
    if (rateLimited) {
      log.warn({ email: normalizedEmail }, "rate limit exceeded");
      return res.status(429).json({ error: "Trop de tentatives. Réessayez dans une heure." });
    }

    // Skip reCAPTCHA for authenticated phone users (they're already verified)
    let isAuthenticatedPhoneUser = false;
    const authHeader = String(req.headers.authorization ?? "");
    const bearerToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
    if (bearerToken) {
      try {
        const supabaseCheck = getAdminSupabase();
        const { data: userData } = await supabaseCheck.auth.getUser(bearerToken);
        const meta = userData?.user?.user_metadata as Record<string, unknown> | undefined;
        if (meta?.auth_method === "phone") {
          isAuthenticatedPhoneUser = true;
        }
      } catch (err) {
        log.warn({ err }, "Non-fatal: phone auth check failed, falling through to reCAPTCHA");
      }
    }

    // Verify reCAPTCHA token if configured (skip for authenticated phone users)
    if (!isAuthenticatedPhoneUser && isRecaptchaConfigured()) {
      if (!recaptchaToken) {
        return res.status(400).json({ error: "Vérification reCAPTCHA requise" });
      }

      const clientIp = req.ip || req.socket.remoteAddress;
      const recaptchaValid = await verifyRecaptchaToken(recaptchaToken, clientIp);

      if (!recaptchaValid) {
        log.warn({ email: normalizedEmail }, "reCAPTCHA verification failed");
        return res.status(400).json({ error: "Vérification reCAPTCHA échouée" });
      }
    }

    // Update rate limiting (DB-based)
    await incrementRateLimit(normalizedEmail);

    // Generate code server-side and store in DB
    const code = generateCode();
    await storeVerificationCode(normalizedEmail, code, req);

    // Send the verification email
    const result = await sendLoggedEmail({
      emailId: `verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromKey: "noreply",
      to: [normalizedEmail],
      subject: "Votre code de vérification Sortir Au Maroc",
      bodyText: `Vérification de votre email\n\nVotre code de vérification est : ${code}\n\nCe code est valide pendant 10 minutes.\n\nSi vous n'avez pas demandé ce code, ignorez cet email.`,
      meta: {
        type: "email_verification",
        recipient_email: normalizedEmail,
      },
    });

    if (result.ok === false) {
      log.error({ err: result.error }, "failed to send verification email");

      // Detect SES sandbox rejection
      const isSandbox =
        result.error.includes("Email address is not verified") ||
        result.error.includes("identities failed the check");

      if (isSandbox) {
        log.error({ email: normalizedEmail }, "AWS SES sandbox: recipient is not a verified identity");
        return res.status(500).json({
          error:
            "Impossible d'envoyer l'email : l'adresse destinataire n'est pas vérifiée dans Amazon SES (mode sandbox). " +
            "Ajoutez cette adresse dans la console SES ou demandez l'accès production.",
        });
      }

      return res.status(500).json({ error: "Impossible d'envoyer l'email" });
    }

    log.info({ email: normalizedEmail }, "verification code sent");
    return res.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "sendEmailVerificationCode failed");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

// ---------------------------------------------------------------------------
// Endpoint 2: Verify code
// POST /api/consumer/verify-email/verify
// ---------------------------------------------------------------------------

export async function verifyEmailCode(req: Request, res: Response) {
  try {
    const { email, code } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email manquant" });
    }

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Code manquant" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const result = await verifyStoredCode(normalizedEmail, code);

    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }

    log.info({ email: normalizedEmail }, "email verified");
    return res.json({ ok: true, verified: true });
  } catch (error) {
    log.error({ err: error }, "verifyEmailCode failed");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint 3: Create account after email verification
// POST /api/consumer/auth/email/signup
// ─────────────────────────────────────────────────────────────────────────────

export async function signupWithEmail(req: Request, res: Response) {
  try {
    const { email, password, referralCode } = req.body;

    if (!email || typeof email !== "string" || !/.+@.+\..+/.test(email.trim())) {
      return res.status(400).json({ error: "Email invalide" });
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Mot de passe requis (8 caractères minimum)" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check that this email was recently verified (DB-based)
    const verified = await isEmailRecentlyVerified(normalizedEmail);
    if (!verified) {
      return res.status(403).json({ error: "Email non vérifié. Veuillez d'abord vérifier votre email." });
    }

    // Consume the verification (one-time use)
    await consumeEmailVerification(normalizedEmail);

    const supabase = getAdminSupabase();

    // Check if user already exists
    const { data: authUsersList } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });

    const existingUser = authUsersList?.users?.find(
      (u: any) => u.email === normalizedEmail
    );

    if (existingUser) {
      return res.status(409).json({ error: "Un compte existe déjà avec cet email. Veuillez vous connecter." });
    }

    // Create user via admin API (bypasses Supabase confirmation email)
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: {
          auth_method: "email",
          email_verified: true,
          email_verified_at: new Date().toISOString(),
        },
      });

    if (authError) {
      log.error({ err: authError }, "error creating auth user");

      // Handle weak password error from Supabase
      if (authError.message?.includes("weak") || authError.message?.includes("password")) {
        return res.status(422).json({ error: "Mot de passe trop faible. Choisissez un mot de passe plus complexe." });
      }

      return res.status(500).json({ error: "Échec de la création du compte" });
    }

    const userId = authData.user.id;
    log.info({ userId }, "auth user created");

    // Create consumer_users profile
    const { error: profileError } = await supabase
      .from("consumer_users")
      .insert({
        id: userId,
        email: normalizedEmail,
        full_name: "",
        status: "active",
        city: "",
        country: "MA",
      });

    if (profileError) {
      log.error({ err: profileError, userId }, "error creating consumer profile");
    }

    // Create consumer_user_stats with DB defaults (reliability_score=80, counts=0)
    const { error: statsError } = await supabase
      .from("consumer_user_stats")
      .insert({ user_id: userId });

    if (statsError) {
      log.error({ err: statsError, userId }, "error creating consumer_user_stats");
    }

    // Handle referral code if provided
    if (referralCode && typeof referralCode === "string") {
      try {
        const { data: validation } = await supabase.rpc("validate_referral_code", {
          p_code: referralCode.trim(),
        });

        const validResult = Array.isArray(validation) ? validation[0] : validation;

        if (validResult?.is_valid && validResult.partner_id) {
          const { error: linkError } = await supabase
            .from("referral_links")
            .insert({
              partner_id: validResult.partner_id,
              referree_user_id: userId,
              referral_code_used: referralCode.trim().toUpperCase(),
              source: "registration",
            });

          if (linkError) {
            log.warn({ err: linkError, userId }, "failed to create referral link");
          } else {
            log.info({ userId }, "referral link created");
          }
        }
      } catch (refError) {
        log.error({ err: refError, userId }, "error processing referral");
      }
    }

    // Generate a session for the user
    const { data: sessionData, error: sessionError } =
      await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: {
          redirectTo: getPublicBaseUrl(),
        },
      });

    if (sessionError) {
      log.error({ err: sessionError, userId }, "error generating session");
      return res.status(500).json({ error: "Échec de la création de la session" });
    }

    // Log successful registration
    try {
      await supabase.from("system_logs").insert({
        actor_user_id: userId,
        actor_role: "consumer",
        action: "auth.email_signup",
        entity_type: "consumer_user",
        entity_id: userId,
        payload: {
          method: "email",
          is_new_user: true,
        },
      });
    } catch (err) {
      log.warn({ err }, "Best-effort: auth audit log failed");
    }

    log.info({ userId }, "account created successfully");

    // Issue trusted device cookie for new email user (best-effort, non-blocking)
    await issueTrustedDevice(req, res, userId);

    return res.json({
      success: true,
      isNewUser: true,
      userId,
      actionLink: sessionData?.properties?.action_link,
    });
  } catch (error) {
    log.error({ err: error }, "signupWithEmail unexpected error");
    return res.status(500).json({ error: "Erreur lors de la création du compte" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint 4: Set real email + password for phone-registered users
// POST /api/consumer/account/set-email-password
// ─────────────────────────────────────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

export async function setPhoneUserEmailPassword(req: Request, res: Response) {
  try {
    // 1. Extract userId from Bearer token
    const auth = String(req.headers.authorization ?? "");
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";

    if (!token) {
      return res.status(401).json({ error: "Token manquant" });
    }

    const supabase = getAdminSupabase();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData?.user) {
      return res.status(401).json({ error: "Non authentifié" });
    }

    const userId = userData.user.id;
    const currentEmail = userData.user.email ?? "";
    const meta = asRecord(userData.user.user_metadata) ?? {};

    // 2. Validate request body
    const { email, password } = req.body;

    if (!email || typeof email !== "string" || !/.+@.+\..+/.test(email.trim())) {
      return res.status(400).json({ error: "Email invalide" });
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Mot de passe requis (8 caractères minimum)" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 3. Reject synthetic emails
    if (normalizedEmail.endsWith("@phone.sortiraumaroc.ma")) {
      return res.status(400).json({ error: "Veuillez utiliser une adresse email réelle" });
    }

    // 4. Check that the user is a phone-registered user (has synthetic email)
    if (!currentEmail.endsWith("@phone.sortiraumaroc.ma")) {
      return res.status(400).json({
        error: "Votre compte a déjà un email enregistré",
        code: "ALREADY_HAS_EMAIL",
      });
    }

    // 5. Check that the email was recently verified via 6-digit code (DB-based)
    const verified = await isEmailRecentlyVerified(normalizedEmail);
    if (!verified) {
      return res.status(403).json({
        error: "Email non vérifié ou vérification expirée. Veuillez re-vérifier votre email.",
        code: "EMAIL_NOT_VERIFIED",
      });
    }

    // 6. Consume the verification (one-time use)
    await consumeEmailVerification(normalizedEmail);

    // 7. Re-check that the email is not taken by another account
    const { data: authUsersList } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });

    const existingUser = authUsersList?.users?.find(
      (u: any) => u.email === normalizedEmail && u.id !== userId
    );

    if (existingUser) {
      return res.status(409).json({
        error: "Cet email est déjà associé à un autre compte",
        code: "EMAIL_ALREADY_EXISTS",
      });
    }

    // 8. Update Supabase auth user: email + password + metadata
    const { error: updateErr } = await supabase.auth.admin.updateUserById(userId, {
      email: normalizedEmail,
      email_confirm: true,
      password,
      user_metadata: {
        ...meta,
        email_verified: true,
        email_verified_at: new Date().toISOString(),
        real_email: normalizedEmail,
      },
    });

    if (updateErr) {
      log.error({ err: updateErr, userId }, "error updating auth user email/password");

      // Handle weak password error from Supabase
      if (updateErr.message?.includes("weak") || updateErr.message?.includes("password")) {
        return res.status(422).json({ error: "Mot de passe trop faible. Choisissez un mot de passe plus complexe." });
      }

      return res.status(500).json({ error: "Échec de la mise à jour du compte" });
    }

    // 9. Update consumer_users table email
    const { error: profileErr } = await supabase
      .from("consumer_users")
      .update({ email: normalizedEmail })
      .eq("id", userId);

    if (profileErr) {
      log.error({ err: profileErr, userId }, "error updating consumer_users email");
      // Non-blocking — auth user is already updated
    }

    // 10. Log the action
    try {
      await supabase.from("system_logs").insert({
        actor_user_id: userId,
        actor_role: "consumer",
        action: "auth.set_email_password",
        entity_type: "consumer_user",
        entity_id: userId,
        payload: {
          new_email: normalizedEmail,
          previous_email: currentEmail,
        },
      });
    } catch (err) {
      log.warn({ err }, "Best-effort: auth audit log failed");
    }

    log.info({ userId, previousEmail: currentEmail, newEmail: normalizedEmail }, "email updated for user");

    return res.json({ ok: true });
  } catch (error) {
    log.error({ err: error }, "setPhoneUserEmailPassword unexpected error");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerEmailVerificationRoutes(app: Express) {
  app.post("/api/consumer/verify-email/send", zBody(emailSendCodeSchema), sendEmailVerificationCode);
  app.post("/api/consumer/verify-email/verify", zBody(emailVerifyCodeSchema), verifyEmailCode);
  app.post("/api/consumer/auth/email/signup", zBody(emailSignupSchema), signupWithEmail);
  app.post("/api/consumer/account/set-email-password", zBody(setEmailPasswordSchema), setPhoneUserEmailPassword);
}
