import { z } from "zod";
import { getCasablancaHour } from "@shared/datetime";

export const SUPPORT_DATA_CHANGED_EVENT = "sam-support-data-changed";

const SUPPORT_TICKETS_STORAGE_KEY = "sam_support_tickets_v1";
const SUPPORT_CHAT_STORAGE_KEY = "sam_support_chat_v1";

export type TicketCategory =
  | "reservations"
  | "annulation"
  | "paiement_facturation"
  | "compte"
  | "technique"
  | "partenaires"
  | "autre";

export type TicketStatus = "open" | "in_progress" | "closed";
export type TicketPriority = "normal" | "urgent";
export type SupportMessageFrom = "user" | "support";

export type TicketAttachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string;
};


const ticketCategorySchema = z.enum([
  "reservations",
  "annulation",
  "paiement_facturation",
  "compte",
  "technique",
  "partenaires",
  "autre",
]);

const ticketPrioritySchema = z.enum(["normal", "urgent"]);

const attachmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  size: z.number(),
  type: z.string(),
  dataUrl: z.string(),
});

const messageSchema = z.object({
  id: z.string().min(1),
  from: z.enum(["user", "support"]),
  body: z.string().min(1).max(4000),
  createdAtIso: z.string().min(1),
  attachments: z.array(attachmentSchema).optional(),
});

export type SupportMessage = z.infer<typeof messageSchema>;

const ticketSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1).max(140),
  category: ticketCategorySchema,
  priority: ticketPrioritySchema.optional().default("normal"),
  status: z.enum(["open", "in_progress", "closed"]),
  createdAtIso: z.string().min(1),
  updatedAtIso: z.string().min(1),
  messages: z.array(messageSchema),
  attachments: z.array(attachmentSchema).optional(),
});

export type SupportTicket = z.infer<typeof ticketSchema>;

const chatSchema = z.object({
  updatedAtIso: z.string().min(1),
  messages: z.array(messageSchema),
});

type ChatSession = z.infer<typeof chatSchema>;

function readJson(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(SUPPORT_DATA_CHANGED_EVENT));
}

function makeId(prefix: string): string {
  const cryptoAny = globalThis.crypto as Crypto | undefined;
  const uuid = typeof cryptoAny?.randomUUID === "function" ? cryptoAny.randomUUID() : null;
  if (uuid) return `${prefix}_${uuid}`;
  const rand = Math.random().toString(36).slice(2);
  const now = Date.now().toString(36);
  return `${prefix}_${now}_${rand}`.toUpperCase();
}

export function listSupportTickets(): SupportTicket[] {
  const value = readJson(SUPPORT_TICKETS_STORAGE_KEY);
  const parsed = z.array(ticketSchema).safeParse(value);
  if (!parsed.success) return [];
  return parsed.data
    .slice()
    .sort((a, b) => (a.updatedAtIso < b.updatedAtIso ? 1 : a.updatedAtIso > b.updatedAtIso ? -1 : 0));
}

export function getSupportTicketById(id: string): SupportTicket | null {
  return listSupportTickets().find((t) => t.id === id) ?? null;
}

export function createSupportTicket(params: {
  subject: string;
  category: TicketCategory;
  message: string;
  priority?: TicketPriority;
  attachments?: TicketAttachment[];
}): { ok: true; ticket: SupportTicket } | { ok: false; message: string } {
  const subject = String(params.subject ?? "").trim();
  const message = String(params.message ?? "").trim();
  if (!subject) return { ok: false, message: "Objet requis" };
  if (subject.length > 140) return { ok: false, message: "Objet trop long" };
  if (!message) return { ok: false, message: "Message requis" };

  const parsedCategory = ticketCategorySchema.safeParse(params.category);
  if (!parsedCategory.success) return { ok: false, message: "Catégorie invalide" };

  const parsedPriority = ticketPrioritySchema.safeParse(params.priority ?? "normal");

  const nowIso = new Date().toISOString();
  const ticket: SupportTicket = {
    id: makeId("TICKET"),
    subject,
    category: parsedCategory.data,
    priority: parsedPriority.success ? parsedPriority.data : "normal",
    status: "open",
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    messages: [
      {
        id: makeId("MSG"),
        from: "user",
        body: message,
        createdAtIso: nowIso,
        attachments: params.attachments,
      },
    ],
    attachments: params.attachments,
  };

  const list = listSupportTickets();
  writeJson(SUPPORT_TICKETS_STORAGE_KEY, [ticket, ...list]);
  return { ok: true, ticket };
}

export function addSupportTicketMessage(params: {
  ticketId: string;
  from: SupportMessageFrom;
  body: string;
}): { ok: true; ticket: SupportTicket } | { ok: false; message: string } {
  const ticketId = String(params.ticketId ?? "").trim();
  const body = String(params.body ?? "").trim();
  if (!ticketId) return { ok: false, message: "Ticket invalide" };
  if (!body) return { ok: false, message: "Message requis" };

  const fromParsed = z.enum(["user", "support"]).safeParse(params.from);
  if (!fromParsed.success) return { ok: false, message: "Expéditeur invalide" };

  const ticket = getSupportTicketById(ticketId);
  if (!ticket) return { ok: false, message: "Ticket introuvable" };

  const nowIso = new Date().toISOString();
  const next: SupportTicket = {
    ...ticket,
    updatedAtIso: nowIso,
    messages: [
      ...ticket.messages,
      {
        id: makeId("MSG"),
        from: fromParsed.data,
        body,
        createdAtIso: nowIso,
      },
    ],
  };

  const list = listSupportTickets();
  const updated = [next, ...list.filter((t) => t.id !== ticketId)];
  writeJson(SUPPORT_TICKETS_STORAGE_KEY, updated);
  return { ok: true, ticket: next };
}

export function setSupportTicketStatus(params: { ticketId: string; status: TicketStatus }): void {
  const ticket = getSupportTicketById(params.ticketId);
  if (!ticket) return;
  const statusParsed = z.enum(["open", "in_progress", "closed"]).safeParse(params.status);
  if (!statusParsed.success) return;

  const nowIso = new Date().toISOString();
  const next: SupportTicket = {
    ...ticket,
    status: statusParsed.data,
    updatedAtIso: nowIso,
  };

  const list = listSupportTickets();
  writeJson(SUPPORT_TICKETS_STORAGE_KEY, [next, ...list.filter((t) => t.id !== ticket.id)]);
}

export function getSupportChat(): ChatSession {
  const raw = readJson(SUPPORT_CHAT_STORAGE_KEY);
  const parsed = chatSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const nowIso = new Date().toISOString();
  return { updatedAtIso: nowIso, messages: [] };
}

export function sendSupportChatMessage(params: { body: string; from?: SupportMessageFrom }): { ok: true } | { ok: false; message: string } {
  const body = String(params.body ?? "").trim();
  if (!body) return { ok: false, message: "Message requis" };

  const fromParsed = z.enum(["user", "support"]).safeParse(params.from ?? "user");
  if (!fromParsed.success) return { ok: false, message: "Expéditeur invalide" };

  const nowIso = new Date().toISOString();
  const prev = getSupportChat();
  const next: ChatSession = {
    updatedAtIso: nowIso,
    messages: [
      ...prev.messages,
      {
        id: makeId("MSG"),
        from: fromParsed.data,
        body,
        createdAtIso: nowIso,
      },
    ],
  };

  writeJson(SUPPORT_CHAT_STORAGE_KEY, next);
  return { ok: true };
}

export function isSupportOnline(now = new Date()): boolean {
  const hour = getCasablancaHour(now);
  return hour >= 9 && hour < 19;
}

export type SupportTranslateFn = (key: string, params?: Record<string, string | number | null | undefined>) => string;

function withFallback(t: SupportTranslateFn | undefined, key: string, fallback: string): string {
  if (!t) return fallback;
  const value = t(key);
  return value && value !== key ? value : fallback;
}

export function getSupportHoursLabel(t?: SupportTranslateFn): string {
  return withFallback(t, "support.hours", "Service client disponible de 9h à 19h");
}

export function getTicketCategoryLabel(category: TicketCategory, t?: SupportTranslateFn): string {
  const map: Record<TicketCategory, { key: string; fallback: string }> = {
    reservations: { key: "support.ticket.category.reservations", fallback: "Réservations" },
    annulation: { key: "support.ticket.category.cancellation", fallback: "Annulation" },
    paiement_facturation: { key: "support.ticket.category.billing", fallback: "Paiement & facturation" },
    compte: { key: "support.ticket.category.account", fallback: "Compte" },
    technique: { key: "support.ticket.category.technical", fallback: "Problème technique" },
    partenaires: { key: "support.ticket.category.partners", fallback: "Partenaires" },
    autre: { key: "support.ticket.category.other", fallback: "Autre" },
  };

  const entry = map[category] ?? map.autre;
  return withFallback(t, entry.key, entry.fallback);
}

export function getTicketPriorityLabel(priority: TicketPriority | undefined, t?: SupportTranslateFn): string {
  const map: Record<TicketPriority, { key: string; fallback: string }> = {
    normal: { key: "support.ticket.priority.normal", fallback: "Normal" },
    urgent: { key: "support.ticket.priority.urgent", fallback: "Urgent" },
  };

  const entry = map[priority ?? "normal"] ?? map.normal;
  return withFallback(t, entry.key, entry.fallback);
}

export function getTicketStatusLabel(status: TicketStatus, t?: SupportTranslateFn): string {
  const map: Record<TicketStatus, { key: string; fallback: string }> = {
    open: { key: "support.ticket.status.open", fallback: "En attente" },
    in_progress: { key: "support.ticket.status.in_progress", fallback: "En cours" },
    closed: { key: "support.ticket.status.closed", fallback: "Résolu" },
  };

  const entry = map[status] ?? map.open;
  return withFallback(t, entry.key, entry.fallback);
}

export function formatTicketReference(id: string): string {
  // Extraire les 8 premiers caractères après "TICKET_"
  const ref = id.replace("TICKET_", "").slice(0, 8).toUpperCase();
  return `#${ref}`;
}
