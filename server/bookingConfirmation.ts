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
import { formatDateLongFr } from "../shared/datetime";

const BASE_URL = process.env.VITE_APP_URL || "https://sortiraumaroc.ma";

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
    console.error("[H3 Confirmation] Error fetching reservations:", fetchError);
    return { sent: 0, errors: 1, details: [] };
  }

  if (!reservations || reservations.length === 0) {
    console.log("[H3 Confirmation] No reservations need confirmation email");
    return { sent: 0, errors: 0, details: [] };
  }

  console.log(`[H3 Confirmation] Found ${reservations.length} reservations to process`);

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
        console.error(`[H3 Confirmation] Error creating request for ${res.reservation_id}:`, insertError);
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

      console.log(`[H3 Confirmation] Email sent for reservation ${res.reservation_id}`);
      results.push({ reservation_id: res.reservation_id, success: true });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[H3 Confirmation] Error processing ${res.reservation_id}:`, err);
      results.push({ reservation_id: res.reservation_id, success: false, error: errorMsg });
    }
  }

  const sent = results.filter((r) => r.success).length;
  const errors = results.filter((r) => !r.success).length;

  console.log(`[H3 Confirmation] Completed: ${sent} sent, ${errors} errors`);
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
    console.error("[Confirm Booking] Database error:", error);
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
    console.error("[Auto Cancel] Database error:", error);
    return { cancelled: 0, errors: 1, details: [] };
  }

  if (!cancelled || cancelled.length === 0) {
    console.log("[Auto Cancel] No reservations to auto-cancel");
    return { cancelled: 0, errors: 0, details: [] };
  }

  console.log(`[Auto Cancel] ${cancelled.length} reservations auto-cancelled`);

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
      console.error(`[Auto Cancel] Error sending emails for ${res.reservation_id}:`, err);
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
