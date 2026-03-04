/**
 * Firebase Authentication Routes
 *
 * Handles Firebase phone authentication and links it with Supabase accounts.
 * SECURITY: Verifies Firebase ID tokens server-side before creating sessions.
 */

import type { Request, Response } from "express";
import type { Express } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import crypto from "crypto";
import { createModuleLogger } from "../lib/logger";
import { authRateLimiter } from "../middleware/rateLimiter";
import { zBody } from "../lib/validate";
import { FirebaseAuthSchema } from "../schemas/firebaseAuth";

const log = createModuleLogger("firebaseAuth");

// Rate limiting storage (in production, use Redis)
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_ATTEMPTS_PER_WINDOW = 5;

/**
 * Check rate limiting for phone auth
 */
function checkRateLimit(identifier: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = loginAttempts.get(identifier);

  if (!record) {
    loginAttempts.set(identifier, { count: 1, lastAttempt: now });
    return { allowed: true };
  }

  // Reset if window expired
  if (now - record.lastAttempt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(identifier, { count: 1, lastAttempt: now });
    return { allowed: true };
  }

  if (record.count >= MAX_ATTEMPTS_PER_WINDOW) {
    const retryAfter = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - record.lastAttempt)) / 1000);
    return { allowed: false, retryAfter };
  }

  record.count++;
  record.lastAttempt = now;
  return { allowed: true };
}

/**
 * Verify Firebase ID token by calling Firebase's public key endpoint
 * This is a secure server-side verification without Firebase Admin SDK
 */
async function verifyFirebaseIdToken(idToken: string, projectId: string): Promise<{
  valid: boolean;
  phoneNumber?: string;
  uid?: string;
  error?: string;
}> {
  try {
    // Decode the JWT header to get the key ID
    const parts = idToken.split(".");
    if (parts.length !== 3) {
      return { valid: false, error: "Invalid token format" };
    }

    const headerB64 = parts[0];
    const payloadB64 = parts[1];
    const signature = parts[2];

    // Decode header
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    const kid = header.kid;

    if (!kid || header.alg !== "RS256") {
      return { valid: false, error: "Invalid token header" };
    }

    // Fetch Firebase public keys
    const keysResponse = await fetch(
      "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
    );

    if (!keysResponse.ok) {
      return { valid: false, error: "Failed to fetch Firebase public keys" };
    }

    const keys = await keysResponse.json() as Record<string, string>;
    const publicKey = keys[kid];

    if (!publicKey) {
      return { valid: false, error: "Key not found" };
    }

    // Verify signature using Node's crypto
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(`${headerB64}.${payloadB64}`);

    const signatureBuffer = Buffer.from(signature, "base64url");
    const isValid = verifier.verify(publicKey, signatureBuffer);

    if (!isValid) {
      return { valid: false, error: "Invalid signature" };
    }

    // Decode and validate payload
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);

    // Validate expiration
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: "Token expired" };
    }

    // Validate issued at
    if (payload.iat && payload.iat > now + 60) {
      return { valid: false, error: "Token issued in the future" };
    }

    // Validate audience (should be our project ID)
    if (payload.aud !== projectId) {
      return { valid: false, error: "Invalid audience" };
    }

    // Validate issuer
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
      return { valid: false, error: "Invalid issuer" };
    }

    // Validate subject (user ID) exists
    if (!payload.sub || typeof payload.sub !== "string") {
      return { valid: false, error: "Missing subject" };
    }

    // Extract phone number
    const phoneNumber = payload.phone_number;
    if (!phoneNumber || typeof phoneNumber !== "string") {
      return { valid: false, error: "No phone number in token" };
    }

    return {
      valid: true,
      phoneNumber,
      uid: payload.sub,
    };
  } catch (error) {
    log.error({ err: error }, "token verification error");
    return { valid: false, error: "Token verification failed" };
  }
}

/**
 * Verify Firebase ID token and create/login Supabase user
 *
 * This endpoint:
 * 1. Verifies the Firebase ID token SERVER-SIDE
 * 2. Extracts the verified phone number
 * 3. Creates or finds the Supabase user with that phone number
 * 4. Returns Supabase session tokens
 */
export async function authenticateWithFirebase(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { idToken, phoneNumber: clientPhoneNumber, referral_code: referralCode } = req.body;

    if (!idToken || typeof idToken !== "string") {
      res.status(400).json({ error: "Missing or invalid idToken" });
      return;
    }

    // Rate limiting by IP
    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    const rateCheck = checkRateLimit(clientIp);
    if (!rateCheck.allowed) {
      res.status(429).json({
        error: "Too many attempts. Please try again later.",
        retryAfter: rateCheck.retryAfter
      });
      return;
    }

    // Check if Firebase is configured
    const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;

    if (!firebaseProjectId) {
      res.status(503).json({
        error: "Firebase authentication is not configured on this server",
      });
      return;
    }

    // CRITICAL: Verify the Firebase ID token server-side
    const verification = await verifyFirebaseIdToken(idToken, firebaseProjectId);

    if (!verification.valid) {
      log.warn({ error: verification.error }, "token verification failed");
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    // Use the VERIFIED phone number from the token, not the client-provided one
    const verifiedPhoneNumber = verification.phoneNumber!;

    // Log if client-provided phone doesn't match (potential manipulation attempt)
    if (clientPhoneNumber && clientPhoneNumber !== verifiedPhoneNumber) {
      log.warn({ clientPhoneNumber, verifiedPhoneNumber }, "phone mismatch between client and verified token");
    }

    const supabase = getAdminSupabase();

    // Generate a secure email from phone number for Supabase
    const phoneEmail = `${verifiedPhoneNumber.replace(/\+/g, "")}@phone.sortiraumaroc.ma`;

    // Try to find existing user by phone metadata
    const { data: existingUsers, error: searchError } = await supabase
      .from("consumer_users")
      .select("id, auth_user_id")
      .eq("phone", verifiedPhoneNumber)
      .limit(1);

    if (searchError) {
      log.error({ err: searchError }, "error searching for user");
    }

    let userId: string;
    let isNewUser = false;

    if (existingUsers && existingUsers.length > 0) {
      // User exists - get their auth_user_id
      userId = existingUsers[0].auth_user_id;
    } else {
      // Create new user in Supabase Auth with cryptographically secure password
      const randomPassword = crypto.randomBytes(32).toString("hex") + crypto.randomBytes(32).toString("hex");

      const { data: authData, error: authError } =
        await supabase.auth.admin.createUser({
          email: phoneEmail,
          password: randomPassword,
          email_confirm: true, // Skip email confirmation for phone users
          phone: verifiedPhoneNumber,
          phone_confirm: true, // Phone is verified via Firebase
          user_metadata: {
            auth_method: "phone",
            phone_verified: true,
            phone_verified_at: new Date().toISOString(),
            firebase_uid: verification.uid,
          },
        });

      if (authError) {
        log.error({ err: authError }, "error creating auth user");
        res.status(500).json({ error: "Failed to create user account" });
        return;
      }

      userId = authData.user.id;
      isNewUser = true;

      // Create consumer_users record
      const { data: consumerUser, error: profileError } = await supabase
        .from("consumer_users")
        .insert({
          auth_user_id: userId,
          phone: verifiedPhoneNumber,
          display_name: null,
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (profileError) {
        log.error({ err: profileError }, "error creating consumer profile");
        // Don't fail - the auth user was created successfully
      }

      // Handle referral code if provided (only for new users)
      if (referralCode && typeof referralCode === "string" && consumerUser?.id) {
        try {
          // Validate the referral code
          const { data: validation } = await supabase.rpc("validate_referral_code", {
            p_code: referralCode.trim(),
          });

          const validResult = Array.isArray(validation) ? validation[0] : validation;

          if (validResult?.is_valid && validResult.partner_id) {
            // Create the referral link
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
          } else {
            log.warn({ referralCode }, "invalid referral code provided");
          }
        } catch (refError) {
          log.error({ err: refError }, "error processing referral");
          // Don't fail registration if referral fails
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
      res.status(500).json({ error: "Failed to create session" });
      return;
    }

    // Log successful authentication
    try {
      await supabase.from("system_logs").insert({
        actor_user_id: userId,
        actor_role: "consumer",
        action: "auth.phone_login",
        entity_type: "consumer_user",
        entity_id: userId,
        payload: {
          method: "firebase_phone",
          is_new_user: isNewUser,
          firebase_uid: verification.uid,
        },
      });
    } catch (err) { log.warn({ err }, "Best-effort: phone login audit log failed"); }

    // Return the session data
    res.json({
      success: true,
      isNewUser,
      userId,
      actionLink: sessionData?.properties?.action_link,
    });
  } catch (error) {
    log.error({ err: error }, "unexpected error");
    res.status(500).json({ error: "Authentication failed" });
  }
}

/**
 * Check if Firebase authentication is available
 */
export async function checkFirebaseAuthStatus(
  _req: Request,
  res: Response
): Promise<void> {
  const isConfigured = Boolean(process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID);

  res.json({
    available: isConfigured,
    methods: isConfigured ? ["phone"] : [],
  });
}

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerFirebaseAuthRoutes(app: Express) {
  app.post("/api/consumer/auth/firebase", authRateLimiter, zBody(FirebaseAuthSchema), authenticateWithFirebase);
  app.get("/api/consumer/auth/firebase/status", checkFirebaseAuthStatus);
}
