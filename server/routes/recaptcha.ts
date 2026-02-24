/**
 * reCAPTCHA v2 server-side verification
 */

const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;
const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

export interface RecaptchaVerifyResult {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  "error-codes"?: string[];
}

/**
 * Verify a reCAPTCHA v2 token
 * @param token The reCAPTCHA response token from the client
 * @param remoteip Optional client IP address
 * @returns true if verification succeeded, false otherwise
 */
export async function verifyRecaptchaToken(
  token: string,
  remoteip?: string
): Promise<boolean> {
  // Skip verification in development or if not configured
  if (!RECAPTCHA_SECRET_KEY || process.env.NODE_ENV === "development") {
    return true;
  }

  if (!token) {
    console.warn("[recaptcha] No token provided");
    return false;
  }

  try {
    const params = new URLSearchParams({
      secret: RECAPTCHA_SECRET_KEY,
      response: token,
    });

    if (remoteip) {
      params.append("remoteip", remoteip);
    }

    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      console.error("[recaptcha] Verification request failed:", response.status);
      return false;
    }

    const result: RecaptchaVerifyResult = await response.json();

    if (!result.success) {
      console.warn("[recaptcha] Verification failed:", result["error-codes"]);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[recaptcha] Verification error:", error);
    return false;
  }
}

/**
 * Check if reCAPTCHA is configured
 */
export function isRecaptchaConfigured(): boolean {
  if (process.env.NODE_ENV === "development") return false;
  return Boolean(RECAPTCHA_SECRET_KEY);
}
