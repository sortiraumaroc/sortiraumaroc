import { z } from "zod";

// GET /api/consumer/wallet/transactions
export const WalletTransactionsQuery = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  per_page: z.coerce.number().int().min(1).max(100).optional().default(20),
  type: z
    .enum(["recharge", "payment", "cashback", "refund", "sent", "received", "link"])
    .optional(),
  status: z.enum(["completed", "pending", "failed"]).optional(),
});

// GET /api/consumer/wallet/transactions/:id
export const WalletTransactionParams = z.object({
  id: z.string().uuid("ID transaction invalide"),
});

// POST /api/consumer/wallet/send
export const WalletSendBody = z
  .object({
    recipientId: z.string().optional(),
    recipientUsername: z.string().optional(),
    recipientPhone: z.string().optional(),
    amount: z.number().min(1, "Montant minimum : 1 MAD").max(50000, "Montant maximum : 50 000 MAD"),
    note: z.string().max(200).optional(),
  })
  .refine(
    (d) => d.recipientId || d.recipientUsername || d.recipientPhone,
    { message: "recipientId, recipientUsername ou recipientPhone requis" },
  );

// POST /api/consumer/wallet/recharge
export const WalletRechargeBody = z.object({
  amount: z.number().min(10, "Montant minimum : 10 MAD").max(5000, "Montant maximum : 5 000 MAD"),
});

// GET /api/consumer/wallet/contacts/search
export const WalletContactSearchQuery = z.object({
  q: z.string().min(1).max(100),
});

// POST /api/consumer/wallet/cards
export const WalletAddCardBody = z.object({
  token: z.string().min(1),
  last4: z.string().length(4, "last4 doit avoir 4 caractères"),
  network: z.enum(["visa", "mastercard", "other"]),
  expiry: z.string().regex(/^\d{2}\/\d{2}$/, "Format: MM/YY"),
});

// DELETE/PUT /api/consumer/wallet/cards/:id
export const WalletCardParams = z.object({
  id: z.string().uuid("ID carte invalide"),
});

// POST /api/consumer/wallet/pin
export const WalletPinBody = z.object({
  current_pin: z.string().optional(),
  new_pin: z.string().regex(/^\d{4,6}$/, "PIN : 4 à 6 chiffres"),
});

// PUT /api/consumer/wallet/settings
export const WalletSettingsBody = z.object({
  notif_payment_received: z.boolean().optional(),
  notif_payment_sent: z.boolean().optional(),
  notif_recharges: z.boolean().optional(),
});
