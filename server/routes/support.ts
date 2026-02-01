import type { RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";
import { requireAdminKey } from "./admin";

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

    // Update session timestamp
    await supabase
      .from("support_chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sessionId);

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

    // Update session
    await supabase
      .from("support_chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sessionId);

    res.json({ ok: true, message });
  } catch (e) {
    console.error("[sendAdminChatMessage] Exception:", e);
    res.status(500).json({ error: "Erreur inattendue" });
  }
};
