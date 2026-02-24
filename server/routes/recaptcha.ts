/**
 * reCAPTCHA v2 server-side verification
 */

import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("recaptcha");

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
    log.warn("RECAPTCHA_SECRET_KEY not configured or development mode, skipping verification");
    return true;
  }

  if (!token) {
    log.warn("no token provided");
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
      log.error({ status: response.status }, "verification request failed");
      return false;
    }

    const result: RecaptchaVerifyResult = await response.json();

    if (!result.success) {
      log.warn({ errorCodes: result["error-codes"] }, "verification failed");
      return false;
    }

    return true;
  } catch (error) {
    log.error({ err: error }, "verification error");
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
