/**
 * Conciergerie Routes — Zod Validation Schemas
 */

import { z, zUuid } from "../lib/validate";

// POST /api/conciergerie/journeys
export const CreateJourneySchema = z.object({
  client_name: z.string().min(1),
  client_phone: z.string().optional(),
  client_email: z.string().optional(),
  client_notes: z.string().optional(),
  party_size: z.number().int().min(1),
  title: z.string().optional(),
  desired_date: z.string().min(1),
  desired_time_start: z.string().optional(),
  desired_time_end: z.string().optional(),
  city: z.string().optional(),
  steps: z.array(z.object({
    step_order: z.number().int().optional(),
    universe: z.string().optional(),
    category: z.string().optional(),
    description: z.string().optional(),
    budget_min: z.number().optional(),
    budget_max: z.number().optional(),
  })).min(1),
});

// PUT /api/conciergerie/journeys/:id
export const UpdateJourneySchema = z.object({
  client_name: z.string().optional(),
  client_phone: z.string().optional(),
  client_email: z.string().optional(),
  client_notes: z.string().optional(),
  party_size: z.number().int().optional(),
  title: z.string().optional(),
  desired_date: z.string().optional(),
  desired_time_start: z.string().optional(),
  desired_time_end: z.string().optional(),
  city: z.string().optional(),
  steps: z.array(z.object({
    step_order: z.number().int().optional(),
    universe: z.string().optional(),
    category: z.string().optional(),
    description: z.string().optional(),
    budget_min: z.number().optional(),
    budget_max: z.number().optional(),
  })).optional(),
});

// POST /api/conciergerie/steps/:stepId/requests
export const SendStepRequestsSchema = z.object({
  establishment_ids: z.array(z.string()).min(1).max(5),
  message: z.string().optional(),
});

// =============================================================================
// Params Schemas (URL route parameters)
// =============================================================================

/** :id param for journeys (UUID) */
export const JourneyIdParams = z.object({ id: zUuid });

/** :stepId param for journey steps (UUID) */
export const StepIdParams = z.object({ stepId: zUuid });

/** :stepRequestId param for conciergerie scan QR (UUID) */
export const StepRequestIdParams = z.object({ stepRequestId: zUuid });
