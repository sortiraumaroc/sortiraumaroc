import type { RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { requireAdminKey } from "./admin";
import { sendTemplateEmail } from "../emailService";
import { emitAdminNotification } from "../adminNotifications";

// ============================================================================
// TYPES
// ============================================================================

type TicketCategory =
  | "reservations"
  | "annulation"
  | "paiement_facturation"
  | "compte"
  | "technique"
  | "partenaires"
  | "autre";

type TicketPriority = "low" | "normal" | "high" | "urgent";
type TicketStatus = "open" | "pending" | "in_progress" | "closed";

type Attachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
};

// ============================================================================
// HELPERS
// ============================================================================

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function safeString(v: unknown, maxLen = 10000): string {
  if (typeof v !== "string") return "";
  return v.slice(0, maxLen).trim();
}

function safeCategory(v: unknown): TicketCategory {
  const valid: TicketCategory[] = [
    "reservations",
    "annulation",
    "paiement_facturation",
    "compte",
    "technique",
    "partenaires",
    "autre",
  ];
  return valid.includes(v as TicketCategory) ? (v as TicketCategory) : "autre";
}

function safePriority(v: unknown): TicketPriority {
  const valid: TicketPriority[] = ["low", "normal", "high", "urgent"];
  return valid.includes(v as TicketPriority) ? (v as TicketPriority) : "normal";
}

function safeStatus(v: unknown): TicketStatus {
  const valid: TicketStatus[] = ["open", "pending", "in_progress", "closed"];
  return valid.includes(v as TicketStatus) ? (v as TicketStatus) : "open";
}

// ============================================================================
// PUBLIC / CONSUMER ENDPOINTS
// ============================================================================

/**
 * List tickets for authenticated user
 * GET /api/support/tickets
 */
export const listSupportTickets: RequestHandler = async (req, res) => {
  try {
    const authHeader = req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Non autorisé" });
      return;
    }

    const token = authHeader.slice(7);
    const supabase = getAdminSupabase();

    // Get user from token
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      res.status(401).json({ error: "Token invalide" });
      return;
    }

    const userId = userData.user.id;

    // Fetch tickets
    const { data: tickets, error } = await supabase
      .from("support_tickets")
      .select(`
        id,
        subject,
        body,
        category,
        priority,
        status,
        attachments,
        created_at,
        updated_at,
        closed_at
      `)
      .eq("created_by_user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("[listSupportTickets] Error:", error);
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    // Get unread counts for each ticket
    const ticketsWithUnread = await Promise.all(
      (tickets ?? []).map(async (ticket) => {
        const { count } = await supabase
          .from("support_ticket_messages")
          .select("id", { count: "exact", head: true })
          .eq("ticket_id", ticket.id)
          .eq("from_role", "admin")
          .eq("is_internal", false)
          .is("read_by_user_at", null);

        return {
          ...ticket,
          unread_count: count ?? 0,
        };
      })
    );

    res.json({ ok: true, tickets: ticketsWithUnread });
  } catch (e) {
    console.error("[listSupportTickets] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

/**
 * Create a new support ticket
 * POST /api/support/tickets
 */
export const createSupportTicket: RequestHandler = async (req, res) => {
  try {
    const authHeader = req.header("authorization");
    let userId: string | null = null;
    let userRole: "user" | "pro" = "user";

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const supabase = getAdminSupabase();
      const { data: userData } = await supabase.auth.getUser(token);
      if (userData?.user) {
        userId = userData.user.id;
      }
    }

    const body = isRecord(req.body) ? req.body : {};
    const subject = safeString(body.subject, 200);
    const message = safeString(body.message, 10000);
    const category = safeCategory(body.category);
    const priority = safePriority(body.priority);
    const establishmentId = safeString(body.establishment_id, 100) || null;
    const contactEmail = safeString(body.contact_email, 200) || null;
    const contactName = safeString(body.contact_name, 200) || null;
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    // Check if it's a pro user
    if (establishmentId) {
      userRole = "pro";
    }

    if (!subject) {
      res.status(400).json({ error: "Sujet requis" });
      return;
    }

    if (!message) {
      res.status(400).json({ error: "Message requis" });
      return;
    }

    const supabase = getAdminSupabase();

    // Create the ticket
    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .insert({
        created_by_user_id: userId,
        created_by_role: userRole,
        establishment_id: establishmentId,
        subject,
        body: message,
        category,
        priority,
        status: "open",
        contact_email: contactEmail,
        contact_name: contactName,
        attachments,
      })
      .select()
      .single();

    if (error) {
      console.error("[createSupportTicket] Error:", error);
      res.status(500).json({ error: "Erreur lors de la création du ticket" });
      return;
    }

    res.json({ ok: true, ticket });
  } catch (e) {
    console.error("[createSupportTicket] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

/**
 * Get ticket details with messages
 * GET /api/support/tickets/:id
 */
export const getSupportTicket: RequestHandler = async (req, res) => {
  try {
    const ticketId = req.params.id;
    if (!ticketId) {
      res.status(400).json({ error: "ID ticket requis" });
      return;
    }

    const authHeader = req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Non autorisé" });
      return;
    }

    const token = authHeader.slice(7);
    const supabase = getAdminSupabase();

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      res.status(401).json({ error: "Token invalide" });
      return;
    }

    const userId = userData.user.id;

    // Fetch ticket
    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("id", ticketId)
      .eq("created_by_user_id", userId)
      .single();

    if (ticketError || !ticket) {
      res.status(404).json({ error: "Ticket introuvable" });
      return;
    }

    // Fetch messages (exclude internal notes)
    const { data: messages, error: messagesError } = await supabase
      .from("support_ticket_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .eq("is_internal", false)
      .order("created_at", { ascending: true });

    if (messagesError) {
      console.error("[getSupportTicket] Messages error:", messagesError);
    }

    // Mark messages as read
    await supabase
      .from("support_ticket_messages")
      .update({ read_by_user_at: new Date().toISOString() })
      .eq("ticket_id", ticketId)
      .eq("from_role", "admin")
      .is("read_by_user_at", null);

    res.json({ ok: true, ticket, messages: messages ?? [] });
  } catch (e) {
    console.error("[getSupportTicket] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

/**
 * Add message to ticket
 * POST /api/support/tickets/:id/messages
 */
export const addSupportTicketMessage: RequestHandler = async (req, res) => {
  try {
    const ticketId = req.params.id;
    if (!ticketId) {
      res.status(400).json({ error: "ID ticket requis" });
      return;
    }

    const authHeader = req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Non autorisé" });
      return;
    }

    const token = authHeader.slice(7);
    const supabase = getAdminSupabase();

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      res.status(401).json({ error: "Token invalide" });
      return;
    }

    const userId = userData.user.id;

    // Verify ownership
    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("id, status, created_by_role")
      .eq("id", ticketId)
      .eq("created_by_user_id", userId)
      .single();

    if (ticketError || !ticket) {
      res.status(404).json({ error: "Ticket introuvable" });
      return;
    }

    if (ticket.status === "closed") {
      res.status(400).json({ error: "Ce ticket est fermé" });
      return;
    }

    const body = isRecord(req.body) ? req.body : {};
    const messageBody = safeString(body.body, 10000);
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    if (!messageBody) {
      res.status(400).json({ error: "Message requis" });
      return;
    }

    // Insert message
    const { data: message, error: messageError } = await supabase
      .from("support_ticket_messages")
      .insert({
        ticket_id: ticketId,
        from_role: ticket.created_by_role || "user",
        sender_user_id: userId,
        body: messageBody,
        attachments,
        is_internal: false,
      })
      .select()
      .single();

    if (messageError) {
      console.error("[addSupportTicketMessage] Error:", messageError);
      res.status(500).json({ error: "Erreur lors de l'envoi du message" });
      return;
    }

    // Update ticket timestamp and reopen if pending
    await supabase
      .from("support_tickets")
      .update({
        updated_at: new Date().toISOString(),
        status: ticket.status === "pending" ? "open" : ticket.status,
      })
      .eq("id", ticketId);

    // Notify admin of new client message (best-effort, non-blocking)
    void (async () => {
      try {
        const { data: ticketData } = await supabase
          .from("support_tickets")
          .select("subject, ticket_number")
          .eq("id", ticketId)
          .single();

        const { data: authData } = await supabase.auth.admin.getUserById(userId);
        const clientName = authData?.user?.user_metadata?.full_name || "Client";

        void notifyAdminOfClientMessage(ticketId, clientName, ticketData?.subject || "Support");
      } catch { /* best-effort */ }
    })();

    res.json({ ok: true, message });
  } catch (e) {
    console.error("[addSupportTicketMessage] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

/**
 * Update ticket status (user can only close their own tickets)
 * PATCH /api/support/tickets/:id
 */
export const updateSupportTicketStatus: RequestHandler = async (req, res) => {
  try {
    const ticketId = req.params.id;
    if (!ticketId) {
      res.status(400).json({ error: "ID ticket requis" });
      return;
    }

    const authHeader = req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Non autorisé" });
      return;
    }

    const token = authHeader.slice(7);
    const supabase = getAdminSupabase();

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      res.status(401).json({ error: "Token invalide" });
      return;
    }

    const userId = userData.user.id;

    // Verify ownership
    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("id, status")
      .eq("id", ticketId)
      .eq("created_by_user_id", userId)
      .single();

    if (ticketError || !ticket) {
      res.status(404).json({ error: "Ticket introuvable" });
      return;
    }

    const body = isRecord(req.body) ? req.body : {};
    const newStatus = safeStatus(body.status);

    // Users can only close or reopen their tickets
    if (newStatus !== "closed" && newStatus !== "open") {
      res.status(400).json({ error: "Statut non autorisé" });
      return;
    }

    const updateData: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === "closed") {
      updateData.closed_at = new Date().toISOString();
    } else {
      updateData.closed_at = null;
    }

    const { error: updateError } = await supabase
      .from("support_tickets")
      .update(updateData)
      .eq("id", ticketId);

    if (updateError) {
      console.error("[updateSupportTicketStatus] Error:", updateError);
      res.status(500).json({ error: "Erreur lors de la mise à jour" });
      return;
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("[updateSupportTicketStatus] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

// ============================================================================
// CHAT ENDPOINTS
// ============================================================================

/**
 * Get or create active chat session
 * POST /api/support/chat/session
 */
export const getOrCreateChatSession: RequestHandler = async (req, res) => {
  try {
    const authHeader = req.header("authorization");
    let userId: string | null = null;
    let userRole: "user" | "pro" = "user";

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const supabase = getAdminSupabase();
      const { data: userData } = await supabase.auth.getUser(token);
      if (userData?.user) {
        userId = userData.user.id;
      }
    }

    if (!userId) {
      res.status(401).json({ error: "Authentification requise pour le chat" });
      return;
    }

    const body = isRecord(req.body) ? req.body : {};
    const establishmentId = safeString(body.establishment_id, 100) || null;

    if (establishmentId) {
      userRole = "pro";
    }

    const supabase = getAdminSupabase();

    // Check for existing active session
    const { data: existingSession } = await supabase
      .from("support_chat_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    if (existingSession) {
      // Fetch messages
      const { data: messages } = await supabase
        .from("support_chat_messages")
        .select("*")
        .eq("session_id", existingSession.id)
        .order("created_at", { ascending: true });

      res.json({ ok: true, session: existingSession, messages: messages ?? [] });
      return;
    }

    // Create new session
    const { data: newSession, error } = await supabase
      .from("support_chat_sessions")
      .insert({
        user_id: userId,
        user_role: userRole,
        establishment_id: establishmentId,
        status: "active",
      })
      .select()
      .single();

    if (error) {
      console.error("[getOrCreateChatSession] Error:", error);
      res.status(500).json({ error: "Erreur lors de la création de la session" });
      return;
    }

    res.json({ ok: true, session: newSession, messages: [] });
  } catch (e) {
    console.error("[getOrCreateChatSession] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

/**
 * Send chat message
 * POST /api/support/chat/messages
 */
export const sendChatMessage: RequestHandler = async (req, res) => {
  try {
    const authHeader = req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Non autorisé" });
      return;
    }

    const token = authHeader.slice(7);
    const supabase = getAdminSupabase();

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      res.status(401).json({ error: "Token invalide" });
      return;
    }

    const userId = userData.user.id;

    const body = isRecord(req.body) ? req.body : {};
    const sessionId = safeString(body.session_id, 100);
    const messageBody = safeString(body.body, 4000);

    if (!sessionId) {
      res.status(400).json({ error: "Session ID requis" });
      return;
    }

    if (!messageBody) {
      res.status(400).json({ error: "Message requis" });
      return;
    }

    // Verify session ownership
    const { data: session, error: sessionError } = await supabase
      .from("support_chat_sessions")
      .select("id, status, user_role")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();

    if (sessionError || !session) {
      res.status(404).json({ error: "Session introuvable" });
      return;
    }

    if (session.status === "closed") {
      res.status(400).json({ error: "Cette session est fermée" });
      return;
    }

    // Insert message
    const { data: message, error: messageError } = await supabase
      .from("support_chat_messages")
      .insert({
        session_id: sessionId,
        from_role: session.user_role || "user",
        sender_user_id: userId,
        body: messageBody,
        message_type: "message",
      })
      .select()
      .single();

    if (messageError) {
      console.error("[sendChatMessage] Error:", messageError);
      res.status(500).json({ error: "Erreur lors de l'envoi du message" });
      return;
    }

    // Update session timestamp + last client message time (for 5-min timer)
    await supabase
      .from("support_chat_sessions")
      .update({
        updated_at: new Date().toISOString(),
        last_client_message_at: new Date().toISOString(),
        timeout_message_sent: false, // reset timeout flag on new client message
      })
      .eq("id", sessionId);

    // Notify admin of new chat message (best-effort)
    void emitAdminNotification({
      type: "support_chat_message",
      title: "Nouveau message chat support",
      body: messageBody.slice(0, 100),
      data: { session_id: sessionId },
    }).catch(() => {});

    res.json({ ok: true, message });
  } catch (e) {
    console.error("[sendChatMessage] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

/**
 * Get chat messages (polling)
 * GET /api/support/chat/:sessionId/messages
 */
export const getChatMessages: RequestHandler = async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    if (!sessionId) {
      res.status(400).json({ error: "Session ID requis" });
      return;
    }

    const authHeader = req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Non autorisé" });
      return;
    }

    const token = authHeader.slice(7);
    const supabase = getAdminSupabase();

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      res.status(401).json({ error: "Token invalide" });
      return;
    }

    const userId = userData.user.id;

    // Verify session ownership
    const { data: session, error: sessionError } = await supabase
      .from("support_chat_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();

    if (sessionError || !session) {
      res.status(404).json({ error: "Session introuvable" });
      return;
    }

    // Optional: get messages after a certain timestamp
    const afterParam = req.query.after;
    const after = typeof afterParam === "string" ? afterParam : null;

    let query = supabase
      .from("support_chat_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (after) {
      query = query.gt("created_at", after);
    }

    const { data: messages, error: messagesError } = await query;

    if (messagesError) {
      console.error("[getChatMessages] Error:", messagesError);
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    res.json({ ok: true, messages: messages ?? [] });
  } catch (e) {
    console.error("[getChatMessages] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * List all support tickets (admin)
 * GET /api/admin/support/tickets
 */
export const listAdminSupportTickets: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();

    const status = req.query.status as string | undefined;
    const priority = req.query.priority as string | undefined;
    const role = req.query.role as string | undefined;
    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);

    let query = supabase
      .from("support_tickets")
      .select(`
        *,
        establishments:establishment_id (id, name)
      `)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (priority && priority !== "all") {
      query = query.eq("priority", priority);
    }

    if (role && role !== "all") {
      query = query.eq("created_by_role", role);
    }

    const { data: tickets, error } = await query;

    if (error) {
      console.error("[listAdminSupportTickets] Error:", error);
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    // Get unread counts
    const ticketsWithUnread = await Promise.all(
      (tickets ?? []).map(async (ticket) => {
        const { count } = await supabase
          .from("support_ticket_messages")
          .select("id", { count: "exact", head: true })
          .eq("ticket_id", ticket.id)
          .in("from_role", ["user", "pro"])
          .is("read_by_admin_at", null);

        return {
          ...ticket,
          unread_count: count ?? 0,
        };
      })
    );

    res.json({ ok: true, items: ticketsWithUnread });
  } catch (e) {
    console.error("[listAdminSupportTickets] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

/**
 * Get ticket details (admin)
 * GET /api/admin/support/tickets/:id
 */
export const getAdminSupportTicket: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const ticketId = req.params.id;
    if (!ticketId) {
      res.status(400).json({ error: "ID ticket requis" });
      return;
    }

    const supabase = getAdminSupabase();

    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .select(`
        *,
        establishments:establishment_id (id, name)
      `)
      .eq("id", ticketId)
      .single();

    if (error || !ticket) {
      res.status(404).json({ error: "Ticket introuvable" });
      return;
    }

    res.json({ ok: true, item: ticket });
  } catch (e) {
    console.error("[getAdminSupportTicket] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

/**
 * List ticket messages (admin)
 * GET /api/admin/support/tickets/:id/messages
 */
export const listAdminSupportTicketMessages: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const ticketId = req.params.id;
    if (!ticketId) {
      res.status(400).json({ error: "ID ticket requis" });
      return;
    }

    const supabase = getAdminSupabase();

    const { data: messages, error } = await supabase
      .from("support_ticket_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[listAdminSupportTicketMessages] Error:", error);
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    // Mark as read by admin
    await supabase
      .from("support_ticket_messages")
      .update({ read_by_admin_at: new Date().toISOString() })
      .eq("ticket_id", ticketId)
      .in("from_role", ["user", "pro"])
      .is("read_by_admin_at", null);

    res.json({ ok: true, items: messages ?? [] });
  } catch (e) {
    console.error("[listAdminSupportTicketMessages] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

/**
 * Post admin reply to ticket
 * POST /api/admin/support/tickets/:id/messages
 */
export const postAdminSupportTicketMessage: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const ticketId = req.params.id;
    if (!ticketId) {
      res.status(400).json({ error: "ID ticket requis" });
      return;
    }

    const body = isRecord(req.body) ? req.body : {};
    const messageBody = safeString(body.body, 10000);
    const isInternal = body.is_internal === true;

    if (!messageBody) {
      res.status(400).json({ error: "Message requis" });
      return;
    }

    const supabase = getAdminSupabase();

    // Verify ticket exists
    const { data: ticket, error: ticketError } = await supabase
      .from("support_tickets")
      .select("id")
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      res.status(404).json({ error: "Ticket introuvable" });
      return;
    }

    // Get admin session info if available
    const adminSession = (req as any).adminSession;
    const collaboratorId = adminSession?.collaborator_id ?? null;

    // Insert message
    const { data: message, error: messageError } = await supabase
      .from("support_ticket_messages")
      .insert({
        ticket_id: ticketId,
        from_role: "admin",
        sender_collaborator_id: collaboratorId,
        body: messageBody,
        is_internal: isInternal,
      })
      .select()
      .single();

    if (messageError) {
      console.error("[postAdminSupportTicketMessage] Error:", messageError);
      res.status(500).json({ error: "Erreur lors de l'envoi du message" });
      return;
    }

    // Update ticket timestamp
    await supabase
      .from("support_tickets")
      .update({
        updated_at: new Date().toISOString(),
        status: "in_progress",
      })
      .eq("id", ticketId);

    // Send email notification to client (best-effort, non-blocking)
    if (!isInternal) {
      void notifyClientOfAdminReply(ticketId, messageBody);
    }

    res.json({ ok: true, message });
  } catch (e) {
    console.error("[postAdminSupportTicketMessage] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

/**
 * Update ticket (admin)
 * PATCH /api/admin/support/tickets/:id
 */
export const updateAdminSupportTicket: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const ticketId = req.params.id;
    if (!ticketId) {
      res.status(400).json({ error: "ID ticket requis" });
      return;
    }

    const body = isRecord(req.body) ? req.body : {};
    const supabase = getAdminSupabase();

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.status !== undefined) {
      updateData.status = safeStatus(body.status);
      if (updateData.status === "closed") {
        updateData.closed_at = new Date().toISOString();
      }
    }

    if (body.priority !== undefined) {
      updateData.priority = safePriority(body.priority);
    }

    if (body.assigned_to_collaborator_id !== undefined) {
      updateData.assigned_to_collaborator_id = body.assigned_to_collaborator_id || null;
    }

    const { error } = await supabase
      .from("support_tickets")
      .update(updateData)
      .eq("id", ticketId);

    if (error) {
      console.error("[updateAdminSupportTicket] Error:", error);
      res.status(500).json({ error: "Erreur lors de la mise à jour" });
      return;
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("[updateAdminSupportTicket] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

/**
 * List active chat sessions (admin)
 * GET /api/admin/support/chat/sessions
 */
export const listAdminChatSessions: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const supabase = getAdminSupabase();
    const status = req.query.status as string | undefined;

    let query = supabase
      .from("support_chat_sessions")
      .select(`
        *,
        establishments:establishment_id (id, name)
      `)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (status && status !== "all") {
      query = query.eq("status", status);
    } else {
      query = query.eq("status", "active");
    }

    const { data: sessions, error } = await query;

    if (error) {
      console.error("[listAdminChatSessions] Error:", error);
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    res.json({ ok: true, items: sessions ?? [] });
  } catch (e) {
    console.error("[listAdminChatSessions] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

/**
 * Get chat session messages (admin)
 * GET /api/admin/support/chat/:sessionId/messages
 */
export const getAdminChatMessages: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const sessionId = req.params.sessionId;
    if (!sessionId) {
      res.status(400).json({ error: "Session ID requis" });
      return;
    }

    const supabase = getAdminSupabase();

    const { data: messages, error } = await supabase
      .from("support_chat_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[getAdminChatMessages] Error:", error);
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    res.json({ ok: true, items: messages ?? [] });
  } catch (e) {
    console.error("[getAdminChatMessages] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

/**
 * Send admin chat message
 * POST /api/admin/support/chat/:sessionId/messages
 */
export const sendAdminChatMessage: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const sessionId = req.params.sessionId;
    if (!sessionId) {
      res.status(400).json({ error: "Session ID requis" });
      return;
    }

    const body = isRecord(req.body) ? req.body : {};
    const messageBody = safeString(body.body, 4000);

    if (!messageBody) {
      res.status(400).json({ error: "Message requis" });
      return;
    }

    const supabase = getAdminSupabase();

    // Verify session exists
    const { data: session, error: sessionError } = await supabase
      .from("support_chat_sessions")
      .select("id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      res.status(404).json({ error: "Session introuvable" });
      return;
    }

    // Get admin info
    const adminSession = (req as any).adminSession;
    const collaboratorId = adminSession?.collaborator_id ?? null;

    // Insert message
    const { data: message, error: messageError } = await supabase
      .from("support_chat_messages")
      .insert({
        session_id: sessionId,
        from_role: "admin",
        sender_collaborator_id: collaboratorId,
        body: messageBody,
        message_type: "message",
      })
      .select()
      .single();

    if (messageError) {
      console.error("[sendAdminChatMessage] Error:", messageError);
      res.status(500).json({ error: "Erreur lors de l'envoi du message" });
      return;
    }

    // Update session + track admin response time (resets 5-min timer)
    await supabase
      .from("support_chat_sessions")
      .update({
        updated_at: new Date().toISOString(),
        last_admin_response_at: new Date().toISOString(),
        timeout_message_sent: false,
      })
      .eq("id", sessionId);

    res.json({ ok: true, message });
  } catch (e) {
    console.error("[sendAdminChatMessage] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

// ============================================================================
// AGENT ONLINE STATUS
// ============================================================================

/**
 * Check if any support agent is online
 * GET /api/support/agent-online
 */
export const checkAgentOnline: RequestHandler = async (_req, res) => {
  try {
    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("support_agent_status")
      .select("agent_id, agent_name")
      .eq("is_online", true)
      .gte("last_seen_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .limit(1);

    if (error) {
      console.error("[checkAgentOnline] Error:", error);
      res.json({ ok: true, online: false });
      return;
    }

    res.json({ ok: true, online: (data?.length ?? 0) > 0 });
  } catch (e) {
    console.error("[checkAgentOnline] Exception:", e);
    res.json({ ok: true, online: false });
  }
};

/**
 * Toggle agent online/offline status (admin)
 * POST /api/admin/support/agent-status
 */
export const toggleAgentStatus: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const body = isRecord(req.body) ? req.body : {};
    const isOnline = body.is_online === true;

    const adminSession = (req as any).adminSession;
    const agentId = adminSession?.collaborator_id ?? adminSession?.user_id;
    const agentName = safeString(body.agent_name, 200) || adminSession?.name || "Agent";

    if (!agentId) {
      res.status(400).json({ error: "Agent ID manquant" });
      return;
    }

    const supabase = getAdminSupabase();

    await supabase
      .from("support_agent_status")
      .upsert({
        agent_id: agentId,
        agent_name: agentName,
        is_online: isOnline,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "agent_id" });

    res.json({ ok: true, is_online: isOnline });
  } catch (e) {
    console.error("[toggleAgentStatus] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

// ============================================================================
// CLIENT / ESTABLISHMENT PROFILE (admin)
// ============================================================================

/**
 * Get consumer user profile for support sidebar
 * GET /api/admin/support/client-profile/:userId
 */
export const getClientProfile: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const userId = req.params.userId;
    if (!userId) {
      res.status(400).json({ error: "userId requis" });
      return;
    }

    const supabase = getAdminSupabase();

    // Get user from auth
    const { data: authData } = await supabase.auth.admin.getUserById(userId);
    const meta = authData?.user?.user_metadata ?? {};

    // Get consumer_users data
    const { data: consumerData } = await supabase
      .from("consumer_users")
      .select("*")
      .eq("id", userId)
      .single();

    // Get reservation stats
    const { count: totalBookings } = await supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    const { data: lastBooking } = await supabase
      .from("reservations")
      .select("date")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(1)
      .single();

    // Get consumer stats
    const { data: stats } = await supabase
      .from("consumer_user_stats")
      .select("*")
      .eq("user_id", userId)
      .single();

    // Get previous support tickets
    const { data: prevTickets } = await supabase
      .from("support_tickets")
      .select("id, ticket_number, subject, status, category, created_at")
      .eq("created_by_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    const profile = {
      id: userId,
      type: "user" as const,
      name: meta.full_name || meta.name || consumerData?.full_name || "—",
      email: authData?.user?.email ?? consumerData?.email ?? "—",
      phone: meta.phone || consumerData?.phone || "—",
      city: consumerData?.city || meta.city || "—",
      member_since: authData?.user?.created_at ?? "—",
      total_bookings: totalBookings ?? 0,
      last_booking: lastBooking?.date ?? null,
      loyalty_points: stats?.points ?? 0,
      reliability_score: stats?.reliability_score ?? null,
      referrals: stats?.referral_count ?? 0,
      preferred_categories: consumerData?.preferred_categories ?? [],
      status: consumerData?.status ?? "active",
      notes: consumerData?.admin_notes ?? "",
      previous_tickets: prevTickets ?? [],
    };

    res.json({ ok: true, profile });
  } catch (e) {
    console.error("[getClientProfile] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

/**
 * Get establishment profile for support sidebar
 * GET /api/admin/support/establishment-profile/:establishmentId
 */
export const getEstablishmentProfile: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const estId = req.params.establishmentId;
    if (!estId) {
      res.status(400).json({ error: "establishmentId requis" });
      return;
    }

    const supabase = getAdminSupabase();

    // Get establishment
    const { data: est } = await supabase
      .from("establishments")
      .select("*")
      .eq("id", estId)
      .single();

    if (!est) {
      res.status(404).json({ error: "Établissement introuvable" });
      return;
    }

    // Get reservation stats
    const { count: totalBookingsReceived } = await supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", estId);

    // Get average rating
    const { data: ratingData } = await supabase
      .from("reviews")
      .select("overall_score")
      .eq("establishment_id", estId)
      .eq("status", "published");

    const avgRating = ratingData && ratingData.length > 0
      ? Math.round((ratingData.reduce((sum: number, r: any) => sum + (r.overall_score || 0), 0) / ratingData.length) * 10) / 10
      : null;

    // Get primary contact (owner)
    const { data: members } = await supabase
      .from("pro_establishment_memberships")
      .select("user_id, role")
      .eq("establishment_id", estId)
      .eq("role", "owner")
      .limit(1);

    let contactName = "—";
    let contactEmail = "—";
    if (members && members.length > 0) {
      const { data: ownerAuth } = await supabase.auth.admin.getUserById(members[0].user_id);
      contactName = ownerAuth?.user?.user_metadata?.full_name ?? "—";
      contactEmail = ownerAuth?.user?.email ?? "—";
    }

    // Get previous support tickets
    const { data: prevTickets } = await supabase
      .from("support_tickets")
      .select("id, ticket_number, subject, status, category, created_at")
      .eq("establishment_id", estId)
      .order("created_at", { ascending: false })
      .limit(10);

    const profile = {
      id: estId,
      type: "pro" as const,
      name: est.name ?? "—",
      category: est.category ?? "—",
      contact: contactName,
      email: contactEmail,
      phone: est.phone ?? "—",
      city: est.city ?? "—",
      address: est.address ?? "—",
      member_since: est.created_at ?? "—",
      total_bookings_received: totalBookingsReceived ?? 0,
      average_rating: avgRating,
      status: est.status ?? "—",
      commission: est.commission_rate ?? "—",
      subscription: est.subscription_plan ?? "—",
      last_activity: est.updated_at ?? "—",
      notes: est.admin_notes ?? "",
      previous_tickets: prevTickets ?? [],
    };

    res.json({ ok: true, profile });
  } catch (e) {
    console.error("[getEstablishmentProfile] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

// ============================================================================
// INTERNAL NOTES (persistent, editable)
// ============================================================================

/**
 * Update ticket internal notes
 * PATCH /api/admin/support/tickets/:id/notes
 */
export const updateTicketInternalNotes: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const ticketId = req.params.id;
    if (!ticketId) {
      res.status(400).json({ error: "ID ticket requis" });
      return;
    }

    const body = isRecord(req.body) ? req.body : {};
    const notes = safeString(body.notes, 10000);

    const supabase = getAdminSupabase();

    const { error } = await supabase
      .from("support_tickets")
      .update({ internal_notes: notes })
      .eq("id", ticketId);

    if (error) {
      console.error("[updateTicketInternalNotes] Error:", error);
      res.status(500).json({ error: "Erreur lors de la mise à jour" });
      return;
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("[updateTicketInternalNotes] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};

// ============================================================================
// EMAIL NOTIFICATIONS (best-effort, fire-and-forget)
// ============================================================================

/**
 * Send email notification to client when admin replies to their ticket
 */
async function notifyClientOfAdminReply(ticketId: string, messagePreview: string): Promise<void> {
  try {
    const supabase = getAdminSupabase();

    const { data: ticket } = await supabase
      .from("support_tickets")
      .select("created_by_user_id, subject, ticket_number, last_email_notified_at")
      .eq("id", ticketId)
      .single();

    if (!ticket?.created_by_user_id) return;

    // Rate limit: no more than 1 email per 5 minutes per ticket
    if (ticket.last_email_notified_at) {
      const lastNotified = new Date(ticket.last_email_notified_at).getTime();
      if (Date.now() - lastNotified < 5 * 60 * 1000) return;
    }

    const { data: authData } = await supabase.auth.admin.getUserById(ticket.created_by_user_id);
    const email = authData?.user?.email;
    if (!email) return;

    const clientName = authData?.user?.user_metadata?.full_name || "Client";

    await sendTemplateEmail({
      templateKey: "support_admin_reply",
      lang: "fr",
      fromKey: "support",
      to: [email],
      variables: {
        client_name: clientName,
        ticket_number: ticket.ticket_number || ticketId.slice(0, 8),
        ticket_subject: ticket.subject || "Support",
        message_preview: messagePreview.slice(0, 200),
      },
      ctaUrl: `${process.env.PUBLIC_BASE_URL || "https://sam.ma"}/aide`,
      ctaLabel: "Voir ma conversation",
    });

    // Update last notified
    await supabase
      .from("support_tickets")
      .update({ last_email_notified_at: new Date().toISOString() })
      .eq("id", ticketId);
  } catch (e) {
    console.error("[notifyClientOfAdminReply] Error (non-blocking):", e);
  }
}

/**
 * Send admin notification when client sends a message
 */
async function notifyAdminOfClientMessage(ticketId: string, clientName: string, subject: string): Promise<void> {
  try {
    void emitAdminNotification({
      type: "support_new_message",
      title: `Nouveau message support — ${clientName}`,
      body: subject,
      data: { ticket_id: ticketId },
    });
  } catch (e) {
    console.error("[notifyAdminOfClientMessage] Error (non-blocking):", e);
  }
}
