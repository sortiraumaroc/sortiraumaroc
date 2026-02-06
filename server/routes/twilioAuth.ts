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
import { getAdminSupabase } from "../supabaseAdmin";
import crypto from "crypto";
import Twilio from "twilio";

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

    console.log(`[TwilioAuth] Sending OTP via SMS to: ${cleanPhone}`);

    // Send SMS via Twilio Messages API (not Verify)
    const message = await client.messages.create({
      to: cleanPhone,
      from: TWILIO_PHONE_NUMBER,
      body: `Sortir Au Maroc : votre code de vérification est ${otpCode}. Il expire dans 5 minutes.`,
    });

    console.log("[TwilioAuth] SMS sent, SID:", message.sid, "status:", message.status);

    res.json({
      success: true,
      status: "pending",
      message: "Code de vérification envoyé par SMS",
    });
  } catch (error: unknown) {
    console.error("[TwilioAuth] Error sending SMS:", error);

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

    console.log("[TwilioAuth] OTP verified for:", cleanPhone);

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
    const { data: authUsersList } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });

    const existingAuthUser = authUsersList?.users?.find(
      (u) => u.phone === verifiedPhoneNumber || u.email === phoneEmail
    ) || null;

    if (existingAuthUser) {
      // User already exists in auth — reuse
      userId = existingAuthUser.id;
      isNewUser = false;
      console.log("[TwilioAuth] Existing auth user found:", userId);

      // Update metadata to reflect Twilio verification
      await supabase.auth.admin.updateUser(userId, {
        phone: verifiedPhoneNumber,
        phone_confirm: true,
        user_metadata: {
          auth_method: "phone",
          phone_verified: true,
          phone_verified_at: new Date().toISOString(),
          verification_provider: "twilio",
        },
      });

      // Ensure consumer_users profile exists
      const { data: existingProfile } = await supabase
        .from("consumer_users")
        .select("id")
        .eq("id", userId)
        .single();

      if (!existingProfile) {
        const { error: profileError } = await supabase
          .from("consumer_users")
          .insert({
            id: userId,
            email: phoneEmail,
            full_name: "",
            status: "active",
          });

        if (profileError) {
          console.warn("[TwilioAuth] Error creating consumer profile for existing auth user:", profileError);
        }
      }
    } else {
      // New user — create in Supabase Auth
      const randomPassword =
        crypto.randomBytes(32).toString("hex") +
        crypto.randomBytes(32).toString("hex");

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
        console.error("[TwilioAuth] Error creating auth user:", authError);
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
        })
        .select("id")
        .single();

      if (profileError) {
        console.error("[TwilioAuth] Error creating consumer profile:", profileError);
      }

      console.log("[TwilioAuth] New user created:", userId);

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
              console.warn("[TwilioAuth] Failed to create referral link:", linkError);
            } else {
              console.log("[TwilioAuth] Referral link created for user:", consumerUser.id);
            }
          }
        } catch (refError) {
          console.error("[TwilioAuth] Error processing referral:", refError);
        }
      }
    }

    // Generate a session for the user
    const { data: sessionData, error: sessionError } =
      await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: phoneEmail,
        options: {
          redirectTo: process.env.PUBLIC_BASE_URL || process.env.VITE_APP_URL || "https://sortiraumaroc.ma",
        },
      });

    if (sessionError) {
      console.error("[TwilioAuth] Error generating session:", sessionError);
      res.status(500).json({ error: "Échec de la création de la session" });
      return;
    }

    // Log successful authentication
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
      })
      .catch(() => {
        /* ignore logging errors */
      });

    res.json({
      success: true,
      isNewUser,
      userId,
      actionLink: sessionData?.properties?.action_link,
    });
  } catch (error: unknown) {
    console.error("[TwilioAuth] Unexpected error:", error);
    res.status(500).json({ error: "Erreur de vérification" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint 3: Check Twilio auth availability
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
