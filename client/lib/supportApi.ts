/**
 * Support API - Client-side functions for support tickets and chat
 */

import { consumerSupabase } from "./supabase";
import { proSupabase } from "./pro/supabase";

// ============================================================================
// TYPES
// ============================================================================

export type TicketCategory =
  | "reservations"
  | "annulation"
  | "paiement_facturation"
  | "compte"
  | "technique"
  | "partenaires"
  | "autre";

export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type TicketStatus = "open" | "pending" | "in_progress" | "closed";
export type MessageFrom = "user" | "pro" | "admin" | "system";

export type TicketAttachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  dataUrl?: string;
};

export type SupportTicket = {
  id: string;
  subject: string;
  body: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  attachments: TicketAttachment[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  unread_count?: number;
};

export type SupportTicketMessage = {
  id: string;
  ticket_id: string;
  from_role: MessageFrom;
  body: string;
  attachments?: TicketAttachment[];
  created_at: string;
  read_by_user_at?: string | null;
};

export type ChatSession = {
  id: string;
  status: "active" | "closed";
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  session_id: string;
  from_role: MessageFrom;
  body: string;
  message_type: "message" | "system" | "auto_reply";
  created_at: string;
  read_at?: string | null;
};

// ============================================================================
// HELPERS
// ============================================================================

async function getAuthToken(): Promise<string | null> {
  // Try PRO auth first, then consumer auth
  const { data: proData } = await proSupabase.auth.getSession();
  if (proData.session?.access_token) {
    return proData.session.access_token;
  }

  const { data: consumerData } = await consumerSupabase.auth.getSession();
  return consumerData.session?.access_token ?? null;
}

async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Erreur serveur" }));
    throw new Error(error.error || error.message || "Erreur inattendue");
  }

  return response.json();
}

// ============================================================================
// TICKET API
// ============================================================================

/**
 * List support tickets for the authenticated user
 */
export async function listSupportTickets(): Promise<{
  ok: boolean;
  tickets: SupportTicket[];
}> {
  return apiFetch("/api/support/tickets");
}

/**
 * Create a new support ticket
 */
export async function createSupportTicket(params: {
  subject: string;
  message: string;
  category: TicketCategory;
  priority?: TicketPriority;
  establishment_id?: string;
  attachments?: TicketAttachment[];
}): Promise<{ ok: boolean; ticket: SupportTicket }> {
  return apiFetch("/api/support/tickets", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * Get ticket details with messages
 */
export async function getSupportTicket(ticketId: string): Promise<{
  ok: boolean;
  ticket: SupportTicket;
  messages: SupportTicketMessage[];
}> {
  return apiFetch(`/api/support/tickets/${ticketId}`);
}

/**
 * Add a message to a ticket
 */
export async function addSupportTicketMessage(params: {
  ticketId: string;
  body: string;
  attachments?: TicketAttachment[];
}): Promise<{ ok: boolean; message: SupportTicketMessage }> {
  return apiFetch(`/api/support/tickets/${params.ticketId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      body: params.body,
      attachments: params.attachments,
    }),
  });
}

/**
 * Update ticket status (user can close or reopen)
 */
export async function updateSupportTicketStatus(
  ticketId: string,
  status: "open" | "closed"
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/support/tickets/${ticketId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

// ============================================================================
// CHAT API
// ============================================================================

/**
 * Get or create an active chat session
 */
export async function getOrCreateChatSession(params?: {
  establishment_id?: string;
}): Promise<{
  ok: boolean;
  session: ChatSession;
  messages: ChatMessage[];
}> {
  return apiFetch("/api/support/chat/session", {
    method: "POST",
    body: JSON.stringify(params ?? {}),
  });
}

/**
 * Send a chat message
 */
export async function sendChatMessage(params: {
  session_id: string;
  body: string;
}): Promise<{ ok: boolean; message: ChatMessage }> {
  return apiFetch("/api/support/chat/messages", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * Get chat messages (for polling)
 */
export async function getChatMessages(
  sessionId: string,
  after?: string
): Promise<{ ok: boolean; messages: ChatMessage[] }> {
  const url = after
    ? `/api/support/chat/${sessionId}/messages?after=${encodeURIComponent(after)}`
    : `/api/support/chat/${sessionId}/messages`;
  return apiFetch(url);
}

// ============================================================================
// UTILITY FUNCTIONS (kept for compatibility with existing code)
// ============================================================================

export function formatTicketReference(id: string): string {
  const ref = id.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `#${ref}`;
}

export function getTicketCategoryLabel(
  category: TicketCategory,
  t?: (key: string) => string
): string {
  const labels: Record<TicketCategory, string> = {
    reservations: "Réservations",
    annulation: "Annulation",
    paiement_facturation: "Paiement & facturation",
    compte: "Compte",
    technique: "Problème technique",
    partenaires: "Partenaires",
    autre: "Autre",
  };

  if (t) {
    const key = `support.ticket.category.${category}`;
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }

  return labels[category] || labels.autre;
}

export function getTicketPriorityLabel(priority: TicketPriority): string {
  const labels: Record<TicketPriority, string> = {
    low: "Basse",
    normal: "Normal",
    high: "Haute",
    urgent: "Urgent",
  };
  return labels[priority] || labels.normal;
}

export function getTicketStatusLabel(status: TicketStatus): string {
  const labels: Record<TicketStatus, string> = {
    open: "En attente",
    pending: "En attente",
    in_progress: "En cours",
    closed: "Résolu",
  };
  return labels[status] || labels.open;
}

/**
 * Check if support chat is available (9h-19h Casablanca time)
 */
export function isSupportOnline(now = new Date()): boolean {
  // Get Casablanca time
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Casablanca",
    hour: "numeric",
    hour12: false,
  });
  const hour = parseInt(formatter.format(now), 10);
  return hour >= 9 && hour < 19;
}

export function getSupportHoursLabel(): string {
  return "Service client disponible de 9h à 19h";
}
