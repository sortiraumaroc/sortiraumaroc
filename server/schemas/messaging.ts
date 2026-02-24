/**
 * Messaging Routes — Zod Validation Schemas
 */

import { z } from "zod";

/** POST /api/consumer/messages/conversations */
export const createConversationSchema = z.object({
  userId: z.string().min(1),
  initialMessage: z.string().optional(),
});

/** POST /api/consumer/messages/conversations/:id/messages */
export const sendMessageSchema = z.object({
  content: z.string().min(1),
  messageType: z.string().optional(),
  metadata: z.any().optional(),
});
