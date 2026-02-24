/**
 * Email Verification Routes — Zod Validation Schemas
 */

import { z } from "zod";

/** POST send */
export const emailSendCodeSchema = z.object({
  email: z.string().min(1),
  code: z.string().min(1),
  recaptchaToken: z.string().optional(),
});

/** POST verify */
export const emailVerifyCodeSchema = z.object({
  email: z.string().min(1),
  code: z.string().min(1),
});

/** POST signup */
export const emailSignupSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  referralCode: z.string().optional(),
});

/** POST set-email-password */
export const setEmailPasswordSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});
