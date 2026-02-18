/**
 * Support System Cron Jobs
 *
 * 1. expireUnansweredChats — 5-min timeout: auto-message if no agent reply
 * 2. sendUnreadMessageEmails — email notification for unread messages > 15min
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { sendTemplateEmail } from "./emailService";

// ============================================================================
// 1. EXPIRE UNANSWERED CHATS (5-minute timer)
// ============================================================================

/**
 * Finds active chat sessions where:
 * - Client sent a message > 5 minutes ago
 * - No admin response since then
 * - Timeout message not yet sent
 *
 * Inserts a system message and marks session as pending.
 */
export async function expireUnansweredChats(): Promise<{ processed: number; errors: number }> {
  const supabase = getAdminSupabase();
  let processed = 0;
  let errors = 0;

  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Find sessions that need timeout
    const { data: sessions, error } = await supabase
      .from("support_chat_sessions")
      .select("id, user_id, last_client_message_at, last_admin_response_at")
      .eq("status", "active")
      .eq("timeout_message_sent", false)
      .not("last_client_message_at", "is", null)
      .lt("last_client_message_at", fiveMinAgo);

    if (error) {
      console.error("[expireUnansweredChats] Query error:", error);
      return { processed: 0, errors: 1 };
    }

    if (!sessions || sessions.length === 0) {
      return { processed: 0, errors: 0 };
    }

    for (const session of sessions) {
      try {
        // Check if admin responded after client's last message
        if (
          session.last_admin_response_at &&
          new Date(session.last_admin_response_at) > new Date(session.last_client_message_at)
        ) {
          continue; // Admin already responded, skip
        }

        // Insert system timeout message
        await supabase.from("support_chat_messages").insert({
          session_id: session.id,
          from_role: "system",
          body: "Nos agents ne sont pas disponibles actuellement. Votre message a été enregistré, nous vous répondrons dès que possible. Vous pouvez aussi créer un ticket pour un suivi plus détaillé.",
          message_type: "system",
        });

        // Mark session as timed out
        await supabase
          .from("support_chat_sessions")
          .update({
            timeout_message_sent: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", session.id);

        processed++;
      } catch (e) {
        console.error(`[expireUnansweredChats] Error processing session ${session.id}:`, e);
        errors++;
      }
    }
  } catch (e) {
    console.error("[expireUnansweredChats] Fatal error:", e);
    errors++;
  }

  console.log(`[expireUnansweredChats] Done: ${processed} processed, ${errors} errors`);
  return { processed, errors };
}

// ============================================================================
// 2. SEND UNREAD MESSAGE EMAILS (15-minute delay)
// ============================================================================

/**
 * Sends email notifications for unread support messages older than 15 minutes.
 *
 * - Admin messages unread by client → email to client
 * - Client messages unread by admin → (handled by admin in-app notifications already)
 */
export async function sendUnreadMessageEmails(): Promise<{ sent: number; errors: number }> {
  const supabase = getAdminSupabase();
  let sent = 0;
  let errors = 0;

  try {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // Find admin messages not read by user (older than 15 min)
    const { data: unreadMessages, error } = await supabase
      .from("support_ticket_messages")
      .select(`
        id,
        ticket_id,
        body,
        created_at
      `)
      .eq("from_role", "admin")
      .eq("is_internal", false)
      .is("read_by_user_at", null)
      .lt("created_at", fifteenMinAgo)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) {
      console.error("[sendUnreadMessageEmails] Query error:", error);
      return { sent: 0, errors: 1 };
    }

    if (!unreadMessages || unreadMessages.length === 0) {
      return { sent: 0, errors: 0 };
    }

    // Group by ticket to send one email per ticket
    const ticketIds = [...new Set(unreadMessages.map((m) => m.ticket_id))];

    for (const ticketId of ticketIds) {
      try {
        // Get ticket + check if email already sent recently
        const { data: ticket } = await supabase
          .from("support_tickets")
          .select("id, created_by_user_id, subject, ticket_number, last_email_notified_at")
          .eq("id", ticketId)
          .single();

        if (!ticket?.created_by_user_id) continue;

        // Rate limit: max 1 email per 15 min per ticket
        if (ticket.last_email_notified_at) {
          const lastNotified = new Date(ticket.last_email_notified_at).getTime();
          if (Date.now() - lastNotified < 15 * 60 * 1000) continue;
        }

        const { data: authData } = await supabase.auth.admin.getUserById(ticket.created_by_user_id);
        const email = authData?.user?.email;
        if (!email) continue;

        const clientName = authData?.user?.user_metadata?.full_name || "Client";
        const ticketMessages = unreadMessages.filter((m) => m.ticket_id === ticketId);
        const msgCount = ticketMessages.length;
        const preview = ticketMessages[0]?.body?.slice(0, 200) ?? "";

        await sendTemplateEmail({
          templateKey: "support_unread_messages",
          lang: "fr",
          fromKey: "support",
          to: [email],
          variables: {
            client_name: clientName,
            ticket_number: ticket.ticket_number || ticketId.slice(0, 8),
            ticket_subject: ticket.subject || "Support",
            message_count: String(msgCount),
            message_preview: preview,
          },
          ctaUrl: `${process.env.PUBLIC_BASE_URL || "https://sam.ma"}/aide`,
          ctaLabel: "Lire les messages",
        });

        // Update last notified timestamp
        await supabase
          .from("support_tickets")
          .update({ last_email_notified_at: new Date().toISOString() })
          .eq("id", ticketId);

        sent++;
      } catch (e) {
        console.error(`[sendUnreadMessageEmails] Error for ticket ${ticketId}:`, e);
        errors++;
      }
    }
  } catch (e) {
    console.error("[sendUnreadMessageEmails] Fatal error:", e);
    errors++;
  }

  console.log(`[sendUnreadMessageEmails] Done: ${sent} sent, ${errors} errors`);
  return { sent, errors };
}
