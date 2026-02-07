/**
 * Email Verification Routes
 *
 * Handles email verification for user signup.
 * Sends a 6-digit code to the user's email address.
 * Supports reCAPTCHA v2 verification.
 */

import type { Request, Response } from "express";
import { sendLoggedEmail } from "../emailService";
import { verifyRecaptchaToken, isRecaptchaConfigured } from "./recaptcha";
import { getAdminSupabase } from "../supabaseAdmin";
import crypto from "crypto";

// In-memory store for verification codes (in production, use Redis or similar)
const verificationCodes = new Map<string, { code: string; expiresAt: number }>();

// Store for recently verified emails (valid for 5 minutes after verification)
const verifiedEmails = new Map<string, { verifiedAt: number; expiresAt: number }>();
const VERIFIED_EMAIL_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// Rate limiting for email verification
const emailAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS_PER_HOUR = 5;

// Clean up expired codes every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of verificationCodes.entries()) {
    if (data.expiresAt < now) {
      verificationCodes.delete(email);
    }
  }
  // Clean up rate limit entries
  for (const [email, data] of emailAttempts.entries()) {
    if (data.resetAt < now) {
      emailAttempts.delete(email);
    }
  }
  // Clean up expired verified emails
  for (const [email, data] of verifiedEmails.entries()) {
    if (data.expiresAt < now) {
      verifiedEmails.delete(email);
    }
  }
}, 5 * 60 * 1000);

export async function sendEmailVerificationCode(req: Request, res: Response) {
  try {
    const { email, code, recaptchaToken } = req.body;

    if (!email || typeof email !== "string" || !/.+@.+\..+/.test(email.trim())) {
      return res.status(400).json({ error: "Email invalide" });
    }

    // Accept both 6-digit and 8-digit codes for backwards compatibility
    if (!code || typeof code !== "string" || !/^\d{6,8}$/.test(code)) {
      return res.status(400).json({ error: "Code invalide" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if email already exists in the database BEFORE sending any code
    const supabase = getAdminSupabase();
    const { data: authUsersList } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });

    const existingUser = authUsersList?.users?.find(
      (u) => u.email === normalizedEmail
    );

    if (existingUser) {
      console.log(`[EmailVerification] Email already registered: ${normalizedEmail}`);
      return res.status(409).json({
        error: "Un compte existe déjà avec cet email. Veuillez vous connecter.",
        code: "EMAIL_ALREADY_EXISTS",
      });
    }

    // Rate limiting check
    const now = Date.now();
    const attempts = emailAttempts.get(normalizedEmail);
    if (attempts && attempts.resetAt > now && attempts.count >= MAX_ATTEMPTS_PER_HOUR) {
      console.warn(`[EmailVerification] Rate limit exceeded for ${normalizedEmail}`);
      return res.status(429).json({ error: "Trop de tentatives. Réessayez dans une heure." });
    }

    // Verify reCAPTCHA token if configured
    if (isRecaptchaConfigured()) {
      if (!recaptchaToken) {
        return res.status(400).json({ error: "Vérification reCAPTCHA requise" });
      }

      const clientIp = req.ip || req.socket.remoteAddress;
      const recaptchaValid = await verifyRecaptchaToken(recaptchaToken, clientIp);

      if (!recaptchaValid) {
        console.warn(`[EmailVerification] reCAPTCHA verification failed for ${normalizedEmail}`);
        return res.status(400).json({ error: "Vérification reCAPTCHA échouée" });
      }
    }

    // Update rate limiting
    if (attempts && attempts.resetAt > now) {
      attempts.count++;
    } else {
      emailAttempts.set(normalizedEmail, {
        count: 1,
        resetAt: now + 60 * 60 * 1000, // 1 hour
      });
    }

    // Store the code with 2-minute expiration
    verificationCodes.set(normalizedEmail, {
      code,
      expiresAt: Date.now() + 2 * 60 * 1000,
    });

    // Send the verification email
    const result = await sendLoggedEmail({
      emailId: `verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromKey: "noreply",
      to: [normalizedEmail],
      subject: "Votre code de vérification Sortir Au Maroc",
      bodyText: `Vérification de votre email\n\nVotre code de vérification est : ${code}\n\nCe code est valide pendant 2 minutes.\n\nSi vous n'avez pas demandé ce code, ignorez cet email.`,
      meta: {
        type: "email_verification",
        recipient_email: normalizedEmail,
      },
    });

    if (result.ok === false) {
      console.error("[EmailVerification] Failed to send email:", result.error);

      // Detect SES sandbox rejection
      const isSandbox =
        result.error.includes("Email address is not verified") ||
        result.error.includes("identities failed the check");

      if (isSandbox) {
        console.error(
          `[EmailVerification] AWS SES sandbox: recipient ${normalizedEmail} is not a verified identity. ` +
            `Add it in the SES console or request production access.`,
        );
        return res.status(500).json({
          error:
            "Impossible d'envoyer l'email : l'adresse destinataire n'est pas vérifiée dans Amazon SES (mode sandbox). " +
            "Ajoutez cette adresse dans la console SES ou demandez l'accès production.",
        });
      }

      return res.status(500).json({ error: "Impossible d'envoyer l'email" });
    }

    console.log(`[EmailVerification] Code sent to ${normalizedEmail}`);
    return res.json({ ok: true });
  } catch (error) {
    console.error("[EmailVerification] Error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

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
    const stored = verificationCodes.get(normalizedEmail);

    if (!stored) {
      return res.status(400).json({ error: "Code expiré ou invalide" });
    }

    if (stored.expiresAt < Date.now()) {
      verificationCodes.delete(normalizedEmail);
      return res.status(400).json({ error: "Code expiré" });
    }

    if (stored.code !== code) {
      return res.status(400).json({ error: "Code incorrect" });
    }

    // Code is valid, remove it and mark email as verified
    verificationCodes.delete(normalizedEmail);
    verifiedEmails.set(normalizedEmail, {
      verifiedAt: Date.now(),
      expiresAt: Date.now() + VERIFIED_EMAIL_EXPIRY_MS,
    });

    console.log(`[EmailVerification] Email verified: ${normalizedEmail}`);
    return res.json({ ok: true, verified: true });
  } catch (error) {
    console.error("[EmailVerification] Verify error:", error);
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

    // Check that this email was recently verified
    const verified = verifiedEmails.get(normalizedEmail);
    if (!verified || verified.expiresAt < Date.now()) {
      verifiedEmails.delete(normalizedEmail);
      return res.status(403).json({ error: "Email non vérifié. Veuillez d'abord vérifier votre email." });
    }

    // Consume the verification (one-time use)
    verifiedEmails.delete(normalizedEmail);

    const supabase = getAdminSupabase();

    // Check if user already exists
    const { data: authUsersList } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });

    const existingUser = authUsersList?.users?.find(
      (u) => u.email === normalizedEmail
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
      console.error("[EmailSignup] Error creating auth user:", authError);

      // Handle weak password error from Supabase
      if (authError.message?.includes("weak") || authError.message?.includes("password")) {
        return res.status(422).json({ error: "Mot de passe trop faible. Choisissez un mot de passe plus complexe." });
      }

      return res.status(500).json({ error: "Échec de la création du compte" });
    }

    const userId = authData.user.id;
    console.log("[EmailSignup] Auth user created:", userId);

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
      console.error("[EmailSignup] Error creating consumer profile:", profileError);
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
            console.warn("[EmailSignup] Failed to create referral link:", linkError);
          } else {
            console.log("[EmailSignup] Referral link created for user:", userId);
          }
        }
      } catch (refError) {
        console.error("[EmailSignup] Error processing referral:", refError);
      }
    }

    // Generate a session for the user
    const { data: sessionData, error: sessionError } =
      await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
        options: {
          redirectTo: process.env.PUBLIC_BASE_URL || process.env.VITE_APP_URL || "https://sortiraumaroc.ma",
        },
      });

    if (sessionError) {
      console.error("[EmailSignup] Error generating session:", sessionError);
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
    } catch {
      /* ignore logging errors */
    }

    console.log("[EmailSignup] Account created successfully:", userId);

    return res.json({
      success: true,
      isNewUser: true,
      userId,
      actionLink: sessionData?.properties?.action_link,
    });
  } catch (error) {
    console.error("[EmailSignup] Unexpected error:", error);
    return res.status(500).json({ error: "Erreur lors de la création du compte" });
  }
}
