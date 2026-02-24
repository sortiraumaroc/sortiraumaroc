/**
 * Zod Schemas for Payment Routes
 *
 * Validates webhook payloads and payment-related API inputs.
 * These schemas protect the most critical financial flows.
 */

import { z } from "zod";

// =============================================================================
// LacaissePay Webhook Payload
// =============================================================================

/**
 * Schema for LacaissePay payment webhook body.
 * Validates the critical fields needed for payment processing.
 */
export const LacaissePayWebhookSchema = z.object({
  event: z.enum(["payment.success", "payment.failed", "payment.pending"], {
    errorMap: () => ({ message: "Type d'événement webhook inconnu" }),
  }),
  data: z.object({
    transaction_id: z.string().min(1, "transaction_id requis"),
    amount: z.number().positive("Montant doit être positif"),
    currency: z.string().default("MAD"),
    status: z.string(),
    metadata: z.record(z.unknown()).optional().default({}),
  }),
}).passthrough(); // Webhook externe — payload imprévisible

// =============================================================================
// Checkout / Session Creation
// =============================================================================

/** Schema for creating a payment session (reservation) */
export const CreateReservationPaymentSchema = z.object({
  reservationId: z.string().uuid("ID réservation invalide"),
  returnUrl: z.string().url("URL de retour invalide").optional(),
});

/** Schema for creating a payment session (pack purchase) */
export const CreatePackPaymentSchema = z.object({
  packId: z.string().uuid("ID pack invalide"),
  quantity: z.number().int().min(1).max(99).default(1),
  returnUrl: z.string().url("URL de retour invalide").optional(),
});

/** Schema for wallet recharge */
export const WalletRechargeSchema = z.object({
  amount: z.number().int().min(100, "Montant minimum: 1 MAD (100 centimes)").max(1_000_000, "Montant maximum dépassé"),
  walletId: z.string().uuid("ID wallet invalide"),
  returnUrl: z.string().url("URL de retour invalide").optional(),
});

/** Schema for visibility order payment */
export const VisibilityOrderPaymentSchema = z.object({
  orderId: z.string().uuid("ID commande invalide"),
  returnUrl: z.string().url("URL de retour invalide").optional(),
});

// =============================================================================
// Inferred types
// =============================================================================

export type LacaissePayWebhookPayload = z.infer<typeof LacaissePayWebhookSchema>;
export type CreateReservationPayment = z.infer<typeof CreateReservationPaymentSchema>;
export type CreatePackPayment = z.infer<typeof CreatePackPaymentSchema>;
export type WalletRecharge = z.infer<typeof WalletRechargeSchema>;
export type VisibilityOrderPayment = z.infer<typeof VisibilityOrderPaymentSchema>;
