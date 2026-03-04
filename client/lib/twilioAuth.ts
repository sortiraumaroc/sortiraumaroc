/**
 * Twilio Phone Authentication Service
 *
 * Client-side service for phone authentication using Twilio SMS API.
 * Replaces Firebase phone auth with direct Twilio integration.
 *
 * Flow:
 * 1. User enters phone number
 * 2. Client calls /api/consumer/auth/phone/send-code → Server sends OTP via Twilio
 * 3. User enters code
 * 4. Client calls /api/consumer/auth/phone/verify-code → Server verifies & creates session
 * 5. Client receives magic link or session token
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SendCodeResponse {
  success: boolean;
  status?: string;
  message?: string;
  error?: string;
  retryAfter?: number;
}

export interface VerifyCodeResponse {
  success: boolean;
  isNewUser?: boolean;
  userId?: string;
  actionLink?: string;
  error?: string;
}

export interface PhoneAuthStatusResponse {
  available: boolean;
  provider: string;
  methods: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration Check
// ─────────────────────────────────────────────────────────────────────────────

let twilioStatusCache: PhoneAuthStatusResponse | null = null;
let twilioStatusCacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

/**
 * Check if Twilio phone auth is available on the server
 */
export async function isTwilioAuthAvailable(): Promise<boolean> {
  const now = Date.now();

  // Return cached result if still valid
  if (twilioStatusCache && now - twilioStatusCacheTime < CACHE_TTL) {
    return twilioStatusCache.available;
  }

  try {
    const response = await fetch("/api/consumer/auth/phone/status", {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      twilioStatusCache = { available: false, provider: "none", methods: [] };
      twilioStatusCacheTime = now;
      return false;
    }

    const data = await response.json() as PhoneAuthStatusResponse;
    twilioStatusCache = data;
    twilioStatusCacheTime = now;

    return data.available;
  } catch (error) {
    console.error("[TwilioAuth] Error checking status:", error);
    twilioStatusCache = { available: false, provider: "none", methods: [] };
    twilioStatusCacheTime = now;
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phone Number Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format phone number to E.164 format
 * Supports Moroccan phone numbers and international format
 */
export function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, "");

  // If starts with 0, assume Moroccan number
  if (cleaned.startsWith("0")) {
    cleaned = "+212" + cleaned.slice(1);
  }

  // If doesn't start with +, assume Moroccan number without leading 0
  if (!cleaned.startsWith("+")) {
    // Check if it's a valid Moroccan number (6 or 7 followed by 8 digits)
    if (/^[67]\d{8}$/.test(cleaned)) {
      cleaned = "+212" + cleaned;
    } else {
      // Assume it's already in international format without +
      cleaned = "+" + cleaned;
    }
  }

  return cleaned;
}

/**
 * Format phone number for display (e.g., +212 6 XX XX XX XX)
 */
export function formatPhoneForDisplay(phone: string): string {
  const formatted = formatPhoneNumber(phone);

  // Moroccan number formatting
  if (formatted.startsWith("+212")) {
    const local = formatted.slice(4);
    if (local.length === 9) {
      return `+212 ${local[0]} ${local.slice(1, 3)} ${local.slice(3, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
    }
  }

  return formatted;
}

/**
 * Validate phone number format
 */
export function isValidPhoneNumber(phone: string): boolean {
  const formatted = formatPhoneNumber(phone);
  // E.164 format: + followed by 10-15 digits
  return /^\+\d{10,15}$/.test(formatted);
}

/**
 * Validate Moroccan phone number specifically
 */
export function isValidMoroccanNumber(phone: string): boolean {
  const formatted = formatPhoneNumber(phone);
  // Moroccan numbers: +212 followed by 9 digits starting with 5, 6, or 7
  return /^\+212[567]\d{8}$/.test(formatted);
}

// ─────────────────────────────────────────────────────────────────────────────
// API Calls
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send verification code via Twilio SMS
 */
export async function sendVerificationCode(phoneNumber: string): Promise<SendCodeResponse> {
  const formattedPhone = formatPhoneNumber(phoneNumber);

  if (!isValidPhoneNumber(phoneNumber)) {
    return {
      success: false,
      error: "Numéro de téléphone invalide",
    };
  }

  try {
    // Sending verification code

    const response = await fetch("/api/consumer/auth/phone/send-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phoneNumber: formattedPhone,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // Send code error — handled below
      return {
        success: false,
        error: data.error || "Échec de l'envoi du code",
        retryAfter: data.retryAfter,
      };
    }

    // Code sent successfully
    return {
      success: true,
      status: data.status,
      message: data.message,
    };
  } catch (error) {
    console.error("[TwilioAuth] Network error sending code:", error);
    return {
      success: false,
      error: "Erreur de connexion. Veuillez réessayer.",
    };
  }
}

/**
 * Verify the SMS code and authenticate the user
 */
export async function verifyCode(
  phoneNumber: string,
  code: string,
  referralCode?: string
): Promise<VerifyCodeResponse> {
  const formattedPhone = formatPhoneNumber(phoneNumber);

  if (!code || code.length < 4 || code.length > 8) {
    return {
      success: false,
      error: "Code de vérification invalide",
    };
  }

  try {
    // Verifying code

    const response = await fetch("/api/consumer/auth/phone/verify-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include", // Allow trust cookie to be set
      body: JSON.stringify({
        phoneNumber: formattedPhone,
        code: code.trim(),
        referralCode: referralCode || undefined,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // Verify code error — handled below
      return {
        success: false,
        error: data.error || "Code invalide",
      };
    }

    // Code verified successfully
    return {
      success: true,
      isNewUser: data.isNewUser,
      userId: data.userId,
      actionLink: data.actionLink,
    };
  } catch (error) {
    console.error("[TwilioAuth] Network error verifying code:", error);
    return {
      success: false,
      error: "Erreur de connexion. Veuillez réessayer.",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Session Handling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete the authentication by following the magic link
 * This is called after verifyCode returns an actionLink
 */
export async function completeAuthentication(actionLink: string): Promise<boolean> {
  try {
    // The actionLink is a Supabase magic link
    // We need to extract the token and use it to sign in

    // Parse the URL to get the token
    const url = new URL(actionLink);
    const token = url.searchParams.get("token") || url.hash.split("access_token=")[1]?.split("&")[0];

    if (!token) {
      // No token found in actionLink
      return false;
    }

    // Import Supabase client dynamically to avoid circular dependencies
    const { consumerSupabase } = await import("@/lib/supabase");

    // Try to verify the OTP token
    const { error } = await consumerSupabase.auth.verifyOtp({
      token_hash: token,
      type: "magiclink",
    });

    if (error) {
      // Error verifying OTP — trying session fallback
      // Fallback: try to get session directly
      const { data: sessionData, error: sessionError } = await consumerSupabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error("[TwilioAuth] Error completing authentication:", error);
    return false;
  }
}
