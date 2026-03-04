/**
 * Pro Messaging Handlers — extracted from pro.ts
 *
 * Covers:
 * - Conversations (list, get-or-create)
 * - Messages (list, send, attachments)
 * - Read receipts & unread marking
 * - Client messaging history
 * - Auto-reply settings
 */

import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";

import { getAdminSupabase } from "../supabaseAdmin";
import { notifyProMembers } from "../proNotifications";
import { emitAdminNotification } from "../adminNotifications";
import { emitConsumerUserEvent } from "../consumerNotifications";
import { NotificationEventType } from "../../shared/notifications";
import { createModuleLogger } from "../lib/logger";

import {
  parseBearerToken,
  getUserFromBearerToken,
  ensureRole,
  isRecord,
  asString,
} from "./proHelpers";

const log = createModuleLogger("proMessaging");

// =============================================================================
// CONVERSATIONS
// =============================================================================

export const listProConversations: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("pro_conversations")
    .select("*")
    .eq("establishment_id", establishmentId)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, conversations: data ?? [] });
};

export const listProConversationMessages: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const conversationId = typeof req.params.conversationId === "string" ? req.params.conversationId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!conversationId) return res.status(400).json({ error: "conversationId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("pro_messages")
    .select("*")
    .eq("establishment_id", establishmentId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(300);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, messages: data ?? [] });
};

export const sendProConversationMessage: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const conversationId = typeof req.params.conversationId === "string" ? req.params.conversationId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!conversationId) return res.status(400).json({ error: "conversationId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });
  const body = asString(req.body.body);
  if (!body) return res.status(400).json({ error: "body is required" });

  const supabase = getAdminSupabase();

  const { data: msg, error: msgErr } = await supabase
    .from("pro_messages")
    .insert({
      conversation_id: conversationId,
      establishment_id: establishmentId,
      from_role: "pro",
      body,
      sender_user_id: userResult.user.id,
      meta: {},
    })
    .select("*")
    .single();

  if (msgErr) return res.status(500).json({ error: msgErr.message });

  await supabase
    .from("pro_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("establishment_id", establishmentId);

  // Best-effort notifications (do not block the message).
  try {
    const { data: convo } = await supabase
      .from("pro_conversations")
      .select("subject,reservation_id")
      .eq("id", conversationId)
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    const subject = typeof (convo as any)?.subject === "string" ? String((convo as any).subject).trim() : "Conversation";
    const reservationId = typeof (convo as any)?.reservation_id === "string" ? String((convo as any).reservation_id).trim() : null;

    const snippet = body.length > 120 ? `${body.slice(0, 120)}…` : body;

    const title = "Nouveau message";
    const notifBody = `${subject} · ${snippet}`;

    await notifyProMembers({
      supabase,
      establishmentId,
      category: "messages",
      title,
      body: notifBody,
      excludeUserIds: [userResult.user.id],
      data: {
        conversationId,
        reservationId,
        action: "message_received",
        event_type: NotificationEventType.message_received,
      },
    });

    void emitAdminNotification({
      type: "message_received",
      title,
      body: notifBody,
      data: {
        establishmentId,
        conversationId,
        reservationId,
        event_type: NotificationEventType.message_received,
      },
    });

    if (reservationId) {
      const { data: resRow } = await supabase
        .from("reservations")
        .select("user_id,booking_reference")
        .eq("establishment_id", establishmentId)
        .eq("id", reservationId)
        .maybeSingle();

      const consumerUserId = typeof (resRow as any)?.user_id === "string" ? String((resRow as any).user_id).trim() : "";
      const bookingReference = typeof (resRow as any)?.booking_reference === "string" ? String((resRow as any).booking_reference).trim() : "";

      if (consumerUserId) {
        await emitConsumerUserEvent({
          supabase,
          userId: consumerUserId,
          eventType: NotificationEventType.message_received,
          metadata: {
            establishmentId,
            conversationId,
            reservationId,
            bookingReference: bookingReference || undefined,
            subject,
            snippet,
            from_role: "pro",
          },
        });
      }
    }
  } catch (err) {
    log.warn({ err }, "Best-effort: consumer notification for new pro message failed");
  }

  res.json({ ok: true, message: msg });
};

export const getOrCreateProConversationForReservation: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });
  const reservationId = asString(req.body.reservation_id);
  const subjectOverride = asString(req.body.subject);
  if (!reservationId) return res.status(400).json({ error: "reservation_id is required" });

  const supabase = getAdminSupabase();

  const { data: existing, error: findErr } = await supabase
    .from("pro_conversations")
    .select("*")
    .eq("establishment_id", establishmentId)
    .eq("reservation_id", reservationId)
    .limit(1)
    .maybeSingle();

  if (findErr) return res.status(500).json({ error: findErr.message });
  if ((existing as { id?: string } | null)?.id) return res.json({ ok: true, conversation: existing });

  const { data: reservation, error: resErr } = await supabase
    .from("reservations")
    .select("booking_reference")
    .eq("establishment_id", establishmentId)
    .eq("id", reservationId)
    .maybeSingle();

  if (resErr) return res.status(500).json({ error: resErr.message });

  const ref = (reservation as { booking_reference?: string | null } | null)?.booking_reference ?? reservationId.slice(0, 8);

  const { data: created, error: createErr } = await supabase
    .from("pro_conversations")
    .insert({
      establishment_id: establishmentId,
      reservation_id: reservationId,
      subject: subjectOverride ?? `Réservation ${ref}`,
      status: "open",
      meta: {},
    })
    .select("*")
    .single();

  if (createErr) return res.status(500).json({ error: createErr.message });

  res.json({ ok: true, conversation: created });
};

// =============================================================================
// CLIENT MESSAGING HISTORY & READ STATUS
// =============================================================================

/**
 * Get all conversations with a specific client (by user_id from reservation)
 * This allows pro to see the full history of exchanges with a client across all reservations
 */
export const listProClientHistory: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const clientUserId = typeof req.params.clientUserId === "string" ? req.params.clientUserId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!clientUserId) return res.status(400).json({ error: "clientUserId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  // Get all reservations from this client for this establishment
  const { data: reservations, error: resErr } = await supabase
    .from("reservations")
    .select("id, booking_reference, starts_at, party_size, status, customer_name, customer_email")
    .eq("establishment_id", establishmentId)
    .eq("user_id", clientUserId)
    .order("starts_at", { ascending: false })
    .limit(100);

  if (resErr) return res.status(500).json({ error: resErr.message });

  const reservationIds = (reservations ?? []).map((r: any) => r.id);

  if (reservationIds.length === 0) {
    return res.json({ ok: true, client: null, reservations: [], conversations: [], messages: [] });
  }

  // Get all conversations for these reservations
  const { data: conversations, error: convErr } = await supabase
    .from("pro_conversations")
    .select("*")
    .eq("establishment_id", establishmentId)
    .in("reservation_id", reservationIds)
    .order("updated_at", { ascending: false });

  if (convErr) return res.status(500).json({ error: convErr.message });

  const conversationIds = (conversations ?? []).map((c: any) => c.id);

  // Get all messages for these conversations
  let messages: any[] = [];
  if (conversationIds.length > 0) {
    const { data: msgs, error: msgErr } = await supabase
      .from("pro_messages")
      .select("*")
      .eq("establishment_id", establishmentId)
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: true })
      .limit(1000);

    if (msgErr) return res.status(500).json({ error: msgErr.message });
    messages = msgs ?? [];
  }

  // Get client info from first reservation
  const firstRes = reservations?.[0] as any;
  const client = firstRes
    ? {
        user_id: clientUserId,
        name: firstRes.customer_name || null,
        email: firstRes.customer_email || null,
        total_reservations: reservations?.length ?? 0,
      }
    : null;

  res.json({
    ok: true,
    client,
    reservations: reservations ?? [],
    conversations: conversations ?? [],
    messages,
  });
};

/**
 * Mark messages as read by the pro (when pro opens a conversation)
 * Also returns read status of messages sent by pro (read_by_client_at)
 */
export const markProMessagesRead: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const conversationId = typeof req.params.conversationId === "string" ? req.params.conversationId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!conversationId) return res.status(400).json({ error: "conversationId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();

  // Mark all client messages in this conversation as read by pro
  // Note: consumer messages use from_role "user" or "client" — match both
  const { error: updateErr } = await supabase
    .from("pro_messages")
    .update({ read_by_pro_at: nowIso })
    .eq("establishment_id", establishmentId)
    .eq("conversation_id", conversationId)
    .neq("from_role", "pro")
    .is("read_by_pro_at", null);

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  // Reset unread count on conversation
  await supabase
    .from("pro_conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId)
    .eq("establishment_id", establishmentId);

  res.json({ ok: true, marked_at: nowIso });
};

/**
 * Get message read receipts (who read what and when)
 */
export const getProMessageReadReceipts: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const conversationId = typeof req.params.conversationId === "string" ? req.params.conversationId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!conversationId) return res.status(400).json({ error: "conversationId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  // Get messages with read status
  const { data: messages, error } = await supabase
    .from("pro_messages")
    .select("id, from_role, read_by_pro_at, read_by_client_at, created_at")
    .eq("establishment_id", establishmentId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true, messages: messages ?? [] });
};

// =============================================================================
// AUTO-REPLY SETTINGS
// =============================================================================

/**
 * Get auto-reply settings for an establishment
 */
export const getProAutoReplySettings: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("pro_auto_reply_settings")
    .select("*")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") return res.status(500).json({ error: error.message });

  // Return default settings if none exist
  const settings = data ?? {
    id: null,
    establishment_id: establishmentId,
    enabled: false,
    message: "Bonjour, merci pour votre message. Nous sommes actuellement indisponibles mais nous vous répondrons dès que possible.",
    start_time: null,
    end_time: null,
    days_of_week: [],
    is_on_vacation: false,
    vacation_start: null,
    vacation_end: null,
    vacation_message: "Nous sommes actuellement en congés. Nous traiterons votre message à notre retour.",
    created_at: null,
    updated_at: null,
  };

  res.json({ ok: true, settings });
};

/**
 * Update auto-reply settings for an establishment
 */
export const updateProAutoReplySettings: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  if (!isRecord(req.body)) return res.status(400).json({ error: "Invalid body" });

  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();

  // Build update object from allowed fields
  const updateData: Record<string, unknown> = {
    establishment_id: establishmentId,
    updated_at: nowIso,
  };

  if (typeof req.body.enabled === "boolean") updateData.enabled = req.body.enabled;
  if (typeof req.body.message === "string") updateData.message = req.body.message.trim().slice(0, 1000);
  if (typeof req.body.start_time === "string" || req.body.start_time === null) updateData.start_time = req.body.start_time;
  if (typeof req.body.end_time === "string" || req.body.end_time === null) updateData.end_time = req.body.end_time;
  if (Array.isArray(req.body.days_of_week)) updateData.days_of_week = req.body.days_of_week.filter((d: unknown) => typeof d === "number" && d >= 0 && d <= 6);
  if (typeof req.body.is_on_vacation === "boolean") updateData.is_on_vacation = req.body.is_on_vacation;
  if (typeof req.body.vacation_start === "string" || req.body.vacation_start === null) updateData.vacation_start = req.body.vacation_start;
  if (typeof req.body.vacation_end === "string" || req.body.vacation_end === null) updateData.vacation_end = req.body.vacation_end;
  if (typeof req.body.vacation_message === "string") updateData.vacation_message = req.body.vacation_message.trim().slice(0, 1000);

  // Upsert settings
  const { data: existing } = await supabase
    .from("pro_auto_reply_settings")
    .select("id")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  let result;
  if ((existing as any)?.id) {
    const { data, error } = await supabase
      .from("pro_auto_reply_settings")
      .update(updateData)
      .eq("establishment_id", establishmentId)
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    result = data;
  } else {
    updateData.created_at = nowIso;
    const { data, error } = await supabase
      .from("pro_auto_reply_settings")
      .insert(updateData)
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });
    result = data;
  }

  res.json({ ok: true, settings: result });
};

// =============================================================================
// MESSAGE ATTACHMENT UPLOAD
// =============================================================================

const MESSAGE_ATTACHMENT_BUCKET = "message-attachments";

export const uploadMessageAttachment: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const conversationId = typeof req.params.conversationId === "string" ? req.params.conversationId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!conversationId) return res.status(400).json({ error: "conversationId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const file = (req as any).file;
  if (!file || !file.buffer) return res.status(400).json({ error: "No file uploaded" });

  const ext = (file.originalname || "file").split(".").pop() || "bin";
  const safeName = `${establishmentId}/${conversationId}/${Date.now()}_${randomUUID().slice(0, 8)}.${ext}`;

  const supabase = getAdminSupabase();

  const { error: uploadError } = await supabase.storage
    .from(MESSAGE_ATTACHMENT_BUCKET)
    .upload(safeName, file.buffer, {
      contentType: file.mimetype || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) return res.status(500).json({ error: uploadError.message });

  const { data: urlData } = supabase.storage
    .from(MESSAGE_ATTACHMENT_BUCKET)
    .getPublicUrl(safeName);

  res.json({
    ok: true,
    attachment: {
      url: urlData?.publicUrl ?? null,
      path: safeName,
      name: file.originalname || "file",
      size: file.size || 0,
      type: file.mimetype || "application/octet-stream",
    },
  });
};

// =============================================================================
// MARK CONVERSATION AS UNREAD
// =============================================================================

export const markProConversationUnread: RequestHandler = async (req, res) => {
  const establishmentId = typeof req.params.establishmentId === "string" ? req.params.establishmentId : "";
  const conversationId = typeof req.params.conversationId === "string" ? req.params.conversationId : "";
  if (!establishmentId) return res.status(400).json({ error: "establishmentId is required" });
  if (!conversationId) return res.status(400).json({ error: "conversationId is required" });

  const token = parseBearerToken(req.header("authorization") ?? undefined);
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false) return res.status(userResult.status).json({ error: userResult.error });

  const roleRes = await ensureRole({ establishmentId, userId: userResult.user.id });
  if (roleRes.ok === false) return res.status(roleRes.status).json({ error: roleRes.error });

  const supabase = getAdminSupabase();

  // Set unread_count to at least 1
  await supabase
    .from("pro_conversations")
    .update({ unread_count: 1 })
    .eq("id", conversationId)
    .eq("establishment_id", establishmentId);

  res.json({ ok: true });
};
