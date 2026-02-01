/**
 * TOTP Routes
 * API endpoints for dynamic QR code generation and validation
 */

import type { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import {
  generateTOTP,
  validateTOTP,
  generateDynamicQRPayload,
  encodeQRPayload,
  decodeQRPayload,
  validateDynamicQR,
  getSecondsUntilNextPeriod,
  generateSecret,
} from "../lib/totp";

// Supabase client for database operations
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

// ============================================================================
// Types
// ============================================================================

interface TOTPSecretRow {
  id: string;
  reservation_id: string;
  secret: string;
  algorithm: string;
  digits: number;
  period: number;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  validation_count: number;
}

interface ReservationRow {
  id: string;
  booking_reference: string | null;
  user_id: string | null;
  establishment_id: string;
  status: string;
  starts_at: string;
  party_size: number;
}

// ============================================================================
// GET /api/totp/secret/:reservationId
// Get or generate TOTP secret for a reservation (client-side use)
// ============================================================================

export async function getTOTPSecret(req: Request, res: Response): Promise<void> {
  try {
    const { reservationId } = req.params;
    const userId = (req as any).userId; // Set by auth middleware

    if (!reservationId) {
      res.status(400).json({ error: "Missing reservationId" });
      return;
    }

    const supabase = getSupabaseAdmin();

    // Verify the user owns this reservation
    const { data: reservation, error: resError } = await supabase
      .from("reservations")
      .select("id, user_id, status, booking_reference")
      .eq("id", reservationId)
      .single();

    if (resError || !reservation) {
      res.status(404).json({ error: "Reservation not found" });
      return;
    }

    // Check ownership (if userId is available)
    if (userId && reservation.user_id && reservation.user_id !== userId) {
      res.status(403).json({ error: "Not authorized to access this reservation" });
      return;
    }

    // Check if reservation is in a valid state
    if (!["confirmed", "pending", "waitlist"].includes(reservation.status)) {
      res.status(400).json({
        error: "Reservation not eligible for TOTP",
        status: reservation.status
      });
      return;
    }

    // Get or create TOTP secret
    let { data: secretRow, error: secretError } = await supabase
      .from("reservation_totp_secrets")
      .select("*")
      .eq("reservation_id", reservationId)
      .eq("is_active", true)
      .single();

    if (secretError || !secretRow) {
      // Generate new secret
      const newSecret = generateSecret(20);

      const { data: inserted, error: insertError } = await supabase
        .from("reservation_totp_secrets")
        .insert({
          reservation_id: reservationId,
          secret: newSecret,
          algorithm: "SHA1",
          digits: 6,
          period: 30,
        })
        .select()
        .single();

      if (insertError) {
        console.error("[totp] Error creating secret:", insertError);
        res.status(500).json({ error: "Failed to generate TOTP secret" });
        return;
      }

      secretRow = inserted;
    }

    // Return secret info for client
    res.json({
      ok: true,
      reservationId,
      bookingReference: reservation.booking_reference,
      secret: secretRow.secret,
      algorithm: secretRow.algorithm,
      digits: secretRow.digits,
      period: secretRow.period,
      secondsRemaining: getSecondsUntilNextPeriod(secretRow.period),
    });
  } catch (error) {
    console.error("[totp] Error in getTOTPSecret:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ============================================================================
// GET /api/totp/code/:reservationId
// Generate current TOTP code for a reservation
// ============================================================================

export async function generateTOTPCode(req: Request, res: Response): Promise<void> {
  try {
    const { reservationId } = req.params;
    const userId = (req as any).userId;

    if (!reservationId) {
      res.status(400).json({ error: "Missing reservationId" });
      return;
    }

    const supabase = getSupabaseAdmin();

    // Verify reservation ownership
    const { data: reservation, error: resError } = await supabase
      .from("reservations")
      .select("id, user_id, status, booking_reference")
      .eq("id", reservationId)
      .single();

    if (resError || !reservation) {
      res.status(404).json({ error: "Reservation not found" });
      return;
    }

    if (userId && reservation.user_id && reservation.user_id !== userId) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    // Get TOTP secret
    const { data: secretRow, error: secretError } = await supabase
      .from("reservation_totp_secrets")
      .select("secret, algorithm, digits, period")
      .eq("reservation_id", reservationId)
      .eq("is_active", true)
      .single();

    if (secretError || !secretRow) {
      res.status(404).json({ error: "No TOTP secret found for this reservation" });
      return;
    }

    // Generate code
    const code = generateTOTP({
      secret: secretRow.secret,
      algorithm: secretRow.algorithm as "SHA1" | "SHA256" | "SHA512",
      digits: secretRow.digits,
      period: secretRow.period,
    });

    // Generate QR payload
    const payload = generateDynamicQRPayload(reservationId, secretRow.secret);
    const qrString = encodeQRPayload(payload);

    res.json({
      ok: true,
      code,
      qrString,
      reservationId,
      bookingReference: reservation.booking_reference,
      expiresIn: getSecondsUntilNextPeriod(secretRow.period),
      period: secretRow.period,
    });
  } catch (error) {
    console.error("[totp] Error in generateTOTPCode:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ============================================================================
// POST /api/totp/validate
// Validate a TOTP code (called by scanner)
// ============================================================================

export async function validateTOTPCode(req: Request, res: Response): Promise<void> {
  try {
    const { code, qrString, reservationId, establishmentId } = req.body;
    const userId = (req as any).userId;

    // Must have either qrString or (code + reservationId)
    if (!qrString && (!code || !reservationId)) {
      res.status(400).json({
        error: "Missing required fields",
        hint: "Provide either qrString or (code + reservationId)"
      });
      return;
    }

    const supabase = getSupabaseAdmin();

    let targetReservationId = reservationId;
    let targetCode = code;
    let isLegacyFormat = false;

    // If qrString is provided, decode it
    if (qrString) {
      const payload = decodeQRPayload(qrString);

      if (payload) {
        targetReservationId = payload.rid;
        targetCode = payload.code;
      } else {
        // Legacy format - treat qrString as booking reference
        isLegacyFormat = true;

        // Look up reservation by booking reference
        const { data: res, error } = await supabase
          .from("reservations")
          .select("id")
          .eq("booking_reference", qrString.trim())
          .single();

        if (res) {
          targetReservationId = res.id;
        }
      }
    }

    if (!targetReservationId) {
      res.status(400).json({ error: "Could not determine reservation" });
      return;
    }

    // Get reservation details
    const { data: reservation, error: resError } = await supabase
      .from("reservations")
      .select("id, establishment_id, status, booking_reference, starts_at, party_size, checked_in_at")
      .eq("id", targetReservationId)
      .single();

    if (resError || !reservation) {
      await logValidation(supabase, {
        reservationId: targetReservationId,
        submittedCode: targetCode || qrString || "",
        isValid: false,
        rejectionReason: "not_found",
        establishmentId,
        userId,
      });

      res.json({
        ok: true,
        result: "rejected",
        reason: "not_found",
        message: "Réservation introuvable",
      });
      return;
    }

    // Verify establishment if provided
    if (establishmentId && reservation.establishment_id !== establishmentId) {
      await logValidation(supabase, {
        reservationId: targetReservationId,
        submittedCode: targetCode || qrString || "",
        isValid: false,
        rejectionReason: "wrong_establishment",
        establishmentId,
        userId,
      });

      res.json({
        ok: true,
        result: "rejected",
        reason: "wrong_establishment",
        message: "Réservation pour un autre établissement",
      });
      return;
    }

    // Check reservation status
    if (reservation.status === "cancelled") {
      await logValidation(supabase, {
        reservationId: targetReservationId,
        submittedCode: targetCode || qrString || "",
        isValid: false,
        rejectionReason: "cancelled",
        establishmentId,
        userId,
      });

      res.json({
        ok: true,
        result: "rejected",
        reason: "cancelled",
        message: "Réservation annulée",
      });
      return;
    }

    // Check if already checked in
    if (reservation.checked_in_at) {
      await logValidation(supabase, {
        reservationId: targetReservationId,
        submittedCode: targetCode || qrString || "",
        isValid: false,
        rejectionReason: "already_checked_in",
        establishmentId,
        userId,
      });

      res.json({
        ok: true,
        result: "rejected",
        reason: "already_checked_in",
        message: "Déjà enregistré",
        reservation: {
          id: reservation.id,
          booking_reference: reservation.booking_reference,
          checked_in_at: reservation.checked_in_at,
        },
      });
      return;
    }

    // If legacy format, accept without TOTP validation
    if (isLegacyFormat) {
      // Mark as checked in
      await supabase
        .from("reservations")
        .update({ checked_in_at: new Date().toISOString() })
        .eq("id", targetReservationId);

      await logValidation(supabase, {
        reservationId: targetReservationId,
        submittedCode: qrString || "",
        isValid: true,
        timeWindow: "legacy",
        establishmentId,
        userId,
      });

      res.json({
        ok: true,
        result: "accepted",
        reason: "ok",
        message: "Réservation validée (QR statique)",
        isLegacy: true,
        reservation: {
          id: reservation.id,
          booking_reference: reservation.booking_reference,
          starts_at: reservation.starts_at,
          party_size: reservation.party_size,
        },
      });
      return;
    }

    // Get TOTP secret
    const { data: secretRow, error: secretError } = await supabase
      .from("reservation_totp_secrets")
      .select("id, secret, algorithm, digits, period")
      .eq("reservation_id", targetReservationId)
      .eq("is_active", true)
      .single();

    if (secretError || !secretRow) {
      // No secret found - treat as legacy
      await supabase
        .from("reservations")
        .update({ checked_in_at: new Date().toISOString() })
        .eq("id", targetReservationId);

      await logValidation(supabase, {
        reservationId: targetReservationId,
        submittedCode: targetCode || "",
        isValid: true,
        rejectionReason: "no_secret_legacy_fallback",
        establishmentId,
        userId,
      });

      res.json({
        ok: true,
        result: "accepted",
        reason: "ok",
        message: "Réservation validée",
        isLegacy: true,
        reservation: {
          id: reservation.id,
          booking_reference: reservation.booking_reference,
          starts_at: reservation.starts_at,
          party_size: reservation.party_size,
        },
      });
      return;
    }

    // Validate TOTP
    const validation = validateTOTP(targetCode, {
      secret: secretRow.secret,
      algorithm: secretRow.algorithm as "SHA1" | "SHA256" | "SHA512",
      digits: secretRow.digits,
      period: secretRow.period,
      window: 1, // Accept ±1 period for clock drift
    });

    if (!validation.valid) {
      await logValidation(supabase, {
        reservationId: targetReservationId,
        secretId: secretRow.id,
        submittedCode: targetCode,
        expectedCode: validation.expectedCode,
        isValid: false,
        rejectionReason: validation.reason || "invalid_code",
        establishmentId,
        userId,
      });

      res.json({
        ok: true,
        result: "rejected",
        reason: "invalid_code",
        message: "Code QR invalide ou expiré",
      });
      return;
    }

    // Success! Mark as checked in
    await supabase
      .from("reservations")
      .update({ checked_in_at: new Date().toISOString() })
      .eq("id", targetReservationId);

    // Update secret usage stats
    await supabase
      .from("reservation_totp_secrets")
      .update({
        last_used_at: new Date().toISOString(),
        validation_count: (secretRow as any).validation_count + 1,
      })
      .eq("id", secretRow.id);

    await logValidation(supabase, {
      reservationId: targetReservationId,
      secretId: secretRow.id,
      submittedCode: targetCode,
      expectedCode: validation.expectedCode,
      isValid: true,
      timeWindow: String(validation.timeWindow),
      establishmentId,
      userId,
    });

    res.json({
      ok: true,
      result: "accepted",
      reason: "ok",
      message: "Réservation validée ✓",
      reservation: {
        id: reservation.id,
        booking_reference: reservation.booking_reference,
        starts_at: reservation.starts_at,
        party_size: reservation.party_size,
        status: reservation.status,
      },
    });
  } catch (error) {
    console.error("[totp] Error in validateTOTPCode:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

// ============================================================================
// Helper: Log validation attempt
// ============================================================================

async function logValidation(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  data: {
    reservationId: string;
    secretId?: string;
    submittedCode: string;
    expectedCode?: string;
    isValid: boolean;
    rejectionReason?: string;
    timeWindow?: string;
    establishmentId?: string;
    userId?: string;
  }
): Promise<void> {
  try {
    await supabase.from("totp_validation_logs").insert({
      reservation_id: data.reservationId,
      secret_id: data.secretId || null,
      submitted_code: data.submittedCode,
      expected_code: data.expectedCode || null,
      is_valid: data.isValid,
      rejection_reason: data.rejectionReason || null,
      time_window: data.timeWindow || null,
      establishment_id: data.establishmentId || null,
      validated_by_user_id: data.userId || null,
    });
  } catch (error) {
    console.error("[totp] Error logging validation:", error);
    // Don't throw - logging failure shouldn't break validation
  }
}

// ============================================================================
// POST /api/totp/regenerate/:reservationId
// Regenerate TOTP secret (if compromised)
// ============================================================================

export async function regenerateTOTPSecret(req: Request, res: Response): Promise<void> {
  try {
    const { reservationId } = req.params;
    const userId = (req as any).userId;

    if (!reservationId) {
      res.status(400).json({ error: "Missing reservationId" });
      return;
    }

    const supabase = getSupabaseAdmin();

    // Verify ownership
    const { data: reservation, error: resError } = await supabase
      .from("reservations")
      .select("id, user_id")
      .eq("id", reservationId)
      .single();

    if (resError || !reservation) {
      res.status(404).json({ error: "Reservation not found" });
      return;
    }

    if (userId && reservation.user_id && reservation.user_id !== userId) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    // Deactivate old secret
    await supabase
      .from("reservation_totp_secrets")
      .update({ is_active: false })
      .eq("reservation_id", reservationId)
      .eq("is_active", true);

    // Generate new secret
    const newSecret = generateSecret(20);

    const { data: inserted, error: insertError } = await supabase
      .from("reservation_totp_secrets")
      .insert({
        reservation_id: reservationId,
        secret: newSecret,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[totp] Error regenerating secret:", insertError);
      res.status(500).json({ error: "Failed to regenerate secret" });
      return;
    }

    res.json({
      ok: true,
      message: "TOTP secret regenerated",
      secret: newSecret,
      period: 30,
      digits: 6,
    });
  } catch (error) {
    console.error("[totp] Error in regenerateTOTPSecret:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
