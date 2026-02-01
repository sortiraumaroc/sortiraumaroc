/**
 * Email Verification Routes
 *
 * Handles email verification for user signup.
 * Sends an 8-digit code to the user's email address.
 */

import type { Request, Response } from "express";
import { sendLoggedEmail } from "../emailService";

// In-memory store for verification codes (in production, use Redis or similar)
const verificationCodes = new Map<string, { code: string; expiresAt: number }>();

// Clean up expired codes every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [email, data] of verificationCodes.entries()) {
    if (data.expiresAt < now) {
      verificationCodes.delete(email);
    }
  }
}, 5 * 60 * 1000);

export async function sendEmailVerificationCode(req: Request, res: Response) {
  try {
    const { email, code } = req.body;

    if (!email || typeof email !== "string" || !/.+@.+\..+/.test(email.trim())) {
      return res.status(400).json({ error: "Email invalide" });
    }

    if (!code || typeof code !== "string" || !/^\d{8}$/.test(code)) {
      return res.status(400).json({ error: "Code invalide" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Store the code with 2-minute expiration
    verificationCodes.set(normalizedEmail, {
      code,
      expiresAt: Date.now() + 2 * 60 * 1000,
    });

    // Send the verification email
    const result = await sendLoggedEmail({
      fromKey: "noreply",
      to: normalizedEmail,
      subject: "Votre code de vérification Sortir Au Maroc",
      body: `
        <h2 style="color: #a3001d; margin-bottom: 24px;">Vérification de votre email</h2>
        <p style="margin-bottom: 16px;">Votre code de vérification est :</p>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 12px; text-align: center; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1f2937; font-family: monospace;">${code}</span>
        </div>
        <p style="color: #6b7280; font-size: 14px;">Ce code est valide pendant 2 minutes.</p>
        <p style="color: #6b7280; font-size: 14px;">Si vous n'avez pas demandé ce code, ignorez cet email.</p>
      `,
      meta: {
        type: "email_verification",
        recipient_email: normalizedEmail,
      },
    });

    if (result.ok === false) {
      console.error("[EmailVerification] Failed to send email:", result.error);
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

    // Code is valid, remove it
    verificationCodes.delete(normalizedEmail);

    console.log(`[EmailVerification] Email verified: ${normalizedEmail}`);
    return res.json({ ok: true, verified: true });
  } catch (error) {
    console.error("[EmailVerification] Verify error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
