/**
 * Booking Confirmation Service
 *
 * Handles H-3 pre-confirmation system to reduce no-shows:
 * - Sends confirmation emails 3h before reservation
 * - User must click to confirm attendance within 1h
 * - Auto-cancels reservation if not confirmed
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { sendTemplateEmail } from "./emailService";
import { notifyProMembers } from "./proNotifications";
import { formatDateLongFr } from "../shared/datetime";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("bookingConfirmation");

const BASE_URL = process.env.VITE_APP_URL || "https://sam.ma";

// ============================================================================
// Types
// ============================================================================

interface ReservationForConfirmation {
  reservation_id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  user_phone: string | null;
  establishment_id: string;
  establishment_name: string;
  starts_at: string;
  party_size: number;
  booking_reference: string | null;
}

interface ExpiredConfirmationRequest {
  request_id: string;
  reservation_id: string;
  token: string;
  user_email: string;
  user_name: string;
  establishment_name: string;
  starts_at: string;
  party_size: number;
}

interface AutoCancelledReservation {
  reservation_id: string;
  user_email: string;
  user_name: string;
  establishment_id: string;
  establishment_name: string;
  pro_email: string | null;
  starts_at: string;
  party_size: number;
}

// ============================================================================
// H-3 Confirmation Email Sending
// ============================================================================

/**
 * Sends confirmation emails to all reservations starting in ~3 hours
 * Should be called by a cron job every 5-10 minutes
 */
export async function sendH3ConfirmationEmails(): Promise<{
  sent: number;
  errors: number;
  details: Array<{ reservation_id: string; success: boolean; error?: string }>;
}> {
  const supabase = getAdminSupabase();
  const results: Array<{ reservation_id: string; success: boolean; error?: string }> = [];

  // Get reservations needing confirmation
  const { data: reservations, error: fetchError } = await supabase.rpc(
    "get_reservations_for_h3_confirmation"
  );

  if (fetchError) {
    log.error({ err: fetchError }, "error fetching reservations for H3 confirmation");
    return { sent: 0, errors: 1, details: [] };
  }

  if (!reservations || reservations.length === 0) {
    log.info("no reservations need confirmation email");
    return { sent: 0, errors: 0, details: [] };
  }

  log.info({ count: reservations.length }, "found reservations to process for H3 confirmation");

  for (const res of reservations as ReservationForConfirmation[]) {
    try {
      // Create confirmation request with 1h expiry
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      const { data: confirmRequest, error: insertError } = await supabase
        .from("booking_confirmation_requests")
        .insert({
          reservation_id: res.reservation_id,
          expires_at: expiresAt.toISOString(),
        })
        .select("token")
        .single();

      if (insertError) {
        log.error({ err: insertError, reservationId: res.reservation_id }, "error creating confirmation request");
        results.push({ reservation_id: res.reservation_id, success: false, error: insertError.message });
        continue;
      }

      // Build confirmation URL
      const confirmUrl = `${BASE_URL}/booking/confirm/${confirmRequest.token}`;

      // Format date/time for email
      const dateTimeLabel = formatDateLongFr(res.starts_at);
      // Split for templates that use separate date/time variables
      const startsAt = new Date(res.starts_at);
      const dateStr = startsAt.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Africa/Casablanca",
      });
      const capitalizedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
      const timeStr = startsAt.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Casablanca",
      }).replace(":", "h");

      // Send email
      await sendTemplateEmail({
        templateKey: "user_booking_confirm_3h",
        fromKey: "noreply",
        to: [res.user_email],
        lang: "fr",
        variables: {
          user_name: res.user_name,
          establishment: res.establishment_name,
          date: capitalizedDate,
          time: timeStr,
          guests: String(res.party_size || 1),
          confirm_booking_url: confirmUrl,
        },
      });

      log.info({ reservationId: res.reservation_id }, "H3 confirmation email sent");
      results.push({ reservation_id: res.reservation_id, success: true });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      log.error({ err, reservationId: res.reservation_id }, "error processing H3 confirmation");
      results.push({ reservation_id: res.reservation_id, success: false, error: errorMsg });
    }
  }

  const sent = results.filter((r) => r.success).length;
  const errors = results.filter((r) => !r.success).length;

  log.info({ sent, errors }, "H3 confirmation completed");
  return { sent, errors, details: results };
}

// ============================================================================
// Confirm Booking by Token
// ============================================================================

/**
 * Confirms a booking using the token from the email link
 */
export async function confirmBookingByToken(token: string): Promise<{
  success: boolean;
  error?: string;
  reservation?: {
    id: string;
    establishment_name: string;
    starts_at: string;
    party_size: number;
  };
}> {
  const supabase = getAdminSupabase();

  // Call the database function
  const { data, error } = await supabase.rpc("confirm_booking_by_token", {
    p_token: token,
  });

  if (error) {
    log.error({ err: error }, "confirm booking database error");
    return { success: false, error: "Erreur lors de la confirmation" };
  }

  const result = data as { success: boolean; error?: string; reservation_id?: string; message?: string };

  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Get reservation details for confirmation page
  const { data: reservation } = await supabase
    .from("reservations")
    .select(`
      id,
      starts_at,
      party_size,
      establishments!inner(name)
    `)
    .eq("id", result.reservation_id)
    .single();

  if (reservation) {
    // Send confirmation emails
    const { data: userData } = await supabase
      .from("reservations")
      .select(`
        users!inner(email, display_name, first_name, last_name, phone)
      `)
      .eq("id", result.reservation_id)
      .single();

    const user = (userData as any)?.users;
    const establishment = (reservation as any).establishments;

    const startsAt = new Date(reservation.starts_at);
    const dateStr2 = startsAt.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Africa/Casablanca",
    });
    const capitalizedDate2 = dateStr2.charAt(0).toUpperCase() + dateStr2.slice(1);
    const timeStr2 = startsAt.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Casablanca",
    }).replace(":", "h");

    // Send confirmation to user
    if (user?.email) {
      await sendTemplateEmail({
        templateKey: "user_booking_reconfirmed",
        fromKey: "noreply",
        to: [user.email],
        lang: "fr",
        variables: {
          user_name: user.display_name || `${user.first_name} ${user.last_name}`,
          establishment: establishment.name,
          date: capitalizedDate2,
          time: timeStr2,
          guests: String(reservation.party_size || 1),
          address: "", // Could fetch from establishment
          booking_url: `${BASE_URL}/mes-reservations`,
        },
      });
    }

    // Notify pro
    const { data: proData } = await supabase
      .from("establishments")
      .select(`
        pro_users!inner(email)
      `)
      .eq("id", (reservation as any).establishment_id)
      .single();

    const proEmail = (proData as any)?.pro_users?.email;
    if (proEmail) {
      await sendTemplateEmail({
        templateKey: "pro_client_confirmed",
        fromKey: "noreply",
        to: [proEmail],
        lang: "fr",
        variables: {
          user_name: user?.display_name || `${user?.first_name} ${user?.last_name}`,
          date: capitalizedDate2,
          time: timeStr2,
          guests: String(reservation.party_size || 1),
          phone: user?.phone || "Non renseigné",
          planning_url: `${BASE_URL}/pro/reservations`,
        },
      });
    }

    return {
      success: true,
      reservation: {
        id: reservation.id,
        establishment_name: establishment.name,
        starts_at: reservation.starts_at,
        party_size: reservation.party_size,
      },
    };
  }

  return { success: true };
}

// ============================================================================
// Auto-Cancel Expired Unconfirmed Reservations
// ============================================================================

/**
 * Cancels all reservations where the user didn't confirm within 1h
 * Should be called by a cron job every 5 minutes
 */
export async function autoCancelUnconfirmedReservations(): Promise<{
  cancelled: number;
  errors: number;
  details: Array<{ reservation_id: string; success: boolean; error?: string }>;
}> {
  const supabase = getAdminSupabase();
  const results: Array<{ reservation_id: string; success: boolean; error?: string }> = [];

  // Call the database function that cancels and returns affected reservations
  const { data: cancelled, error } = await supabase.rpc("auto_cancel_unconfirmed_reservations");

  if (error) {
    log.error({ err: error }, "auto cancel database error");
    return { cancelled: 0, errors: 1, details: [] };
  }

  if (!cancelled || cancelled.length === 0) {
    log.info("no reservations to auto-cancel");
    return { cancelled: 0, errors: 0, details: [] };
  }

  log.info({ count: cancelled.length }, "reservations auto-cancelled");

  // Send notification emails
  for (const res of cancelled as AutoCancelledReservation[]) {
    try {
      const startsAt = new Date(res.starts_at);
      const dateStr3 = startsAt.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Africa/Casablanca",
      });
      const capitalizedDate3 = dateStr3.charAt(0).toUpperCase() + dateStr3.slice(1);
      const timeStr3 = startsAt.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Casablanca",
      }).replace(":", "h");

      // Notify user
      await sendTemplateEmail({
        templateKey: "user_booking_auto_cancelled",
        fromKey: "noreply",
        to: [res.user_email],
        lang: "fr",
        variables: {
          user_name: res.user_name,
          establishment: res.establishment_name,
          date: capitalizedDate3,
          time: timeStr3,
          guests: String(res.party_size || 1),
          establishment_url: `${BASE_URL}/etablissement/${res.establishment_id}`,
        },
      });

      // Notify pro
      if (res.pro_email) {
        await sendTemplateEmail({
          templateKey: "pro_booking_auto_cancelled",
          fromKey: "noreply",
          to: [res.pro_email],
          lang: "fr",
          variables: {
            user_name: res.user_name,
            date: capitalizedDate3,
            time: timeStr3,
            guests: String(res.party_size || 1),
            planning_url: `${BASE_URL}/pro/reservations`,
          },
        });
      }

      results.push({ reservation_id: res.reservation_id, success: true });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      log.error({ err, reservationId: res.reservation_id }, "error sending auto-cancel emails");
      results.push({ reservation_id: res.reservation_id, success: false, error: errorMsg });
    }
  }

  return {
    cancelled: cancelled.length,
    errors: results.filter((r) => !r.success).length,
    details: results,
  };
}

// ============================================================================
// Get Confirmation Request Info (for UI)
// ============================================================================

/**
 * Gets information about a confirmation request by token
 * Used to display the confirmation page
 */
export async function getConfirmationRequestInfo(token: string): Promise<{
  found: boolean;
  status?: "pending" | "confirmed" | "expired" | "cancelled";
  expired?: boolean;
  reservation?: {
    id: string;
    establishment_name: string;
    starts_at: string;
    party_size: number;
    address?: string;
  };
}> {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("booking_confirmation_requests")
    .select(`
      status,
      expires_at,
      reservations!inner(
        id,
        starts_at,
        party_size,
        establishments!inner(name, address_full)
      )
    `)
    .eq("token", token)
    .single();

  if (error || !data) {
    return { found: false };
  }

  const reservation = (data as any).reservations;
  const establishment = reservation.establishments;

  return {
    found: true,
    status: data.status as "pending" | "confirmed" | "expired" | "cancelled",
    expired: new Date(data.expires_at) < new Date(),
    reservation: {
      id: reservation.id,
      establishment_name: establishment.name,
      starts_at: reservation.starts_at,
      party_size: reservation.party_size,
      address: establishment.address_full,
    },
  };
}

// ============================================================================
// Unconfirmed Recap — grouped notification to establishments
// ============================================================================

/**
 * Sends a grouped recap of unconfirmed reservations to each affected establishment.
 *
 * Timing: runs ~30 min after H-3 emails, ~30 min BEFORE auto-cancel.
 *   T-3h00 → sendH3ConfirmationEmails()
 *   T-2h30 → sendUnconfirmedRecapToEstablishments()  ← this
 *   T-2h00 → autoCancelUnconfirmedReservations()
 *
 * This gives the establishment time to call clients who haven't confirmed yet.
 */
export async function sendUnconfirmedRecapToEstablishments(): Promise<{
  sent: number;
  errors: number;
  details: Array<{ establishment_id: string; count: number; success: boolean; error?: string }>;
}> {
  const supabase = getAdminSupabase();
  const results: Array<{ establishment_id: string; count: number; success: boolean; error?: string }> = [];

  // -----------------------------------------------------------------------
  // 1. Find pending BCRs sent 25-55 min ago (not yet expired, user hasn't confirmed)
  //    Also exclude reservations where we already sent a recap (meta.recap_sent)
  // -----------------------------------------------------------------------
  const { data: rows, error: fetchError } = await supabase
    .from("booking_confirmation_requests")
    .select(`
      id,
      reservation_id,
      sent_at,
      expires_at,
      reservations!inner(
        id,
        starts_at,
        party_size,
        meta,
        establishment_id,
        consumer_id,
        establishments!inner(id, name),
        consumer_users!inner(id, full_name, phone)
      )
    `)
    .eq("status", "pending")
    .lt("sent_at", new Date(Date.now() - 25 * 60_000).toISOString()) // sent > 25 min ago
    .gt("expires_at", new Date().toISOString()); // not yet expired

  if (fetchError) {
    log.error({ err: fetchError }, "error fetching pending BCRs for recap");
    return { sent: 0, errors: 1, details: [] };
  }

  if (!rows || rows.length === 0) {
    log.info("no pending BCRs eligible for unconfirmed recap");
    return { sent: 0, errors: 0, details: [] };
  }

  // Filter out reservations where recap was already sent
  const eligible = rows.filter((r) => {
    const reservation = (r as any).reservations;
    const meta = reservation?.meta;
    return !meta?.recap_sent;
  });

  if (eligible.length === 0) {
    log.info("all eligible BCRs already had recap sent");
    return { sent: 0, errors: 0, details: [] };
  }

  log.info({ count: eligible.length }, "BCRs eligible for unconfirmed recap");

  // -----------------------------------------------------------------------
  // 2. Group by establishment
  // -----------------------------------------------------------------------
  type RecapEntry = {
    reservation_id: string;
    full_name: string;
    party_size: number;
    phone: string;
    time: string; // formatted "20h30"
    starts_at: string; // raw ISO for sorting
  };

  const byEstablishment = new Map<
    string,
    { name: string; entries: RecapEntry[]; reservationIds: string[] }
  >();

  for (const row of eligible) {
    const reservation = (row as any).reservations;
    const establishment = reservation.establishments;
    const consumer = reservation.consumer_users;
    const estId: string = establishment.id;

    if (!byEstablishment.has(estId)) {
      byEstablishment.set(estId, {
        name: establishment.name,
        entries: [],
        reservationIds: [],
      });
    }

    const startsAt = new Date(reservation.starts_at);
    const timeStr = startsAt
      .toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Casablanca",
      })
      .replace(":", "h");

    const group = byEstablishment.get(estId)!;
    group.entries.push({
      reservation_id: reservation.id,
      full_name: consumer.full_name || "Client",
      party_size: reservation.party_size || 1,
      phone: consumer.phone || "Non renseigné",
      time: timeStr,
      starts_at: reservation.starts_at,
    });
    group.reservationIds.push(reservation.id);
  }

  // -----------------------------------------------------------------------
  // 3. For each establishment: send email + in-app notification, then mark
  // -----------------------------------------------------------------------
  for (const [estId, group] of byEstablishment) {
    try {
      const count = group.entries.length;

      // Sort entries by time
      group.entries.sort((a, b) => a.starts_at.localeCompare(b.starts_at));

      // Build HTML table for email template variable {{ recap_html }}
      const recapRows = group.entries
        .map(
          (e) =>
            `<tr>
              <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${e.full_name}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center">${e.party_size}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${e.phone}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center">${e.time}</td>
            </tr>`
        )
        .join("\n");

      const recapHtml = `<table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Nom</th>
            <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e2e8f0">Pers.</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0">Téléphone</th>
            <th style="padding:8px 12px;text-align:center;border-bottom:2px solid #e2e8f0">Heure</th>
          </tr>
        </thead>
        <tbody>
          ${recapRows}
        </tbody>
      </table>`;

      // --- Send email to pro ---
      // Get pro email (establishment owner)
      const { data: estData } = await supabase
        .from("establishments")
        .select("pro_users!inner(email)")
        .eq("id", estId)
        .single();

      const proEmail = (estData as any)?.pro_users?.email;

      if (proEmail) {
        await sendTemplateEmail({
          templateKey: "pro_unconfirmed_recap",
          fromKey: "noreply",
          to: [proEmail],
          lang: "fr",
          variables: {
            establishment_name: group.name,
            count: String(count),
            recap_html: recapHtml,
            planning_url: `${BASE_URL}/pro/reservations`,
          },
        });
      }

      // --- In-app notification to all pro members ---
      void notifyProMembers({
        supabase,
        establishmentId: estId,
        category: "reservation",
        title: `⚠️ ${count} réservation(s) non confirmée(s)`,
        body: `${count} client(s) n'ont pas encore confirmé leur venue. Consultez leurs coordonnées pour les contacter avant l'annulation automatique.`,
        data: {
          action: "unconfirmed_recap",
          count,
          reservations: group.entries.map((e) => ({
            name: e.full_name,
            party_size: e.party_size,
            phone: e.phone,
            time: e.time,
          })),
        },
      });

      // --- Mark reservations as recap_sent to avoid duplicates ---
      for (const resId of group.reservationIds) {
        const { data: resRow } = await supabase
          .from("reservations")
          .select("meta")
          .eq("id", resId)
          .single();
        const existingMeta = (resRow?.meta as Record<string, unknown>) ?? {};
        await supabase
          .from("reservations")
          .update({ meta: { ...existingMeta, recap_sent: true } })
          .eq("id", resId);
      }

      log.info({ establishmentId: estId, count }, "unconfirmed recap sent");
      results.push({ establishment_id: estId, count, success: true });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      log.error({ err, establishmentId: estId }, "error sending unconfirmed recap");
      results.push({ establishment_id: estId, count: group.entries.length, success: false, error: errorMsg });
    }
  }

  const sent = results.filter((r) => r.success).length;
  const errors = results.filter((r) => !r.success).length;

  log.info({ sent, errors, totalReservations: eligible.length }, "unconfirmed recap completed");
  return { sent, errors, details: results };
}

// ---------------------------------------------------------------------------
// Route registration (called from index.ts)
// ---------------------------------------------------------------------------
import type { Express, Request, Response } from "express";

export function registerBookingConfirmationRoutes(app: Express) {
  // Public: Get confirmation request info (for confirmation page UI)
  app.get("/api/booking/confirm/:token/info", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const info = await getConfirmationRequestInfo(token);
      res.json(info);
    } catch (err) {
      log.error({ err }, "booking confirm get info failed");
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Public: Confirm booking by token (user clicks link in email)
  app.post("/api/booking/confirm/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const result = await confirmBookingByToken(token);
      res.json(result);
    } catch (err) {
      log.error({ err }, "booking confirm failed");
      res.status(500).json({ success: false, error: "Erreur serveur" });
    }
  });

  // Admin/Cron: Trigger H-3 confirmation emails
  app.post("/api/admin/cron/h3-confirmation-emails", async (req: Request, res: Response) => {
    const adminKey = req.headers["x-admin-key"];
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const result = await sendH3ConfirmationEmails();
      res.json(result);
    } catch (err) {
      log.error({ err }, "H3 confirmation emails cron failed");
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Admin/Cron: Auto-cancel unconfirmed reservations
  app.post("/api/admin/cron/auto-cancel-unconfirmed", async (req: Request, res: Response) => {
    const adminKey = req.headers["x-admin-key"];
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const result = await autoCancelUnconfirmedReservations();
      res.json(result);
    } catch (err) {
      log.error({ err }, "auto-cancel unconfirmed cron failed");
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Admin/Cron: Send unconfirmed recap to establishments (before auto-cancel)
  app.post("/api/admin/cron/unconfirmed-recap", async (req: Request, res: Response) => {
    const adminKey = req.headers["x-admin-key"];
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    try {
      const result = await sendUnconfirmedRecapToEstablishments();
      res.json(result);
    } catch (err) {
      log.error({ err }, "unconfirmed recap cron failed");
      res.status(500).json({ error: "Erreur serveur" });
    }
  });
}
