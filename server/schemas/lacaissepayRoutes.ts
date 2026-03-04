/**
 * LacaissePay Routes — Zod Validation Schemas
 */

import { z } from "../lib/validate";

// POST /api/payments/lacaissepay/session
export const CreateLacaissePaySessionSchema = z.object({
  orderId: z.string().min(1),
  externalReference: z.string().min(1),
  amount: z.number().min(1).max(100000),
  customerEmail: z.string().min(1),
  customerPhone: z.string().min(1),
  customerFirstName: z.string().optional(),
  customerLastName: z.string().optional(),
  acceptUrl: z.string().min(1),
  declineUrl: z.string().min(1),
  notificationUrl: z.string().optional(),
  companyName: z.string().optional(),
});
