/**
 * SMS Service — Transactional SMS via Twilio
 *
 * Provides a simple `sendTransactionalSms()` function for the notification engine.
 * Reuses Twilio credentials from env vars (same as twilioAuth.ts).
 * Best-effort: does not throw on failure.
 */

import Twilio from "twilio";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("smsService");

// ---------------------------------------------------------------------------
// Twilio configuration (same env vars as twilioAuth.ts)
// ---------------------------------------------------------------------------

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || "+14136661650";

let twilioClient: ReturnType<typeof Twilio> | null = null;

function getTwilioClient(): ReturnType<typeof Twilio> | null {
  if (!twilioClient && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
    twilioClient = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SendSmsResult = {
  ok: boolean;
  messageSid?: string;
  error?: string;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if Twilio SMS is configured and available.
 */
export function isSmsConfigured(): boolean {
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN);
}

/**
 * Send a transactional SMS to a phone number.
 *
 * @param to - Phone number in E.164 format (e.g. +212612345678)
 * @param body - SMS body text (max ~1600 chars for multi-segment)
 * @returns Result with ok status and Twilio message SID
 */
export async function sendTransactionalSms(
  to: string,
  body: string,
): Promise<SendSmsResult> {
  if (!isSmsConfigured()) {
    log.warn("Twilio not configured — SMS not sent");
    return { ok: false, error: "twilio_not_configured" };
  }

  const client = getTwilioClient();
  if (!client) {
    return { ok: false, error: "twilio_client_init_failed" };
  }

  // Clean phone number
  const cleanPhone = to.replace(/[^\d+]/g, "").trim();
  if (!cleanPhone || cleanPhone.length < 8) {
    return { ok: false, error: "invalid_phone_number" };
  }

  try {
    const message = await client.messages.create({
      body,
      to: cleanPhone,
      from: TWILIO_PHONE_NUMBER,
    });

    log.info({ phone: cleanPhone, sid: message.sid }, "SMS sent");
    return { ok: true, messageSid: message.sid };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error({ phone: cleanPhone, err: errorMsg }, "Failed to send SMS");

    // Check for specific Twilio error codes
    const twilioError = err as { code?: number };
    if (twilioError.code === 21211) {
      return { ok: false, error: "invalid_phone_number" };
    }
    if (twilioError.code === 21608 || twilioError.code === 21610) {
      return { ok: false, error: "sms_blocked_or_unsubscribed" };
    }

    return { ok: false, error: errorMsg };
  }
}

/**
 * Send SMS with retry (1 retry after 2s delay).
 */
export async function sendTransactionalSmsWithRetry(
  to: string,
  body: string,
): Promise<SendSmsResult> {
  const first = await sendTransactionalSms(to, body);
  if (first.ok) return first;

  // Don't retry on permanent errors
  if (
    first.error === "twilio_not_configured" ||
    first.error === "invalid_phone_number" ||
    first.error === "sms_blocked_or_unsubscribed"
  ) {
    return first;
  }

  // Wait 2s then retry
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return sendTransactionalSms(to, body);
}
