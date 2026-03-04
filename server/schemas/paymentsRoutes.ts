/**
 * Payments Webhook Routes — Zod Validation Schemas
 * (separate from server/schemas/payments.ts which covers payment creation schemas)
 *
 * Note: The payments webhook is intentionally NOT validated with strict Zod
 * because it receives arbitrary payloads from external providers (LacaissePay, etc.)
 * with varying shapes. The handler already normalizes the body defensively.
 * We use a permissive passthrough schema as a placeholder for the zBody wiring.
 */

import { z } from "../lib/validate";

// POST /api/payments/webhook — external webhook, body shape varies by provider
export const PaymentsWebhookSchema = z.object({}).passthrough();
