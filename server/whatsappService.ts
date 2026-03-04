/**
 * WhatsApp Service — Transactional WhatsApp messages via Twilio
 *
 * Uses the same Twilio credentials as smsService.ts but sends
 * messages via the WhatsApp Business API (`whatsapp:+NUMBER` format).
 *
 * Requires:
 *   - TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN (same as SMS)
 *   - TWILIO_WHATSAPP_NUMBER (e.g. +14155238886 for sandbox)
 *
 * Best-effort: does not throw on failure.
 */

import Twilio from "twilio";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("whatsappService");

// ---------------------------------------------------------------------------
// Twilio configuration
// ---------------------------------------------------------------------------

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || "";

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

export type SendWhatsAppResult = {
  ok: boolean;
  messageSid?: string;
  error?: string;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if Twilio WhatsApp is configured and available.
 */
export function isWhatsAppConfigured(): boolean {
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_NUMBER);
}

/**
 * Send a transactional WhatsApp message to a phone number.
 *
 * @param to - Phone number in E.164 format (e.g. +212612345678)
 * @param body - Message body text
 * @returns Result with ok status and Twilio message SID
 */
export async function sendWhatsAppMessage(
  to: string,
  body: string,
): Promise<SendWhatsAppResult> {
  if (!isWhatsAppConfigured()) {
    log.warn("Twilio WhatsApp not configured — message not sent");
    return { ok: false, error: "whatsapp_not_configured" };
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
      to: `whatsapp:${cleanPhone}`,
      from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
    });

    log.info({ phone: cleanPhone, sid: message.sid }, "WhatsApp message sent");
    return { ok: true, messageSid: message.sid };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error({ phone: cleanPhone, err: errorMsg }, "Failed to send WhatsApp message");

    const twilioError = err as { code?: number };
    if (twilioError.code === 63016) {
      return { ok: false, error: "whatsapp_not_opted_in" };
    }

    return { ok: false, error: errorMsg };
  }
}
