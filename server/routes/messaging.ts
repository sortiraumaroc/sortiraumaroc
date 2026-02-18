import type { Express, RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";

// ============================================================================
// HELPERS
// ============================================================================

function safeString(v: unknown, maxLen = 10000): string {
  if (typeof v !== "string") return "";
  return v.slice(0, maxLen).trim();
}

function safeInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

/** Extract authenticated userId from Bearer token */
async function getAuthUserId(req: { header: (name: string) => string | undefined }): Promise<string | null> {
  const authHeader = req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// ============================================================================
// CONVERSATIONS
// ============================================================================

/** GET /api/consumer/messages/conversations — list user's conversations */
const listConversations: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const supabase = getAdminSupabase();

    // Get all conversations where user is a participant
    const { data: participations, error: partError } = await supabase
      .from("dm_conversation_participants")
      .select("conversation_id, last_read_at, is_muted")
      .eq("user_id", userId);

    if (partError) {
      console.error("[messaging/listConversations] Error:", partError);
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    if (!participations || participations.length === 0) {
      res.json([]);
      return;
    }

    const conversationIds = participations.map((p: any) => p.conversation_id);

    // Get conversation details
    const { data: conversations } = await supabase
      .from("dm_conversations")
      .select("*")
      .in("id", conversationIds)
      .order("last_message_at", { ascending: false, nullsFirst: false });

    // Get other participants for each conversation
    const { data: allParticipants } = await supabase
      .from("dm_conversation_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", conversationIds)
      .neq("user_id", userId);

    // Build participation map for quick lookup
    const partMap = new Map<string, any>();
    for (const p of participations) {
      partMap.set(p.conversation_id, p);
    }

    // Build other participant map
    const otherParticipantMap = new Map<string, string>();
    for (const p of (allParticipants ?? [])) {
      otherParticipantMap.set(p.conversation_id, p.user_id);
    }

    // Count unread messages per conversation
    const enrichedConversations = await Promise.all(
      (conversations ?? []).map(async (conv: any) => {
        const myPart = partMap.get(conv.id);
        const otherUserId = otherParticipantMap.get(conv.id);

        // Count unread messages (messages created after last_read_at from other users)
        let unreadCount = 0;
        if (myPart?.last_read_at) {
          const { count } = await supabase
            .from("dm_messages")
            .select("*", { count: "exact", head: true })
            .eq("conversation_id", conv.id)
            .neq("sender_id", userId)
            .gt("created_at", myPart.last_read_at);
          unreadCount = count ?? 0;
        } else {
          // Never read — all messages from others are unread
          const { count } = await supabase
            .from("dm_messages")
            .select("*", { count: "exact", head: true })
            .eq("conversation_id", conv.id)
            .neq("sender_id", userId);
          unreadCount = count ?? 0;
        }

        // Get other user info
        let participant: any = { id: otherUserId || "", firstName: "", lastName: "" };
        if (otherUserId) {
          try {
            const { data: userData } = await supabase.auth.admin.getUserById(otherUserId);
            if (userData?.user) {
              const meta = userData.user.user_metadata ?? {};
              participant = {
                id: otherUserId,
                firstName: meta.first_name || meta.firstName || "",
                lastName: meta.last_name || meta.lastName || "",
                avatar: meta.avatar_url || meta.avatar || null,
              };
            }
          } catch {
            // Ignore user fetch errors
          }
        }

        return {
          id: conv.id,
          participant,
          lastMessage: conv.last_message_preview ? {
            content: conv.last_message_preview,
            createdAt: conv.last_message_at,
          } : undefined,
          unreadCount,
          updatedAt: conv.last_message_at || conv.updated_at || conv.created_at,
        };
      })
    );

    res.json(enrichedConversations);
  } catch (err) {
    console.error("[messaging/listConversations] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

/** POST /api/consumer/messages/conversations — create or get conversation with a user */
const createOrGetConversation: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const targetUserId = safeString(req.body?.userId);
    if (!targetUserId) {
      res.status(400).json({ error: "userId est requis" });
      return;
    }

    if (userId === targetUserId) {
      res.status(400).json({ error: "Impossible de créer une conversation avec soi-même" });
      return;
    }

    const supabase = getAdminSupabase();

    // Check if conversation already exists between these two users
    const { data: myConvs } = await supabase
      .from("dm_conversation_participants")
      .select("conversation_id")
      .eq("user_id", userId);

    const { data: theirConvs } = await supabase
      .from("dm_conversation_participants")
      .select("conversation_id")
      .eq("user_id", targetUserId);

    const myConvIds = new Set((myConvs ?? []).map((c: any) => c.conversation_id));
    const existingConvId = (theirConvs ?? []).find((c: any) => myConvIds.has(c.conversation_id))?.conversation_id;

    if (existingConvId) {
      // Return existing conversation
      const { data: conv } = await supabase
        .from("dm_conversations")
        .select("*")
        .eq("id", existingConvId)
        .single();

      res.json(conv);
      return;
    }

    // Create new conversation
    const { data: conv, error: convError } = await supabase
      .from("dm_conversations")
      .insert({})
      .select()
      .single();

    if (convError || !conv) {
      console.error("[messaging/createConversation] Error:", convError);
      res.status(500).json({ error: "Erreur lors de la création de la conversation" });
      return;
    }

    // Add both participants
    await supabase.from("dm_conversation_participants").insert([
      { conversation_id: conv.id, user_id: userId },
      { conversation_id: conv.id, user_id: targetUserId },
    ]);

    // Send initial message if provided
    const initialMessage = safeString(req.body?.initialMessage);
    if (initialMessage) {
      await supabase.from("dm_messages").insert({
        conversation_id: conv.id,
        sender_id: userId,
        content: initialMessage,
        message_type: "text",
      });

      await supabase
        .from("dm_conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: initialMessage.slice(0, 100),
        })
        .eq("id", conv.id);
    }

    res.status(201).json(conv);
  } catch (err) {
    console.error("[messaging/createConversation] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// MESSAGES
// ============================================================================

/** GET /api/consumer/messages/conversations/:id/messages — get messages in a conversation */
const getMessages: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const conversationId = req.params.id;
    const limit = safeInt(req.query.limit, 50);
    const after = safeString(req.query.after as string);

    const supabase = getAdminSupabase();

    // Verify user is a participant
    const { data: participant } = await supabase
      .from("dm_conversation_participants")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!participant) {
      res.status(403).json({ error: "Accès non autorisé à cette conversation" });
      return;
    }

    let query = supabase
      .from("dm_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (after) {
      query = query.gt("created_at", after);
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error("[messaging/getMessages] Error:", error);
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    // Return in chronological order (reversed from desc query)
    res.json((messages ?? []).reverse());
  } catch (err) {
    console.error("[messaging/getMessages] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

/** POST /api/consumer/messages/conversations/:id/messages — send a message */
const sendMessage: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const conversationId = req.params.id;
    const content = safeString(req.body?.content);
    const messageType = safeString(req.body?.messageType) || "text";
    const metadata = req.body?.metadata || null;

    if (!content) {
      res.status(400).json({ error: "Le contenu est requis" });
      return;
    }

    const supabase = getAdminSupabase();

    // Verify user is a participant
    const { data: participant } = await supabase
      .from("dm_conversation_participants")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!participant) {
      res.status(403).json({ error: "Accès non autorisé à cette conversation" });
      return;
    }

    // Insert message
    const { data: message, error } = await supabase
      .from("dm_messages")
      .insert({
        conversation_id: conversationId,
        sender_id: userId,
        content,
        message_type: messageType,
        metadata,
      })
      .select()
      .single();

    if (error) {
      console.error("[messaging/sendMessage] Error:", error);
      res.status(500).json({ error: "Erreur lors de l'envoi du message" });
      return;
    }

    // Update conversation last message
    await supabase
      .from("dm_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content.slice(0, 100),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    // Auto-mark as read for sender
    await supabase
      .from("dm_conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);

    res.status(201).json(message);
  } catch (err) {
    console.error("[messaging/sendMessage] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

/** POST /api/consumer/messages/conversations/:id/read — mark conversation as read */
const markAsRead: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const conversationId = req.params.id;
    const supabase = getAdminSupabase();

    const { error } = await supabase
      .from("dm_conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);

    if (error) {
      console.error("[messaging/markAsRead] Error:", error);
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[messaging/markAsRead] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

/** GET /api/consumer/messages/unread-count — total unread message count */
const getUnreadCount: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const supabase = getAdminSupabase();

    // Get all conversations
    const { data: participations } = await supabase
      .from("dm_conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", userId);

    if (!participations || participations.length === 0) {
      res.json({ count: 0 });
      return;
    }

    let totalUnread = 0;

    for (const part of participations) {
      if (part.last_read_at) {
        const { count } = await supabase
          .from("dm_messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", part.conversation_id)
          .neq("sender_id", userId)
          .gt("created_at", part.last_read_at);
        totalUnread += count ?? 0;
      } else {
        const { count } = await supabase
          .from("dm_messages")
          .select("*", { count: "exact", head: true })
          .eq("conversation_id", part.conversation_id)
          .neq("sender_id", userId);
        totalUnread += count ?? 0;
      }
    }

    res.json({ count: totalUnread });
  } catch (err) {
    console.error("[messaging/getUnreadCount] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// REGISTER
// ============================================================================

export function registerMessagingRoutes(app: Express) {
  // Conversations
  app.get("/api/consumer/messages/conversations", listConversations);
  app.post("/api/consumer/messages/conversations", createOrGetConversation);

  // Messages
  app.get("/api/consumer/messages/conversations/:id/messages", getMessages);
  app.post("/api/consumer/messages/conversations/:id/messages", sendMessage);

  // Read status
  app.post("/api/consumer/messages/conversations/:id/read", markAsRead);

  // Unread count
  app.get("/api/consumer/messages/unread-count", getUnreadCount);
}
