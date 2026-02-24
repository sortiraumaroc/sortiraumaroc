/**
 * Twilio Auth Routes — Zod Validation Schemas
 */

import { z } from "zod";

/** POST send-code */
export const sendCodeSchema = z.object({
  phoneNumber: z.string().min(1),
});

/** POST verify-code */
export const verifyCodeSchema = z.object({
  phoneNumber: z.string().min(1),
  code: z.string().min(1),
  referralCode: z.string().optional(),
});

/** POST verify-login */
export const verifyLoginSchema = z.object({
  phoneNumber: z.string().min(1),
  code: z.string().min(1),
});

/** POST lookup */
export const lookupSchema = z.object({
  phoneNumber: z.string().min(1),
});

/** POST login-password */
export const loginPasswordSchema = z.object({
  phoneNumber: z.string().min(1),
  password: z.string().min(1),
});

/** POST trusted-login */
export const trustedLoginSchema = z.object({
  phoneNumber: z.string().min(1),
});

/** POST forgot-password */
export const forgotPasswordSchema = z.object({
  phoneNumber: z.string().min(1),
  method: z.string().optional(),
});

/** POST reset-password */
export const resetPasswordSchema = z.object({
  phoneNumber: z.string().min(1),
  code: z.string().min(1),
  newPassword: z.string().min(1),
});
