/**
 * Zod Schemas for Pro Account Routes
 *
 * Validates pro-facing account management inputs.
 * All schemas use  to avoid breaking handlers that
 * access fields not explicitly listed here.
 */

import { z } from "zod";

// =============================================================================
// Password Management
// =============================================================================

export const RequestPasswordResetSchema = z.object({
  redirect_to: z.string().url().optional(),
});

export const ChangePasswordSchema = z.object({
  new_password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
  current_password: z.string().optional(),
});

// =============================================================================
// Establishment Creation & Onboarding
// =============================================================================

export const CreateProEstablishmentSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis").max(200),
  universe: z.string().optional(),
  city: z.string().optional(),
});

export const CreateProOnboardingRequestSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis").max(200),
  universe: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().max(30).optional(),
  notes: z.string().max(2000).optional(),
});

// =============================================================================
// Onboarding Wizard
// =============================================================================

export const SaveOnboardingWizardProgressSchema = z.object({
  progress: z.object({
    establishment_id: z.string().min(1, "establishment_id est requis"),
  }),
});

// =============================================================================
// Establishment Profile Update
// =============================================================================

export const SubmitEstablishmentProfileUpdateSchema = z.object({
  name: z.string().max(200).optional(),
  universe: z.string().optional(),
  subcategory: z.string().optional(),
  specialties: z.array(z.string()).optional(),
  city: z.string().optional(),
  postal_code: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
  address: z.string().max(500).optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  description_short: z.string().max(500).optional(),
  description_long: z.string().max(5000).optional(),
  phone: z.string().max(30).optional(),
  whatsapp: z.string().max(30).optional(),
  website: z.string().max(500).optional(),
  email: z.string().email().optional(),
  social_links: z.record(z.unknown()).optional(),
  hours: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  amenities: z.array(z.string()).optional(),
  logo_url: z.string().optional(),
  cover_url: z.string().optional(),
  gallery_urls: z.array(z.string()).optional(),
  ambiance_tags: z.array(z.string()).optional(),
  service_types: z.array(z.string()).optional(),
  mix_experience: z.record(z.unknown()).optional(),
  extra: z.record(z.unknown()).optional(),
});
