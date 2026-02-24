/**
 * Loyalty V2 Public Routes — Zod Validation Schemas
 * Params schemas for consumer-facing loyalty endpoints.
 */

import { z, zUuid } from "../lib/validate";

// =============================================================================
// Params Schemas (URL route parameters)
// =============================================================================

/** :cardId param for loyalty card detail (UUID) */
export const CardIdParams = z.object({ cardId: zUuid });

/** :giftId param for gift claim (UUID) */
export const GiftIdParams = z.object({ giftId: zUuid });

/** :id param for establishment loyalty lookup (UUID) */
export const LoyaltyEstablishmentIdParams = z.object({ id: zUuid });
