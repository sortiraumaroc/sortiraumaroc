/**
 * Bug Reports — Zod Validation Schemas
 */

import { z } from "../lib/validate";

// POST /api/bug-reports
export const SubmitBugReportSchema = z.object({
  url: z.string().min(1),
  message: z.string().min(1),
  userAgent: z.string().optional(),
  screenWidth: z.number().optional(),
  screenHeight: z.number().optional(),
  timestamp: z.string().optional(),
  screenshot: z.string().optional(),
});
