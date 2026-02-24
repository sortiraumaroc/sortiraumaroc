/**
 * Ramadan QR Scan Logic
 *
 * Validation des QR codes pour les réservations Ramadan :
 *  - Vérifie que la réservation existe et est confirmée
 *  - Vérifie one-time use (pas déjà scanné)
 *  - Vérifie la fenêtre temporelle (créneau ±2h)
 *  - Logue le scan dans ramadan_qr_scans
 *  - Marque la réservation comme consumed
 */

import { getAdminSupabase } from "./supabaseAdmin";
import type { RamadanQrScanStatus } from "../shared/ramadanTypes";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("ramadanQrLogic");

// =============================================================================
// Types
// =============================================================================

type ScanResult =
  | { ok: true; status: "valid"; reservation: Record<string, unknown>; offer: Record<string, unknown> }
  | { ok: false; status: RamadanQrScanStatus; error: string };

// =============================================================================
// Validation du scan QR Ramadan
// =============================================================================

/**
 * Valide un scan QR pour une réservation Ramadan.
 *
 * Le QR TOTP identifie le user → on cherche sa réservation Ramadan
 * active pour cet établissement.
 */
export async function validateRamadanQrScan(args: {
  userId: string;
  establishmentId: string;
  scannedBy: string;
  location?: { lat: number; lng: number } | null;
}): Promise<ScanResult> {
  const supabase = getAdminSupabase();

  // 1. Chercher une réservation Ramadan active pour ce user + établissement
  const { data: reservation, error: resErr } = await supabase
    .from("reservations")
    .select("id, ramadan_offer_id, starts_at, party_size, status, user_id")
    .eq("user_id", args.userId)
    .eq("establishment_id", args.establishmentId)
    .not("ramadan_offer_id", "is", null)
    .in("status", ["confirmed", "pending"])
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (resErr || !reservation) {
    // Logger le scan invalide
    await logScan({
      reservationId: null,
      ramadanOfferId: null,
      scannedBy: args.scannedBy,
      location: args.location,
      status: "invalid",
    });
    return { ok: false, status: "invalid", error: "Aucune réservation Ramadan trouvée pour ce client." };
  }

  const res = reservation as Record<string, unknown>;
  const reservationId = res.id as string;
  const ramadanOfferId = res.ramadan_offer_id as string;

  // 2. Vérifier one-time use
  const { count: existingScans } = await supabase
    .from("ramadan_qr_scans")
    .select("id", { count: "exact", head: true })
    .eq("reservation_id", reservationId)
    .eq("scan_status", "valid");

  if ((existingScans ?? 0) > 0) {
    await logScan({
      reservationId,
      ramadanOfferId,
      scannedBy: args.scannedBy,
      location: args.location,
      status: "already_used",
    });
    return { ok: false, status: "already_used", error: "Ce QR a déjà été utilisé pour cette réservation." };
  }

  // 3. Vérifier la fenêtre temporelle (±2h du créneau)
  const startsAt = res.starts_at as string;
  if (startsAt) {
    const reservationTime = new Date(startsAt).getTime();
    const now = Date.now();
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

    if (now < reservationTime - TWO_HOURS_MS || now > reservationTime + TWO_HOURS_MS) {
      await logScan({
        reservationId,
        ramadanOfferId,
        scannedBy: args.scannedBy,
        location: args.location,
        status: "expired",
      });
      return { ok: false, status: "expired", error: "Le QR n'est pas dans la fenêtre temporelle du créneau (±2h)." };
    }
  }

  // 4. Récupérer l'offre Ramadan pour les infos
  const { data: offer } = await supabase
    .from("ramadan_offers")
    .select("id, title, type, price, time_slots, cover_url")
    .eq("id", ramadanOfferId)
    .maybeSingle();

  // 5. Logger le scan valide
  await logScan({
    reservationId,
    ramadanOfferId,
    scannedBy: args.scannedBy,
    location: args.location,
    status: "valid",
  });

  // 6. Marquer la réservation comme consumed
  await supabase
    .from("reservations")
    .update({
      status: "completed",
      consumed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", reservationId);

  return {
    ok: true,
    status: "valid",
    reservation: res,
    offer: (offer as Record<string, unknown>) ?? {},
  };
}

// =============================================================================
// Helper : Logger un scan
// =============================================================================

async function logScan(args: {
  reservationId: string | null;
  ramadanOfferId: string | null;
  scannedBy: string;
  location?: { lat: number; lng: number } | null;
  status: RamadanQrScanStatus;
}): Promise<void> {
  if (!args.reservationId) return; // pas de log sans reservation_id (FK required)

  try {
    const supabase = getAdminSupabase();
    await supabase.from("ramadan_qr_scans").insert({
      reservation_id: args.reservationId,
      ramadan_offer_id: args.ramadanOfferId,
      scanned_by: args.scannedBy,
      location: args.location ?? null,
      scan_status: args.status,
    });
  } catch (err) {
    log.warn({ err }, "Best-effort: ramadan QR scan log insert failed");
  }
}
