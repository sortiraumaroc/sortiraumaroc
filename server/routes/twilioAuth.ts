/**
 * Twilio Phone Authentication Routes
 *
 * Handles phone authentication via Twilio SMS API (direct SMS, not Verify).
 * Uses direct SMS because Twilio Verify blocks +212 (Morocco) prefix.
 *
 * Flow:
 * 1. Client sends phone number → Server generates OTP, sends via Twilio SMS
 * 2. Client sends code → Server verifies OTP locally
 * 3. If valid → Server creates/finds Supabase user and returns session
 */

import type { Request, Response } from "express";
import type { Express } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import crypto from "crypto";
import Twilio from "twilio";
import { isTrustedDevice, issueTrustedDevice, revokeAllTrustedDevices } from "../trustedDeviceLogic";
import { createModuleLogger } from "../lib/logger";
import { authRateLimiter } from "../middleware/rateLimiter";
import { zBody } from "../lib/validate";
import {
  sendCodeSchema,
  verifyCodeSchema,
  verifyLoginSchema,
  lookupSchema,
  loginPasswordSchema,
  trustedLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../schemas/twilioAuth";

const log = createModuleLogger("twilioAuth");

// Twilio configuration
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || "+14136661650";

// Lazy-initialize Twilio client
let twilioClient: ReturnType<typeof Twilio> | null = null;

function getTwilioClient() {
  if (!twilioClient && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    twilioClient = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

/**
 * Check if Twilio is configured
 */
export function isTwilioConfigured(): boolean {
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN);
}

// ─────────────────────────────────────────────────────────────────────────────
// OTP store (in-memory — use Redis in production)
// ─────────────────────────────────────────────────────────────────────────────

interface OtpRecord {
  code: string;
  expiresAt: number;
  attempts: number;
}

const otpStore = new Map<string, OtpRecord>();
const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_OTP_VERIFY_ATTEMPTS = 5;

function generateOtp(): string {
  // Generate a cryptographically secure 6-digit code
  const buffer = crypto.randomBytes(4);
  const num = buffer.readUInt32BE(0) % 1000000;
  return num.toString().padStart(6, "0");
}

function cleanExpiredOtps() {
  const now = Date.now();
  for (const [key, record] of otpStore.entries()) {
    if (record.expiresAt < now) {
      otpStore.delete(key);
    }
  }
}

// Clean expired OTPs every 5 minutes
setInterval(cleanExpiredOtps, 5 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Find auth user by phone or synthetic email (paginated, exhaustive)
// ─────────────────────────────────────────────────────────────────────────────

interface AuthUser { id: string; email?: string; phone?: string; user_metadata?: Record<string, unknown> }

/**
 * Search auth.users by phone number or synthetic email.
 * Paginates through ALL users (1000 per page, up to 50 pages = 50k users)
 * instead of only checking the first 200.
 */
async function findAuthUserByPhone(
  supabase: ReturnType<typeof getAdminSupabase>,
  cleanPhone: string,
  phoneEmail: string,
): Promise<AuthUser | null> {
  const MAX_PAGES = 50;
  const PER_PAGE = 1000;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: PER_PAGE,
    });

    if (error || !data?.users?.length) break;

    const users = data.users as unknown as AuthUser[];
    const match = users.find(
      (u) => u.phone === cleanPhone || u.email === phoneEmail,
    );
    if (match) return match;

    // If we got fewer than PER_PAGE, we've reached the last page
    if (data.users.length < PER_PAGE) break;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting (in production, use Redis)
// ─────────────────────────────────────────────────────────────────────────────

const sendCodeAttempts = new Map<string, { count: number; lastAttempt: number }>();
const SEND_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_SEND_ATTEMPTS = 3; // Max 3 SMS per minute

function checkRateLimit(
  store: Map<string, { count: number; lastAttempt: number }>,
  identifier: string,
  windowMs: number,
  maxAttempts: number
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = store.get(identifier);

  if (!record) {
    store.set(identifier, { count: 1, lastAttempt: now });
    return { allowed: true };
  }

  if (now - record.lastAttempt > windowMs) {
    store.set(identifier, { count: 1, lastAttempt: now });
    return { allowed: true };
  }

  if (record.count >= maxAttempts) {
    const retryAfter = Math.ceil((windowMs - (now - record.lastAttempt)) / 1000);
    return { allowed: false, retryAfter };
  }

  record.count++;
  record.lastAttempt = now;
  return { allowed: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint 1: Send verification code via direct SMS
// POST /api/consumer/auth/phone/send-code
// ─────────────────────────────────────────────────────────────────────────────

export async function sendPhoneCode(req: Request, res: Response): Promise<void> {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber || typeof phoneNumber !== "string") {
      res.status(400).json({ error: "Numéro de téléphone requis" });
      return;
    }

    // Validate E.164 format
    const cleanPhone = phoneNumber.replace(/\s/g, "");
    if (!/^\+\d{10,15}$/.test(cleanPhone)) {
      res.status(400).json({ error: "Format de numéro invalide. Utilisez le format international (+212...)" });
      return;
    }

    if (!isTwilioConfigured()) {
      res.status(503).json({ error: "Le service de vérification par SMS n'est pas configuré" });
      return;
    }

    // Rate limiting
    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    const rateLimitKey = `${clientIp}:${cleanPhone}`;

    const rateCheck = checkRateLimit(
      sendCodeAttempts,
      rateLimitKey,
      SEND_RATE_LIMIT_WINDOW_MS,
      MAX_SEND_ATTEMPTS
    );

    if (!rateCheck.allowed) {
      res.status(429).json({
        error: "Trop de tentatives. Réessayez plus tard.",
        retryAfter: rateCheck.retryAfter,
      });
      return;
    }

    const client = getTwilioClient();
    if (!client) {
      res.status(503).json({ error: "Service SMS indisponible" });
      return;
    }

    // Generate OTP and store it
    const otpCode = generateOtp();
    otpStore.set(cleanPhone, {
      code: otpCode,
      expiresAt: Date.now() + OTP_EXPIRY_MS,
      attempts: 0,
    });

    log.info({ phone: cleanPhone }, "sending OTP via SMS");

    // Send SMS via Twilio Messages API (not Verify)
    const message = await client.messages.create({
      to: cleanPhone,
      from: TWILIO_PHONE_NUMBER,
      body: `Sortir Au Maroc : votre code de vérification est ${otpCode}. Il expire dans 5 minutes.`,
    });

    log.info({ sid: message.sid, status: message.status }, "SMS sent");

    res.json({
      success: true,
      status: "pending",
      message: "Code de vérification envoyé par SMS",
    });
  } catch (error: unknown) {
    log.error({ err: error }, "error sending SMS");

    const twilioError = error as { code?: number; message?: string; status?: number };

    if (twilioError.code === 21211) {
      res.status(400).json({ error: "Numéro de téléphone invalide" });
    } else if (twilioError.code === 21608 || twilioError.code === 21610) {
      res.status(400).json({ error: "Impossible d'envoyer un SMS à ce numéro" });
    } else {
      res.status(500).json({ error: "Échec de l'envoi du code SMS" });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint 2: Verify code and create/login user
// POST /api/consumer/auth/phone/verify-code
// ─────────────────────────────────────────────────────────────────────────────

export async function verifyPhoneCode(req: Request, res: Response): Promise<void> {
  try {
    const { phoneNumber, code, referralCode } = req.body;

    if (!phoneNumber || typeof phoneNumber !== "string") {
      res.status(400).json({ error: "Numéro de téléphone requis" });
      return;
    }

    if (!code || typeof code !== "string" || code.length < 4 || code.length > 8) {
      res.status(400).json({ error: "Code de vérification invalide" });
      return;
    }

    const cleanPhone = phoneNumber.replace(/\s/g, "");
    if (!/^\+\d{10,15}$/.test(cleanPhone)) {
      res.status(400).json({ error: "Format de numéro invalide" });
      return;
    }

    // Verify OTP locally
    const otpRecord = otpStore.get(cleanPhone);

    if (!otpRecord) {
      res.status(401).json({ error: "Aucun code envoyé pour ce numéro. Demandez un nouveau code." });
      return;
    }

    if (Date.now() > otpRecord.expiresAt) {
      otpStore.delete(cleanPhone);
      res.status(401).json({ error: "Code expiré. Demandez un nouveau code." });
      return;
    }

    if (otpRecord.attempts >= MAX_OTP_VERIFY_ATTEMPTS) {
      otpStore.delete(cleanPhone);
      res.status(429).json({ error: "Trop de tentatives. Demandez un nouveau code." });
      return;
    }

    otpRecord.attempts++;

    if (otpRecord.code !== code.trim()) {
      res.status(401).json({ error: "Code invalide" });
      return;
    }

    // Code is valid — delete it so it can't be reused
    otpStore.delete(cleanPhone);

    log.info({ phone: cleanPhone }, "OTP verified");

    // ─── Phone verified! Now create or find the Supabase user ───
    //
    // Schema: consumer_users table has columns:
    //   id (UUID = auth.users.id), email, full_name, status, city, country, etc.
    //   NO auth_user_id column, NO phone column — phone is stored in auth.users.phone
    //

    const supabase = getAdminSupabase();
    const verifiedPhoneNumber = cleanPhone;

    // Generate a synthetic email from phone number for Supabase auth
    const phoneEmail = `${verifiedPhoneNumber.replace(/\+/g, "")}@phone.sortiraumaroc.ma`;

    let userId: string;
    let isNewUser = false;

    // Step 1: Check if a user with this phone already exists in auth.users
    const existingAuthUser = await findAuthUserByPhone(supabase, verifiedPhoneNumber, phoneEmail);

    if (existingAuthUser) {
      // User already exists — refuse signup, they should login instead
      log.info({ phone: cleanPhone, userId: existingAuthUser.id }, "phone already registered");
      res.status(409).json({
        error: "Un compte existe déjà avec ce numéro de téléphone",
        code: "PHONE_ALREADY_EXISTS",
      });
      return;
    } else {
      // New user — create in Supabase Auth
      // bcrypt has a 72-byte limit — keep password ≤ 64 hex chars
      const randomPassword = crypto.randomBytes(32).toString("hex");

      const { data: authData, error: authError } =
        await supabase.auth.admin.createUser({
          email: phoneEmail,
          password: randomPassword,
          email_confirm: true,
          phone: verifiedPhoneNumber,
          phone_confirm: true,
          user_metadata: {
            auth_method: "phone",
            phone_verified: true,
            phone_verified_at: new Date().toISOString(),
            verification_provider: "twilio",
          },
        });

      if (authError) {
        log.error({ err: authError }, "error creating auth user");
        res.status(500).json({ error: "Échec de la création du compte" });
        return;
      }

      userId = authData.user.id;
      isNewUser = true;

      // Create consumer_users profile
      const { data: consumerUser, error: profileError } = await supabase
        .from("consumer_users")
        .insert({
          id: userId,
          email: phoneEmail,
          full_name: "",
          status: "active",
          city: "",
          country: "MA",
        })
        .select("id")
        .single();

      if (profileError) {
        log.error({ err: profileError }, "error creating consumer profile");
      }

      log.info({ userId }, "new user created");

      // Handle referral code if provided (only for new users)
      if (referralCode && typeof referralCode === "string" && consumerUser?.id) {
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
                referree_user_id: consumerUser.id,
                referral_code_used: referralCode.trim().toUpperCase(),
                source: "registration",
              });

            if (linkError) {
              log.warn({ err: linkError }, "failed to create referral link");
            } else {
              log.info({ userId: consumerUser.id }, "referral link created");
            }
          }
        } catch (refError) {
          log.error({ err: refError }, "error processing referral");
        }
      }
    }

    // Generate a session for the user
    const { data: sessionData, error: sessionError } =
      await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: phoneEmail,
        options: {
          redirectTo: process.env.PUBLIC_BASE_URL || process.env.VITE_APP_URL || "https://sam.ma",
        },
      });

    if (sessionError) {
      log.error({ err: sessionError }, "error generating session");
      res.status(500).json({ error: "Échec de la création de la session" });
      return;
    }

    // Log successful authentication (ignore errors)
    try {
      await supabase
        .from("system_logs")
        .insert({
          actor_user_id: userId,
          actor_role: "consumer",
          action: "auth.phone_login",
          entity_type: "consumer_user",
          entity_id: userId,
          payload: {
            method: "twilio_phone",
            is_new_user: isNewUser,
          },
        });
    } catch (err) {
      log.warn({ err }, "Best-effort: auth audit log failed");
    }

    // Issue trusted device cookie for new user (best-effort, non-blocking)
    await issueTrustedDevice(req, res, userId);

    res.json({
      success: true,
      isNewUser,
      userId,
      actionLink: sessionData?.properties?.action_link,
    });
  } catch (error: unknown) {
    log.error({ err: error }, "unexpected error in verifyPhoneCode");
    res.status(500).json({ error: "Erreur de vérification" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint 3: Verify code and login existing user
// POST /api/consumer/auth/phone/verify-login
// ─────────────────────────────────────────────────────────────────────────────

export async function verifyPhoneLogin(req: Request, res: Response): Promise<void> {
  try {
    const { phoneNumber, code } = req.body;

    if (!phoneNumber || typeof phoneNumber !== "string") {
      res.status(400).json({ error: "Numéro de téléphone requis" });
      return;
    }

    if (!code || typeof code !== "string" || code.length < 4 || code.length > 8) {
      res.status(400).json({ error: "Code de vérification invalide" });
      return;
    }

    const cleanPhone = phoneNumber.replace(/\s/g, "");
    if (!/^\+\d{10,15}$/.test(cleanPhone)) {
      res.status(400).json({ error: "Format de numéro invalide" });
      return;
    }

    // Verify OTP locally
    const otpRecord = otpStore.get(cleanPhone);

    if (!otpRecord) {
      res.status(401).json({ error: "Aucun code envoyé pour ce numéro. Demandez un nouveau code." });
      return;
    }

    if (Date.now() > otpRecord.expiresAt) {
      otpStore.delete(cleanPhone);
      res.status(401).json({ error: "Code expiré. Demandez un nouveau code." });
      return;
    }

    if (otpRecord.attempts >= MAX_OTP_VERIFY_ATTEMPTS) {
      otpStore.delete(cleanPhone);
      res.status(429).json({ error: "Trop de tentatives. Demandez un nouveau code." });
      return;
    }

    otpRecord.attempts++;

    if (otpRecord.code !== code.trim()) {
      res.status(401).json({ error: "Code invalide" });
      return;
    }

    // Code is valid — delete it
    otpStore.delete(cleanPhone);

    log.info({ phone: cleanPhone }, "login OTP verified");

    const supabase = getAdminSupabase();
    const phoneEmail = `${cleanPhone.replace(/\+/g, "")}@phone.sortiraumaroc.ma`;

    // Find the existing user
    const existingUser = await findAuthUserByPhone(supabase, cleanPhone, phoneEmail);

    if (!existingUser) {
      res.status(404).json({ error: "Aucun compte trouvé avec ce numéro" });
      return;
    }

    // Generate session magic link
    const userEmail = existingUser.email || phoneEmail;
    const { data: sessionData, error: sessionError } =
      await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: userEmail,
        options: {
          redirectTo: process.env.PUBLIC_BASE_URL || process.env.VITE_APP_URL || "https://sam.ma",
        },
      });

    if (sessionError) {
      log.error({ err: sessionError }, "error generating login session");
      res.status(500).json({ error: "Échec de la création de la session" });
      return;
    }

    // Log authentication
    try {
      await supabase
        .from("system_logs")
        .insert({
          actor_user_id: existingUser.id,
          actor_role: "consumer",
          action: "auth.phone_login",
          entity_type: "consumer_user",
          entity_id: existingUser.id,
          payload: {
            method: "twilio_phone_login",
            is_new_user: false,
          },
        });
    } catch (err) {
      log.warn({ err }, "Best-effort: auth audit log failed");
    }

    // Issue trusted device cookie (best-effort, non-blocking)
    await issueTrustedDevice(req, res, existingUser.id);

    res.json({
      success: true,
      isNewUser: false,
      userId: existingUser.id,
      actionLink: sessionData?.properties?.action_link,
    });
  } catch (error: unknown) {
    log.error({ err: error }, "phone login verify error");
    res.status(500).json({ error: "Erreur de vérification" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint 4: Lookup phone number (silent check for login)
// POST /api/consumer/auth/phone/lookup
// ─────────────────────────────────────────────────────────────────────────────

export async function lookupPhone(req: Request, res: Response): Promise<void> {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber || typeof phoneNumber !== "string") {
      res.status(400).json({ exists: false });
      return;
    }

    const cleanPhone = phoneNumber.replace(/\s/g, "");
    if (!/^\+\d{10,15}$/.test(cleanPhone)) {
      res.status(400).json({ exists: false });
      return;
    }

    const supabase = getAdminSupabase();
    const phoneEmail = `${cleanPhone.replace(/\+/g, "")}@phone.sortiraumaroc.ma`;

    // Check auth.users for this phone or synthetic email (paginated, exhaustive)
    const existingUser = await findAuthUserByPhone(supabase, cleanPhone, phoneEmail);

    if (existingUser) {
      // Check if user has completed onboarding (set a real email + password)
      // Phone users start with synthetic email (xxx@phone.sortiraumaroc.ma)
      // After onboarding step 3, their email is replaced with a real one
      const hasPassword = Boolean(
        existingUser.email && !existingUser.email.endsWith("@phone.sortiraumaroc.ma")
      );
      res.json({ exists: true, email: phoneEmail, hasPassword });
    } else {
      res.json({ exists: false });
    }
  } catch (error) {
    log.error({ err: error }, "phone lookup error");
    res.json({ exists: false });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint 4: Check Twilio auth availability
// GET /api/consumer/auth/phone/status
// ─────────────────────────────────────────────────────────────────────────────

export async function checkPhoneAuthStatus(
  _req: Request,
  res: Response
): Promise<void> {
  res.json({
    available: isTwilioConfigured(),
    provider: isTwilioConfigured() ? "twilio" : "none",
    methods: isTwilioConfigured() ? ["sms"] : [],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint 6: Login with phone + password
// POST /api/consumer/auth/phone/login-password
// ─────────────────────────────────────────────────────────────────────────────

export async function loginPhonePassword(req: Request, res: Response): Promise<void> {
  try {
    const { phoneNumber, password } = req.body;

    if (!phoneNumber || typeof phoneNumber !== "string") {
      res.status(400).json({ error: "Numéro de téléphone requis" });
      return;
    }

    if (!password || typeof password !== "string") {
      res.status(400).json({ error: "Mot de passe requis" });
      return;
    }

    const cleanPhone = phoneNumber.replace(/\s/g, "");
    if (!/^\+\d{10,15}$/.test(cleanPhone)) {
      res.status(400).json({ error: "Format de numéro invalide" });
      return;
    }

    const supabase = getAdminSupabase();

    // Find user by phone or synthetic email
    const phoneEmail = `${cleanPhone.replace(/\+/g, "")}@phone.sortiraumaroc.ma`;
    const existingUser = await findAuthUserByPhone(supabase, cleanPhone, phoneEmail);

    if (!existingUser) {
      res.status(404).json({ error: "Aucun compte trouvé avec ce numéro" });
      return;
    }

    // Get the actual email to use for sign-in (could be real email after onboarding)
    const signInEmail = existingUser.email || phoneEmail;

    // Attempt password-based sign-in via Supabase
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: signInEmail,
      password,
    });

    if (signInErr) {
      log.info({ phone: cleanPhone, errorMessage: signInErr.message }, "password login failed");
      res.status(401).json({ error: "Mot de passe incorrect" });
      return;
    }

    // Password correct — generate magic link for session
    const { data: sessionData, error: sessionError } =
      await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: signInEmail,
        options: {
          redirectTo: process.env.PUBLIC_BASE_URL || process.env.VITE_APP_URL || "https://sam.ma",
        },
      });

    if (sessionError) {
      log.error({ err: sessionError }, "error generating login session");
      res.status(500).json({ error: "Échec de la création de la session" });
      return;
    }

    // Log authentication
    try {
      await supabase
        .from("system_logs")
        .insert({
          actor_user_id: existingUser.id,
          actor_role: "consumer",
          action: "auth.phone_password_login",
          entity_type: "consumer_user",
          entity_id: existingUser.id,
          payload: {
            method: "phone_password",
            is_new_user: false,
          },
        });
    } catch (err) {
      log.warn({ err }, "Best-effort: auth audit log failed");
    }

    // Issue trusted device cookie (best-effort, non-blocking)
    await issueTrustedDevice(req, res, existingUser.id);

    res.json({
      success: true,
      isNewUser: false,
      userId: existingUser.id,
      actionLink: sessionData?.properties?.action_link,
    });
  } catch (error: unknown) {
    log.error({ err: error }, "phone password login error");
    res.status(500).json({ error: "Erreur de connexion" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint: Trusted device login (skip OTP if device is recognized)
// POST /api/consumer/auth/phone/trusted-login
// ─────────────────────────────────────────────────────────────────────────────

export async function trustedDeviceLogin(req: Request, res: Response): Promise<void> {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber || typeof phoneNumber !== "string") {
      res.status(400).json({ trusted: false, error: "Numéro de téléphone requis" });
      return;
    }

    const cleanPhone = phoneNumber.replace(/\s/g, "");
    if (!/^\+\d{10,15}$/.test(cleanPhone)) {
      res.status(400).json({ trusted: false, error: "Format de numéro invalide" });
      return;
    }

    const supabase = getAdminSupabase();
    const phoneEmail = `${cleanPhone.replace(/\+/g, "")}@phone.sortiraumaroc.ma`;

    // Step 1: Find the user
    const existingUser = await findAuthUserByPhone(supabase, cleanPhone, phoneEmail);
    if (!existingUser) {
      // Don't reveal if phone exists — just say not trusted
      res.json({ trusted: false });
      return;
    }

    // Step 2: Check if current device is trusted for this user
    const trusted = await isTrustedDevice(req, existingUser.id);
    if (!trusted) {
      res.json({ trusted: false });
      return;
    }

    // Step 3: Device is trusted — generate session directly (no OTP needed)
    log.info({ phone: cleanPhone }, "trusted device login");

    const userEmail = existingUser.email || phoneEmail;
    const { data: sessionData, error: sessionError } =
      await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: userEmail,
        options: {
          redirectTo: process.env.PUBLIC_BASE_URL || process.env.VITE_APP_URL || "https://sam.ma",
        },
      });

    if (sessionError) {
      log.error({ err: sessionError }, "error generating trusted device session");
      res.status(500).json({ trusted: false, error: "Échec de la création de la session" });
      return;
    }

    // Log authentication
    try {
      await supabase
        .from("system_logs")
        .insert({
          actor_user_id: existingUser.id,
          actor_role: "consumer",
          action: "auth.trusted_device_login",
          entity_type: "consumer_user",
          entity_id: existingUser.id,
          payload: {
            method: "trusted_device",
            is_new_user: false,
          },
        });
    } catch (err) {
      log.warn({ err }, "Best-effort: auth audit log failed");
    }

    // Refresh the trust token (extend expiry)
    await issueTrustedDevice(req, res, existingUser.id);

    res.json({
      trusted: true,
      success: true,
      isNewUser: false,
      userId: existingUser.id,
      actionLink: sessionData?.properties?.action_link,
    });
  } catch (error: unknown) {
    log.error({ err: error }, "trusted device login error");
    res.json({ trusted: false });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Password reset via SMS/WhatsApp
// ─────────────────────────────────────────────────────────────────────────────

interface ResetCodeRecord {
  code: string;
  expiresAt: number;
  attempts: number;
  userId: string;
}

const resetCodeStore = new Map<string, ResetCodeRecord>();
const RESET_CODE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RESET_VERIFY_ATTEMPTS = 5;

// Rate limiting for forgot-password
const forgotPasswordAttempts = new Map<string, { count: number; lastAttempt: number }>();
const FORGOT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_FORGOT_ATTEMPTS = 3; // Max 3 per hour

// Clean expired reset codes every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of resetCodeStore.entries()) {
    if (record.expiresAt < now) {
      resetCodeStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// WhatsApp sender (Twilio WhatsApp sandbox or dedicated number)
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886";

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint 7: Request password reset via SMS or WhatsApp
// POST /api/consumer/auth/phone/forgot-password
// ─────────────────────────────────────────────────────────────────────────────

export async function forgotPhonePassword(req: Request, res: Response): Promise<void> {
  try {
    const { phoneNumber, method } = req.body;

    if (!phoneNumber || typeof phoneNumber !== "string") {
      res.status(400).json({ error: "Numéro de téléphone requis" });
      return;
    }

    const channel: "sms" | "whatsapp" = method === "whatsapp" ? "whatsapp" : "sms";

    const cleanPhone = phoneNumber.replace(/\s/g, "");
    if (!/^\+\d{10,15}$/.test(cleanPhone)) {
      res.status(400).json({ error: "Format de numéro invalide" });
      return;
    }

    // Rate limit
    const rateKey = `forgot:${cleanPhone}`;
    const rateCheck = checkRateLimit(
      forgotPasswordAttempts,
      rateKey,
      FORGOT_RATE_LIMIT_WINDOW_MS,
      MAX_FORGOT_ATTEMPTS
    );
    if (!rateCheck.allowed) {
      res.status(429).json({
        error: "Trop de tentatives. Réessayez plus tard.",
        retryAfter: rateCheck.retryAfter,
      });
      return;
    }

    // Find user
    const supabase = getAdminSupabase();
    const phoneEmail = `${cleanPhone.replace(/\+/g, "")}@phone.sortiraumaroc.ma`;
    const existingUser = await findAuthUserByPhone(supabase, cleanPhone, phoneEmail);

    if (!existingUser) {
      // Don't reveal if phone exists — return success anyway
      res.json({ success: true });
      return;
    }

    // Generate 6-digit reset code
    const code = generateOtp();
    resetCodeStore.set(cleanPhone, {
      code,
      expiresAt: Date.now() + RESET_CODE_EXPIRY_MS,
      attempts: 0,
      userId: existingUser.id,
    });

    // Send code via chosen channel
    const client = getTwilioClient();
    if (!client) {
      log.error("Twilio not configured for password reset");
      res.status(500).json({ error: "Service SMS indisponible" });
      return;
    }

    const messageBody = `Sortir Au Maroc : votre code de réinitialisation est ${code}. Il expire dans 5 minutes.`;

    if (channel === "whatsapp") {
      await client.messages.create({
        body: messageBody,
        from: TWILIO_WHATSAPP_NUMBER,
        to: `whatsapp:${cleanPhone}`,
      });
    } else {
      await client.messages.create({
        body: messageBody,
        from: TWILIO_PHONE_NUMBER,
        to: cleanPhone,
      });
    }

    log.info({ channel, phone: cleanPhone }, "password reset code sent");

    res.json({ success: true });
  } catch (error: unknown) {
    log.error({ err: error }, "forgot password error");
    res.status(500).json({ error: "Erreur lors de l'envoi du code" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint 8: Reset password with code
// POST /api/consumer/auth/phone/reset-password
// ─────────────────────────────────────────────────────────────────────────────

export async function resetPhonePassword(req: Request, res: Response): Promise<void> {
  try {
    const { phoneNumber, code, newPassword } = req.body;

    if (!phoneNumber || typeof phoneNumber !== "string") {
      res.status(400).json({ error: "Numéro de téléphone requis" });
      return;
    }

    if (!code || typeof code !== "string" || code.length < 4 || code.length > 8) {
      res.status(400).json({ error: "Code de vérification invalide" });
      return;
    }

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères" });
      return;
    }

    const cleanPhone = phoneNumber.replace(/\s/g, "");
    if (!/^\+\d{10,15}$/.test(cleanPhone)) {
      res.status(400).json({ error: "Format de numéro invalide" });
      return;
    }

    // Verify reset code
    const resetRecord = resetCodeStore.get(cleanPhone);

    if (!resetRecord) {
      res.status(401).json({ error: "Aucun code envoyé pour ce numéro. Demandez un nouveau code." });
      return;
    }

    if (Date.now() > resetRecord.expiresAt) {
      resetCodeStore.delete(cleanPhone);
      res.status(401).json({ error: "Code expiré. Demandez un nouveau code." });
      return;
    }

    if (resetRecord.attempts >= MAX_RESET_VERIFY_ATTEMPTS) {
      resetCodeStore.delete(cleanPhone);
      res.status(429).json({ error: "Trop de tentatives. Demandez un nouveau code." });
      return;
    }

    resetRecord.attempts++;

    if (resetRecord.code !== code.trim()) {
      res.status(401).json({ error: "Code invalide" });
      return;
    }

    // Code valid — update password
    resetCodeStore.delete(cleanPhone);

    const supabase = getAdminSupabase();
    const { error: updateErr } = await supabase.auth.admin.updateUserById(
      resetRecord.userId,
      { password: newPassword }
    );

    if (updateErr) {
      log.error({ err: updateErr }, "password update error");
      res.status(500).json({ error: "Erreur lors de la mise à jour du mot de passe" });
      return;
    }

    // Revoke all trusted devices on password reset (security measure)
    try {
      const revokedCount = await revokeAllTrustedDevices(resetRecord.userId);
      if (revokedCount > 0) {
        log.info({ revokedCount, phone: cleanPhone }, "revoked trusted devices after password reset");
      }
    } catch (err) {
      log.warn({ err }, "Best-effort: revoke trusted devices after password reset failed");
    }

    // Log event
    try {
      await supabase
        .from("system_logs")
        .insert({
          actor_user_id: resetRecord.userId,
          actor_role: "consumer",
          action: "auth.phone_password_reset",
          entity_type: "consumer_user",
          entity_id: resetRecord.userId,
          payload: {
            method: "phone_reset_code",
          },
        });
    } catch (err) {
      log.warn({ err }, "Best-effort: auth audit log failed");
    }

    log.info({ phone: cleanPhone }, "password reset successfully");

    res.json({ success: true });
  } catch (error: unknown) {
    log.error({ err: error }, "reset password error");
    res.status(500).json({ error: "Erreur lors de la réinitialisation" });
  }
}

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerTwilioAuthRoutes(app: Express) {
  app.post("/api/consumer/auth/phone/send-code", authRateLimiter, zBody(sendCodeSchema), sendPhoneCode);
  app.post("/api/consumer/auth/phone/verify-code", authRateLimiter, zBody(verifyCodeSchema), verifyPhoneCode);
  app.post("/api/consumer/auth/phone/verify-login", authRateLimiter, zBody(verifyLoginSchema), verifyPhoneLogin);
  app.post("/api/consumer/auth/phone/lookup", authRateLimiter, zBody(lookupSchema), lookupPhone);
  app.post("/api/consumer/auth/phone/login-password", authRateLimiter, zBody(loginPasswordSchema), loginPhonePassword);
  app.post("/api/consumer/auth/phone/trusted-login", authRateLimiter, zBody(trustedLoginSchema), trustedDeviceLogin);
  app.post("/api/consumer/auth/phone/forgot-password", authRateLimiter, zBody(forgotPasswordSchema), forgotPhonePassword);
  app.post("/api/consumer/auth/phone/reset-password", authRateLimiter, zBody(resetPasswordSchema), resetPhonePassword);
  app.get("/api/consumer/auth/phone/status", checkPhoneAuthStatus);
}
