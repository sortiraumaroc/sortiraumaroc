/**
 * Conciergerie Scan Logic — QR TOTP for Conciergerie Step Requests
 *
 * Flow:
 *  1. PRO accepts a step_request → TOTP secret auto-generated
 *  2. Concierge/client shows QR code to PRO on visit day
 *  3. PRO scans QR → validated once (one-shot)
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { generateSecret, generateTOTP, validateTOTP } from "./lib/totp";
import type { ConciergerieScanValidationResult } from "../shared/b2bScanTypes";

const supabase = () => getAdminSupabase();

// ============================================================================
// QR Encoding / Decoding
// ============================================================================

/**
 * Encode conciergerie scan QR payload
 * Format: SAM:CONC:v1:{stepRequestId}:{totpCode}:{timestamp}
 */
export function encodeConciergerieQrPayload(
  stepRequestId: string,
  code: string,
): string {
  const ts = Math.floor(Date.now() / 1000);
  return `SAM:CONC:v1:${stepRequestId}:${code}:${ts}`;
}

/**
 * Decode conciergerie scan QR payload
 */
export function decodeConciergerieQrPayload(
  qrString: string,
): { stepRequestId: string; code: string; ts: number } | null {
  const trimmed = qrString.trim();
  if (!trimmed.startsWith("SAM:CONC:v")) return null;

  const parts = trimmed.split(":");
  if (parts.length < 6) return null;

  return {
    stepRequestId: parts[3],
    code: parts[4],
    ts: parseInt(parts[5], 10) || 0,
  };
}

// ============================================================================
// Secret Generation
// ============================================================================

/**
 * Generate and store a TOTP secret for an accepted step_request.
 * Idempotent: if secret already exists, returns existing.
 */
export async function generateConciergerieScanSecret(
  stepRequestId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = supabase();

  // Check if secret already exists
  const { data: existing } = await sb
    .from("conciergerie_scan_secrets")
    .select("id")
    .eq("step_request_id", stepRequestId)
    .maybeSingle();

  if (existing) return { ok: true };

  // Verify step_request is accepted
  const { data: req } = await sb
    .from("step_requests")
    .select("id, status")
    .eq("id", stepRequestId)
    .maybeSingle();

  if (!req) return { ok: false, error: "Step request introuvable." };
  if (req.status !== "accepted")
    return { ok: false, error: "La demande n'est pas encore acceptée." };

  // Generate and store secret
  const secret = generateSecret(20);
  const { error } = await sb.from("conciergerie_scan_secrets").insert({
    step_request_id: stepRequestId,
    secret,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ============================================================================
// QR Data Retrieval (for concierge/client to display)
// ============================================================================

/**
 * Get the current TOTP-based QR payload for a step_request.
 * Called by the concierge to display the QR code.
 */
export async function getConciergerieQrData(
  stepRequestId: string,
): Promise<
  | { ok: true; payload: string; expiresIn: number }
  | { ok: false; error: string }
> {
  const sb = supabase();

  const { data: secret } = await sb
    .from("conciergerie_scan_secrets")
    .select("secret, algorithm, digits, period, is_active, used_at")
    .eq("step_request_id", stepRequestId)
    .maybeSingle();

  if (!secret) return { ok: false, error: "QR non généré pour cette demande." };
  if (!secret.is_active)
    return { ok: false, error: "QR désactivé." };
  if (secret.used_at)
    return { ok: false, error: "Ce QR a déjà été utilisé." };

  const code = generateTOTP({
    secret: secret.secret,
    algorithm: secret.algorithm as "SHA1",
    digits: secret.digits,
    period: secret.period,
  });

  const payload = encodeConciergerieQrPayload(stepRequestId, code);

  // Seconds until next TOTP period
  const now = Date.now() / 1000;
  const periodStart = Math.floor(now / secret.period) * secret.period;
  const expiresIn = Math.ceil(periodStart + secret.period - now);

  return { ok: true, payload, expiresIn };
}

// ============================================================================
// Scan Validation
// ============================================================================

/**
 * Validate a conciergerie QR scan.
 * Called by the PRO when scanning a conciergerie QR.
 *
 * Steps:
 *  1. Decode QR
 *  2. Check timestamp freshness (90s)
 *  3. Fetch step_request (must be accepted)
 *  4. Verify establishment_id matches
 *  5. Validate TOTP code
 *  6. Check one-shot (used_at must be NULL)
 *  7. Get journey + concierge info
 *  8. Record scan in b2b_scans
 *  9. Mark secret as used
 */
export async function validateConciergerieScan(
  qrPayload: string,
  establishmentId: string,
  scannedBy: string,
): Promise<ConciergerieScanValidationResult> {
  const sb = supabase();
  const fail = (reason: string): ConciergerieScanValidationResult => ({
    valid: false,
    client_name: null,
    concierge_name: null,
    journey_title: null,
    step_description: null,
    establishment_name: null,
    refusal_reason: reason,
  });

  // 1. Decode QR
  const decoded = decodeConciergerieQrPayload(qrPayload);
  if (!decoded) return fail("QR Code conciergerie invalide.");

  // 2. Check timestamp freshness (90 seconds max)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - decoded.ts) > 90) {
    return fail("QR Code expiré. Le concierge doit rafraîchir son QR.");
  }

  // 3. Fetch step_request + step + journey
  const { data: stepRequest } = await sb
    .from("step_requests")
    .select("id, step_id, establishment_id, status, party_size, desired_date")
    .eq("id", decoded.stepRequestId)
    .maybeSingle();

  if (!stepRequest) return fail("Demande conciergerie introuvable.");
  if (stepRequest.status !== "accepted")
    return fail("Cette demande n'est pas acceptée.");

  // 4. Verify establishment matches
  if (stepRequest.establishment_id !== establishmentId) {
    return fail("Ce QR n'est pas destiné à cet établissement.");
  }

  // 5. Validate TOTP code
  const { data: totpSecret } = await sb
    .from("conciergerie_scan_secrets")
    .select("secret, algorithm, digits, period, is_active, used_at")
    .eq("step_request_id", decoded.stepRequestId)
    .maybeSingle();

  if (!totpSecret) return fail("QR non activé pour cette demande.");
  if (!totpSecret.is_active) return fail("QR désactivé.");

  // 6. Check one-shot
  if (totpSecret.used_at) {
    return fail("Ce QR a déjà été utilisé (scan unique).");
  }

  const totpResult = validateTOTP(decoded.code, {
    secret: totpSecret.secret,
    algorithm: totpSecret.algorithm as "SHA1",
    digits: totpSecret.digits,
    period: totpSecret.period,
    window: 1,
  });

  if (!totpResult.valid) {
    return fail("Code QR invalide ou expiré.");
  }

  // 7. Get journey + concierge info
  const { data: step } = await sb
    .from("journey_steps")
    .select("id, journey_id, description, universe")
    .eq("id", stepRequest.step_id)
    .maybeSingle();

  if (!step) return fail("Étape introuvable.");

  const { data: journey } = await sb
    .from("experience_journeys")
    .select("id, concierge_id, client_name, title")
    .eq("id", step.journey_id)
    .maybeSingle();

  if (!journey) return fail("Parcours introuvable.");

  const { data: concierge } = await sb
    .from("concierges")
    .select("id, name")
    .eq("id", journey.concierge_id)
    .maybeSingle();

  const { data: establishment } = await sb
    .from("establishments")
    .select("name")
    .eq("id", establishmentId)
    .maybeSingle();

  // 8. Record scan in b2b_scans
  const { data: scan } = await sb
    .from("b2b_scans")
    .insert({
      scan_type: "conciergerie",
      establishment_id: establishmentId,
      status: "validated",
      scanned_by: scannedBy,
      step_request_id: decoded.stepRequestId,
      concierge_id: journey.concierge_id,
      journey_id: journey.id,
      client_name: journey.client_name,
    })
    .select("id")
    .single();

  // 9. Mark secret as used (one-shot)
  await sb
    .from("conciergerie_scan_secrets")
    .update({ used_at: new Date().toISOString() })
    .eq("step_request_id", decoded.stepRequestId);

  return {
    valid: true,
    client_name: journey.client_name,
    concierge_name: concierge?.name ?? null,
    journey_title: journey.title,
    step_description: step.description,
    establishment_name: establishment?.name ?? null,
    refusal_reason: null,
    scanId: scan?.id,
  };
}
