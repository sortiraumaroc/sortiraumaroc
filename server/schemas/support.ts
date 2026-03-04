/**
 * Zod Schemas for Support Routes
 */
import { z } from "zod";
import { zUuid } from "../lib/validate";

// ── Route Params ────────────────────────────────────────────────────────────

/** :sessionId */
export const SupportSessionIdParams = z.object({ sessionId: zUuid });

/** :userId */
export const SupportUserIdParams = z.object({ userId: zUuid });

/** :establishmentId */
export const SupportEstablishmentIdParams = z.object({ establishmentId: zUuid });

// ── Consumer / Public ────────────────────────────────────────────────────────

export const CreateSupportTicketSchema = z.object({
  subject: z.string().optional(),
  message: z.string().optional(),
  category: z.string().optional(),
  priority: z.string().optional(),
  establishment_id: z.string().optional(),
  contact_email: z.string().optional(),
  contact_name: z.string().optional(),
  attachments: z.array(z.any()).optional(),
});

export const AddSupportTicketMessageSchema = z.object({
  body: z.string().optional(),
  attachments: z.array(z.any()).optional(),
});

export const UpdateSupportTicketStatusSchema = z.object({
  status: z.string().optional(),
});

// ── Chat ─────────────────────────────────────────────────────────────────────

export const GetOrCreateChatSessionSchema = z.object({
  establishment_id: z.string().optional(),
});

export const SendChatMessageSchema = z.object({
  session_id: z.string(),
  body: z.string(),
});

// ── Admin ────────────────────────────────────────────────────────────────────

export const PostAdminSupportTicketMessageSchema = z.object({
  body: z.string().optional(),
  is_internal: z.boolean().optional(),
});

export const UpdateAdminSupportTicketSchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  assigned_to_collaborator_id: z.string().nullable().optional(),
});

export const SendAdminChatMessageSchema = z.object({
  body: z.string(),
});

export const ToggleAgentStatusSchema = z.object({
  is_online: z.boolean(),
  agent_name: z.string().optional(),
});

export const UpdateTicketInternalNotesSchema = z.object({
  notes: z.string().optional(),
});
