/**
 * Wallet Routes — Zod Validation Schemas
 */

import { z } from "zod";

/** POST /api/wallet/apple, POST /api/wallet/google */
export const createBookingPassSchema = z.object({
  bookingReference: z.string().min(1),
  restaurantName: z.string().min(1),
  date: z.string().optional(),
  time: z.string().optional(),
  partySize: z.number().optional(),
  guestName: z.string().optional(),
  guestPhone: z.string().optional(),
  qrCodeUrl: z.string().optional(),
  establishmentId: z.string().optional(),
  address: z.string().optional(),
  userId: z.string().optional(),
});

/** POST /api/wallet/user/apple, POST /api/wallet/user/google */
export const createUserPassSchema = z.object({
  userId: z.string().min(1),
  userName: z.string().min(1),
  userEmail: z.string().optional(),
  userPhone: z.string().optional(),
  memberSince: z.string().optional(),
  reliabilityLevel: z.string().optional(),
  reservationsCount: z.number().optional(),
});
