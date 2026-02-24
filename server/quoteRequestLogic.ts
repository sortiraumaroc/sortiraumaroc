/**
 * Quote Request Logic
 *
 * Handles group booking quotes (> 15 persons):
 * - Client submits quote request
 * - Pro has 48h to acknowledge receipt
 * - Pro has 7 days after acknowledgement to send quote
 * - Client can accept/decline quote
 * - Accepted quote converts to reservation
 * - Integrated messaging thread between client and pro
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { emitAdminNotification } from "./adminNotifications";
import { notifyProMembers } from "./proNotifications";
import { sendTemplateEmail } from "./emailService";
import { RESERVATION_TIMINGS } from "../shared/reservationTypesV2";
import type { QuoteStatus, EventType, QuoteSenderType } from "../shared/reservationTypesV2";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("quoteRequest");

// =============================================================================
// Types
// =============================================================================

export interface SubmitQuoteInput {
  userId: string;
  establishmentId: string;
  partySize: number;
  preferredDate?: string;
  preferredTimeSlot?: string;
  isDateFlexible: boolean;
  eventType: EventType;
  eventTypeOther?: string;
  requirements?: string;
  budgetIndication?: string;
  contactPhone?: string;
  contactEmail?: string;
}

export interface QuoteActionResult {
  ok: boolean;
  quoteId?: string;
  newStatus?: QuoteStatus;
  error?: string;
}

// =============================================================================
// 1. Submit quote request (client)
// =============================================================================

/**
 * Client submits a group quote request.
 */
export async function submitQuoteRequest(args: {
  supabase: SupabaseClient;
  input: SubmitQuoteInput;
}): Promise<QuoteActionResult> {
  const { supabase, input } = args;

  if (input.partySize <= 15) {
    return { ok: false, error: "Les demandes de devis sont réservées aux groupes de plus de 15 personnes" };
  }

  const nowIso = new Date().toISOString();
  const acknowledgeDeadline = new Date(
    Date.now() + RESERVATION_TIMINGS.QUOTE_ACKNOWLEDGE_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data: quote, error } = await supabase
    .from("quote_requests")
    .insert({
      user_id: input.userId,
      establishment_id: input.establishmentId,
      party_size: input.partySize,
      preferred_date: input.preferredDate || null,
      preferred_time_slot: input.preferredTimeSlot || null,
      is_date_flexible: input.isDateFlexible,
      event_type: input.eventType,
      event_type_other: input.eventTypeOther || null,
      requirements: input.requirements || null,
      budget_indication: input.budgetIndication || null,
      contact_phone: input.contactPhone || null,
      contact_email: input.contactEmail || null,
      status: "submitted",
      acknowledge_deadline: acknowledgeDeadline,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single();

  if (error) {
    log.error({ err: error }, "submitQuoteRequest insert error");
    return { ok: false, error: "Erreur lors de la soumission du devis" };
  }

  const quoteId = String((quote as any).id);

  // Notify pro
  void notifyProMembers({
    supabase,
    establishmentId: input.establishmentId,
    category: "booking",
    title: "Nouvelle demande de devis",
    body: `Groupe de ${input.partySize} personnes — ${input.eventType}. Vous avez 48h pour accuser réception.`,
    data: { action: "quote_submitted", quoteId, partySize: input.partySize },
  });

  // Notify admin
  void emitAdminNotification({
    type: "quote_submitted",
    title: "Nouvelle demande de devis",
    body: `${input.partySize} pers. — ${input.eventType} — Établissement ${input.establishmentId.slice(0, 8)}`,
    data: { quoteId, establishmentId: input.establishmentId },
  });

  return { ok: true, quoteId, newStatus: "submitted" };
}

// =============================================================================
// 2. Pro acknowledges receipt
// =============================================================================

/**
 * Pro acknowledges receipt of quote request.
 * Starts the 7-day countdown for sending the actual quote.
 */
export async function acknowledgeQuote(args: {
  supabase: SupabaseClient;
  quoteId: string;
  establishmentId: string;
}): Promise<QuoteActionResult> {
  const { supabase, quoteId, establishmentId } = args;

  const { data: quote, error } = await supabase
    .from("quote_requests")
    .select("id, user_id, status, establishment_id")
    .eq("id", quoteId)
    .eq("establishment_id", establishmentId)
    .single();

  if (error || !quote) {
    return { ok: false, error: "quote_not_found" };
  }

  if ((quote as any).status !== "submitted") {
    return { ok: false, error: `Cannot acknowledge from status: ${(quote as any).status}` };
  }

  const nowIso = new Date().toISOString();
  const quoteDeadline = new Date(
    Date.now() + RESERVATION_TIMINGS.QUOTE_RESPONSE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  await supabase
    .from("quote_requests")
    .update({
      status: "acknowledged",
      acknowledged_at: nowIso,
      quote_deadline: quoteDeadline,
      updated_at: nowIso,
    })
    .eq("id", quoteId);

  // Notify client
  void notifyQuoteClient({
    supabase,
    userId: String((quote as any).user_id),
    establishmentId,
    quoteId,
    templateKey: "reservation_quote_acknowledged",
  });

  return { ok: true, quoteId, newStatus: "acknowledged" };
}

// =============================================================================
// 3. Pro sends quote
// =============================================================================

/**
 * Pro sends actual quote to client.
 * This is done via the messaging system with a special "quote" type message.
 */
export async function sendQuote(args: {
  supabase: SupabaseClient;
  quoteId: string;
  establishmentId: string;
  quoteMessage: string;
  attachments?: Array<{ url: string; filename: string; type: string; size: number }>;
}): Promise<QuoteActionResult> {
  const { supabase, quoteId, establishmentId, quoteMessage, attachments } = args;

  const { data: quote, error } = await supabase
    .from("quote_requests")
    .select("id, user_id, status, establishment_id")
    .eq("id", quoteId)
    .eq("establishment_id", establishmentId)
    .single();

  if (error || !quote) {
    return { ok: false, error: "quote_not_found" };
  }

  if ((quote as any).status !== "acknowledged") {
    return { ok: false, error: `Cannot send quote from status: ${(quote as any).status}` };
  }

  const nowIso = new Date().toISOString();

  // Update status
  await supabase
    .from("quote_requests")
    .update({
      status: "quote_sent",
      updated_at: nowIso,
    })
    .eq("id", quoteId);

  // Add quote message to thread
  await supabase
    .from("quote_messages")
    .insert({
      quote_request_id: quoteId,
      sender_type: "pro",
      sender_id: establishmentId, // Pro sender is the establishment
      content: quoteMessage,
      attachments: attachments || [],
      created_at: nowIso,
    });

  // Notify client
  void notifyQuoteClient({
    supabase,
    userId: String((quote as any).user_id),
    establishmentId,
    quoteId,
    templateKey: "reservation_quote_received",
  });

  return { ok: true, quoteId, newStatus: "quote_sent" };
}

// =============================================================================
// 4. Client accepts/declines quote
// =============================================================================

/**
 * Client accepts the quote → converts to reservation.
 */
export async function acceptQuote(args: {
  supabase: SupabaseClient;
  quoteId: string;
  userId: string;
}): Promise<QuoteActionResult & { reservationId?: string }> {
  const { supabase, quoteId, userId } = args;

  const { data: quote, error } = await supabase
    .from("quote_requests")
    .select("id, user_id, establishment_id, party_size, preferred_date, preferred_time_slot, status")
    .eq("id", quoteId)
    .eq("user_id", userId)
    .single();

  if (error || !quote) {
    return { ok: false, error: "quote_not_found" };
  }

  const q = quote as Record<string, unknown>;
  if (String(q.status) !== "quote_sent") {
    return { ok: false, error: `Cannot accept from status: ${q.status}` };
  }

  const nowIso = new Date().toISOString();

  // Create the reservation from the quote
  const startsAt = q.preferred_date && q.preferred_time_slot
    ? `${q.preferred_date}T${q.preferred_time_slot}:00`
    : nowIso;

  const { data: reservation, error: resError } = await supabase
    .from("reservations")
    .insert({
      user_id: userId,
      establishment_id: String(q.establishment_id),
      starts_at: startsAt,
      party_size: Number(q.party_size),
      status: "confirmed",
      type: "group_quote",
      payment_type: "free", // Group quotes start as free (payment handled separately)
      stock_type: "paid_stock",
      meta: { quote_request_id: quoteId },
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single();

  if (resError) {
    log.error({ err: resError }, "acceptQuote reservation insert error");
    return { ok: false, error: "Erreur lors de la création de la réservation" };
  }

  const reservationId = String((reservation as any).id);

  // Update quote status
  await supabase
    .from("quote_requests")
    .update({
      status: "quote_accepted",
      converted_to_reservation_id: reservationId,
      updated_at: nowIso,
    })
    .eq("id", quoteId);

  // Notify pro
  const establishmentId = String(q.establishment_id);
  void notifyProMembers({
    supabase,
    establishmentId,
    category: "booking",
    title: "Devis accepté !",
    body: `Le client a accepté le devis pour ${q.party_size} personnes. Réservation créée.`,
    data: { action: "quote_accepted", quoteId, reservationId },
  });

  return { ok: true, quoteId, newStatus: "quote_accepted", reservationId };
}

/**
 * Client declines the quote.
 */
export async function declineQuote(args: {
  supabase: SupabaseClient;
  quoteId: string;
  userId: string;
}): Promise<QuoteActionResult> {
  const { supabase, quoteId, userId } = args;

  const { data: quote, error } = await supabase
    .from("quote_requests")
    .select("id, user_id, establishment_id, status")
    .eq("id", quoteId)
    .eq("user_id", userId)
    .single();

  if (error || !quote) {
    return { ok: false, error: "quote_not_found" };
  }

  if ((quote as any).status !== "quote_sent") {
    return { ok: false, error: `Cannot decline from status: ${(quote as any).status}` };
  }

  await supabase
    .from("quote_requests")
    .update({
      status: "quote_declined",
      updated_at: new Date().toISOString(),
    })
    .eq("id", quoteId);

  // Notify pro
  void notifyProMembers({
    supabase,
    establishmentId: String((quote as any).establishment_id),
    category: "booking",
    title: "Devis refusé",
    body: "Le client a refusé votre devis.",
    data: { action: "quote_declined", quoteId },
  });

  return { ok: true, quoteId, newStatus: "quote_declined" };
}

// =============================================================================
// 5. Messaging
// =============================================================================

/**
 * Send a message in the quote thread.
 */
export async function sendQuoteMessage(args: {
  supabase: SupabaseClient;
  quoteId: string;
  senderType: QuoteSenderType;
  senderId: string;
  content: string;
  attachments?: Array<{ url: string; filename: string; type: string; size: number }>;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const { supabase, quoteId, senderType, senderId, content, attachments } = args;

  if (!content || content.trim().length === 0) {
    return { ok: false, error: "Message vide" };
  }

  if (content.length > 5000) {
    return { ok: false, error: "Message trop long (max 5000 caractères)" };
  }

  // Verify quote exists and is not expired
  const { data: quote, error } = await supabase
    .from("quote_requests")
    .select("id, status")
    .eq("id", quoteId)
    .single();

  if (error || !quote) {
    return { ok: false, error: "quote_not_found" };
  }

  const status = String((quote as any).status);
  if (status === "expired" || status === "quote_declined") {
    return { ok: false, error: "Ce devis n'est plus actif" };
  }

  const { data: message, error: insertError } = await supabase
    .from("quote_messages")
    .insert({
      quote_request_id: quoteId,
      sender_type: senderType,
      sender_id: senderId,
      content: content.trim(),
      attachments: attachments || [],
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError) {
    log.error({ err: insertError }, "sendQuoteMessage insert error");
    return { ok: false, error: "Erreur lors de l'envoi du message" };
  }

  return { ok: true, messageId: String((message as any).id) };
}

// =============================================================================
// 6. Expire unacknowledged quotes (cron)
// =============================================================================

/**
 * Expire quote requests where pro didn't acknowledge within 48h.
 */
export async function expireUnacknowledgedQuotes(args: {
  supabase: SupabaseClient;
}): Promise<{ expired: number }> {
  const { supabase } = args;
  const nowIso = new Date().toISOString();

  const { data: expired, error } = await supabase
    .from("quote_requests")
    .update({
      status: "expired",
      updated_at: nowIso,
    })
    .eq("status", "submitted")
    .lt("acknowledge_deadline", nowIso)
    .select("id, user_id, establishment_id");

  if (error) {
    log.error({ err: error }, "expireUnacknowledgedQuotes error");
    return { expired: 0 };
  }

  // Notify clients
  for (const q of (expired ?? []) as Record<string, unknown>[]) {
    void notifyQuoteClient({
      supabase,
      userId: String(q.user_id),
      establishmentId: String(q.establishment_id),
      quoteId: String(q.id),
      templateKey: "reservation_quote_expired",
    });
  }

  return { expired: (expired ?? []).length };
}

/**
 * Expire quotes where pro acknowledged but didn't send quote within 7 days.
 */
export async function expireUnsentQuotes(args: {
  supabase: SupabaseClient;
}): Promise<{ expired: number }> {
  const { supabase } = args;
  const nowIso = new Date().toISOString();

  const { data: expired, error } = await supabase
    .from("quote_requests")
    .update({
      status: "expired",
      updated_at: nowIso,
    })
    .eq("status", "acknowledged")
    .lt("quote_deadline", nowIso)
    .select("id, user_id, establishment_id");

  if (error) {
    log.error({ err: error }, "expireUnsentQuotes error");
    return { expired: 0 };
  }

  for (const q of (expired ?? []) as Record<string, unknown>[]) {
    void notifyQuoteClient({
      supabase,
      userId: String(q.user_id),
      establishmentId: String(q.establishment_id),
      quoteId: String(q.id),
      templateKey: "reservation_quote_expired",
    });
  }

  return { expired: (expired ?? []).length };
}

// =============================================================================
// Notification helpers
// =============================================================================

async function notifyQuoteClient(args: {
  supabase: SupabaseClient;
  userId: string;
  establishmentId: string;
  quoteId: string;
  templateKey: string;
}): Promise<void> {
  try {
    const { data: user } = await args.supabase
      .from("consumer_users")
      .select("email, full_name")
      .eq("id", args.userId)
      .maybeSingle();

    const email = typeof (user as any)?.email === "string" ? String((user as any).email).trim() : "";
    if (!email) return;

    const { data: est } = await args.supabase
      .from("establishments")
      .select("name")
      .eq("id", args.establishmentId)
      .maybeSingle();

    await sendTemplateEmail({
      templateKey: args.templateKey,
      lang: "fr",
      fromKey: "noreply",
      to: [email],
      variables: {
        user_name: (user as any)?.full_name || "",
        establishment_name: (est as any)?.name || "",
      },
      meta: {
        source: "quoteRequestLogic",
        quote_id: args.quoteId,
      },
    });
  } catch (err) {
    log.error({ err }, "notifyQuoteClient error");
  }
}
